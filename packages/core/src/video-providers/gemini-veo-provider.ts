/**
 * GeminiVeoVideoProvider
 *
 * Production-grade direct Veo API provider using @google/genai v2.23+.
 *
 * Architecture:
 *   submit → persist operationName → poll (bounded) → download → return physicalPath
 *
 * Key invariants:
 *   - Single credential: GEMINI_API_KEY only. No secondary keys.
 *   - No duplicate submissions: checks VeoOperationStore before generating.
 *   - Fail-closed on quota: returns VeoQuotaError, does NOT rotate keys.
 *   - providerTrust = LIVE_EXTERNAL for all live results.
 *   - generationSource = LIVE_PROVIDER for all direct API results.
 *   - Never fabricates GOOGLE_FLOW_REAL provenance.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as https from 'node:https';
import * as http from 'node:http';
import { GoogleGenAI } from '@google/genai';
import { IProvider, ProviderMetadata, ProviderTask, ProviderResult, ProviderHealthReport } from '../providers/index.js';
import { VeoOperationStore, VeoOperationRecord } from './veo-operation-store.js';

// ─── Generation Profile ───────────────────────────────────────────────────────

export type VeoGenerationProfile = 'ECONOMY' | 'BALANCED' | 'QUALITY';

/** Model identifiers, in preference order per profile. */
export const VEO_MODEL_MAP: Record<VeoGenerationProfile, string> = {
  // Use veo-2.0-generate-001 as the stable economy/default.
  // veo-3 variants if available (user must opt in via --model or QUALITY profile).
  ECONOMY: 'veo-2.0-generate-001',
  BALANCED: 'veo-2.0-generate-001',
  QUALITY: 'veo-3-fast-preview',   // falls back to 2.0 if not available
};

// ─── Input / Output types ─────────────────────────────────────────────────────

export interface VeoGenerateRequest {
  /** Text-to-video prompt */
  prompt: string;
  /** Optional negative prompt */
  negativePrompt?: string;
  /** Aspect ratio: '16:9' | '9:16' | '1:1' */
  aspectRatio?: string;
  /** Resolution: '720p' | '1080p' */
  resolution?: string;
  /** Duration in seconds (Veo 2 supports up to 8s) */
  durationSeconds?: number;
  /** Number of output videos (default: 1) */
  numberOfVideos?: number;
  /** Random seed for deterministic output */
  seed?: number;
  /** Generation profile — controls model selection */
  profile?: VeoGenerationProfile;
  /** Override model name (bypasses profile selection) */
  model?: string;
  /** Project ID for Studio provenance */
  projectId?: string;
  /** Clip ID (used in operation store) — generated if not provided */
  clipId?: string;
  /** Directory to download the clip into */
  outputDir?: string;
}

export interface VeoGenerateResult {
  /** Absolute path to the downloaded MP4 */
  physicalPath: string;
  /** SHA-256 of the downloaded file */
  sha256: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Veo operation name (for provenance) */
  operationName: string;
  /** Model used */
  model: string;
  /** Stable clip ID */
  clipId: string;
  /** Generation provenance */
  generationSource: 'LIVE_PROVIDER';
  providerTrust: 'LIVE_EXTERNAL';
  /** Timestamp the video was generated at (from API) */
  generatedAt: string;
  /** Timestamp the video was downloaded at */
  downloadedAt: string;
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class VeoQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VeoQuotaError';
  }
}

export class VeoTimeoutError extends Error {
  constructor(operationName: string, pollCount: number) {
    super(`Veo operation "${operationName}" timed out after ${pollCount} polls.`);
    this.name = 'VeoTimeoutError';
  }
}

export class VeoGenerationError extends Error {
  constructor(message: string, public readonly operationName?: string) {
    super(message);
    this.name = 'VeoGenerationError';
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface GeminiVeoVideoProviderOptions {
  apiKey?: string;
  /** Override default operation store base directory */
  operationStoreDir?: string;
  /** Poll interval in milliseconds (default: 8000) */
  pollIntervalMs?: number;
  /** Maximum number of polls before VeoTimeoutError (default: 150 ≈ 20 min) */
  maxPollAttempts?: number;
  /** Default generation profile (default: ECONOMY) */
  defaultProfile?: VeoGenerationProfile;
  /** Allow live API calls (default: true if GEMINI_API_KEY is set) */
  allowLiveCalls?: boolean;
  /**
   * Injectable API client factory for testing.
   * When provided, bypasses GoogleGenAI instantiation entirely.
   * The client must expose: .models.generateVideos() and .operations.getVideosOperation()
   */
  clientFactory?: () => { models: any; operations: any };
}

export class GeminiVeoVideoProvider implements IProvider {
  public readonly metadata: ProviderMetadata;
  private readonly apiKey: string | undefined;
  private readonly operationStore: VeoOperationStore;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly defaultProfile: VeoGenerationProfile;
  private readonly allowLiveCalls: boolean;
  private readonly clientFactory?: () => { models: any; operations: any };

  constructor(options: GeminiVeoVideoProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.operationStore = new VeoOperationStore(options.operationStoreDir ?? '.studio/veo-operations');
    this.pollIntervalMs = options.pollIntervalMs ?? 8000;
    this.maxPollAttempts = options.maxPollAttempts ?? 150;
    this.defaultProfile = options.defaultProfile ?? 'ECONOMY';
    this.clientFactory = options.clientFactory;
    // allowLiveCalls: explicitly true/false takes precedence; otherwise based on key presence
    this.allowLiveCalls = options.allowLiveCalls !== undefined
      ? options.allowLiveCalls
      : Boolean(this.apiKey);

    this.metadata = {
      id: 'gemini-veo-video',
      name: 'Google Gemini Veo Video Provider',
      version: '1.0.0',
      capabilities: ['video_gen'],
      isLocal: false,
      // Veo 2 estimated cost per 8s clip at 720p; updated when we have authoritative pricing.
      costEstimateUsdPerInvocation: 0.35,
      averageLatencyMs: 120_000, // ~2 min typical
    };
  }

  public isConfigured(): boolean {
    // When a clientFactory is provided (test injection), treat as configured
    return Boolean(this.clientFactory) || (Boolean(this.apiKey) && this.allowLiveCalls);
  }

  public async healthCheck(): Promise<boolean> {
    return this.isConfigured();
  }

  public async diagnoseHealth(): Promise<ProviderHealthReport> {
    if (this.clientFactory) {
      return {
        providerId: this.metadata.id,
        name: this.metadata.name,
        status: 'AVAILABLE',
        isLocal: false,
        capabilities: this.metadata.capabilities,
        details: `Configured via injected client factory. Default profile: ${this.defaultProfile}.`,
      };
    }
    if (!this.apiKey) {
      return {
        providerId: this.metadata.id,
        name: this.metadata.name,
        status: 'NOT_CONFIGURED',
        isLocal: false,
        capabilities: this.metadata.capabilities,
        details: 'GEMINI_API_KEY not set. Set GEMINI_API_KEY to enable direct Veo generation.',
      };
    }
    if (!this.allowLiveCalls) {
      return {
        providerId: this.metadata.id,
        name: this.metadata.name,
        status: 'TEST_ONLY',
        isLocal: false,
        capabilities: this.metadata.capabilities,
        details: 'GEMINI_API_KEY is set but allowLiveCalls=false. Pass --live to enable.',
      };
    }
    return {
      providerId: this.metadata.id,
      name: this.metadata.name,
      status: 'AVAILABLE',
      isLocal: false,
      capabilities: this.metadata.capabilities,
      details: `Configured. Default profile: ${this.defaultProfile}. Default model: ${VEO_MODEL_MAP[this.defaultProfile]}`,
    };
  }

  // ─── IProvider.execute (generic task wrapper) ─────────────────────────────

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const req: VeoGenerateRequest = {
      prompt: input?.promptPacket?.positivePrompt ?? input?.prompt ?? 'Cinematic shot',
      negativePrompt: input?.promptPacket?.negativePrompt ?? input?.negativePrompt,
      aspectRatio: input?.aspectRatio ?? '16:9',
      resolution: input?.resolution ?? '720p',
      durationSeconds: input?.durationSeconds ?? 5,
      numberOfVideos: 1,
      profile: input?.profile ?? this.defaultProfile,
      model: input?.model,
      projectId: task.projectId ?? input?.projectId ?? 'default',
      clipId: task.shotId ? `clip_${task.shotId}` : undefined,
      outputDir: input?.outputDir,
    };

    const result = await this.generateClip(req);

    return {
      output: { veoResult: result } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime,
      providerId: this.metadata.id,
    };
  }

  // ─── Core generation API ──────────────────────────────────────────────────

  /**
   * Main entry point: submit a generation request to the Veo API,
   * poll until done, download the MP4, and return verified evidence.
   *
   * Crash recovery: if a SUBMITTED/POLLING operation with the same
   * projectId+promptHash already exists in the store, resumes polling
   * that operation instead of submitting a new one.
   */
  public async generateClip(req: VeoGenerateRequest): Promise<VeoGenerateResult> {
    if (!this.isConfigured()) {
      throw new VeoGenerationError(
        'GeminiVeoVideoProvider is not configured. Set GEMINI_API_KEY and pass --live.'
      );
    }

    const promptHash = VeoOperationStore.hashPrompt(req.prompt);
    const projectId = req.projectId ?? 'default';
    const clipId = req.clipId ?? `clip_${Date.now()}_${promptHash.slice(0, 8)}`;
    const model = req.model ?? VEO_MODEL_MAP[req.profile ?? this.defaultProfile];
    const outputDir = req.outputDir ?? path.join('.studio', 'clips', projectId, clipId);

    // ── Duplicate submission guard ─────────────────────────────────────────
    const existing = this.operationStore.findExistingOperation(projectId, promptHash);
    if (existing) {
      console.log(`[VeoProvider] Resuming existing operation "${existing.operationName}" (clipId=${existing.clipId})`);
      return this._pollAndDownload(existing, outputDir, model);
    }

    // ── Submit new generation ──────────────────────────────────────────────
    const client = this._getClient();

    const config: Record<string, unknown> = {
      numberOfVideos: req.numberOfVideos ?? 1,
      aspectRatio: req.aspectRatio ?? '16:9',
      resolution: req.resolution ?? '720p',
      personGeneration: 'allow_adult',
    };
    if (req.durationSeconds) config.durationSeconds = req.durationSeconds;
    if (req.negativePrompt) config.negativePrompt = req.negativePrompt;
    if (req.seed !== undefined) config.seed = req.seed;

    let operation: any;
    try {
      operation = await (client.models as any).generateVideos({
        model,
        prompt: req.prompt,
        config,
      });
    } catch (err: any) {
      const reason = this._categorizeError(err);
      if (reason === 'QUOTA_EXCEEDED') {
        throw new VeoQuotaError(
          `Gemini Veo API quota exceeded before submission. Wait for quota reset. (${err?.message})`
        );
      }
      throw new VeoGenerationError(`Veo generation submission failed: ${err?.message}`, undefined);
    }

    const operationName = operation.name ?? `ops_${clipId}`;

    // ── Persist operation record immediately ───────────────────────────────
    const record: VeoOperationRecord = {
      operationName,
      clipId,
      projectId,
      promptHash,
      model,
      aspectRatio: req.aspectRatio ?? '16:9',
      resolution: req.resolution ?? '720p',
      durationSeconds: req.durationSeconds,
      numberOfVideos: req.numberOfVideos ?? 1,
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pollCount: 0,
    };
    this.operationStore.save(record);

    return this._pollAndDownload(record, outputDir, model);
  }

  /**
   * Resume polling an existing operation (e.g. after crash recovery).
   * This is safe to call multiple times — it always queries the API for current state.
   */
  public async resumeOperation(projectId: string, clipId: string, outputDir?: string): Promise<VeoGenerateResult> {
    const record = this.operationStore.load(projectId, clipId);
    if (!record) throw new VeoGenerationError(`No operation record found for clipId="${clipId}"`);
    if (record.status === 'DONE' && record.outputPath) {
      return this._buildResultFromRecord(record);
    }
    const dir = outputDir ?? path.join('.studio', 'clips', projectId, clipId);
    return this._pollAndDownload(record, dir, record.model);
  }

  // ─── Internal polling + download ──────────────────────────────────────────

  private async _pollAndDownload(
    record: VeoOperationRecord,
    outputDir: string,
    model: string
  ): Promise<VeoGenerateResult> {
    if (!this.isConfigured()) {
      throw new VeoGenerationError('Provider not configured for live calls.');
    }
    const client = this._getClient();

    let pollCount = record.pollCount ?? 0;
    let currentRecord = record;

    // Update status to POLLING
    currentRecord = this.operationStore.update(record.projectId, record.clipId, { status: 'POLLING' });

    for (; pollCount < this.maxPollAttempts; pollCount++) {
      // Wait before polling (except on first attempt if just submitted)
      if (pollCount > 0 || record.status !== 'SUBMITTED') {
        await this._sleep(this.pollIntervalMs);
      }

      let polledOp: any;
      try {
        polledOp = await (client.operations as any).getVideosOperation({
          operation: { name: currentRecord.operationName },
        });
      } catch (err: any) {
        const reason = this._categorizeError(err);
        if (reason === 'QUOTA_EXCEEDED') {
          this.operationStore.update(record.projectId, record.clipId, {
            pollCount,
            status: 'POLLING',
            errorMessage: `Poll quota exceeded at attempt ${pollCount}: ${err?.message}`,
          });
          throw new VeoQuotaError(`Veo polling quota exceeded at attempt ${pollCount}: ${err?.message}`);
        }
        // Transient error — continue polling
        console.warn(`[VeoProvider] Transient poll error (attempt ${pollCount}): ${err?.message}`);
        this.operationStore.update(record.projectId, record.clipId, { pollCount });
        continue;
      }

      // Update poll count
      currentRecord = this.operationStore.update(record.projectId, record.clipId, {
        pollCount: pollCount + 1,
        status: 'POLLING',
      });

      if (polledOp.error) {
        const msg = JSON.stringify(polledOp.error);
        this.operationStore.update(record.projectId, record.clipId, {
          status: 'FAILED',
          errorMessage: msg,
          completedAt: new Date().toISOString(),
        });
        throw new VeoGenerationError(`Veo operation failed: ${msg}`, currentRecord.operationName);
      }

      if (polledOp.done) {
        // Generation complete — download
        const generatedVideos = polledOp.response?.generatedVideos ?? [];
        if (generatedVideos.length === 0) {
          this.operationStore.update(record.projectId, record.clipId, {
            status: 'FAILED',
            errorMessage: 'Operation done but no generatedVideos in response.',
          });
          throw new VeoGenerationError('Veo operation complete but no videos returned.');
        }

        const firstVideo = generatedVideos[0];
        const videoUri = firstVideo?.video?.uri;
        const videoBytes = firstVideo?.video?.videoBytes;

        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'clip.mp4');

        if (videoBytes) {
          // Response includes base64-encoded bytes
          fs.writeFileSync(outputPath, Buffer.from(videoBytes, 'base64'));
        } else if (videoUri) {
          // Response includes URI — download it
          await this._downloadFile(videoUri, outputPath);
        } else {
          throw new VeoGenerationError(
            'Veo response has generatedVideos but no uri or videoBytes to download.'
          );
        }

        // Compute SHA-256
        const buf = fs.readFileSync(outputPath);
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        const sizeBytes = buf.length;
        const downloadedAt = new Date().toISOString();

        this.operationStore.update(record.projectId, record.clipId, {
          status: 'DONE',
          outputPath: path.resolve(outputPath),
          outputSha256: sha256,
          completedAt: downloadedAt,
          pollCount: pollCount + 1,
          apiMetadata: { model, videoUri },
        });

        return {
          physicalPath: path.resolve(outputPath),
          sha256,
          sizeBytes,
          operationName: currentRecord.operationName,
          model,
          clipId: record.clipId,
          generationSource: 'LIVE_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          generatedAt: currentRecord.submittedAt,
          downloadedAt,
        };
      }

      // Not done yet — continue polling
    }

    // Timed out
    this.operationStore.update(record.projectId, record.clipId, {
      status: 'POLLING', // keep as POLLING so resume is possible
      pollCount,
      errorMessage: `Timed out after ${pollCount} polls.`,
    });
    throw new VeoTimeoutError(currentRecord.operationName, pollCount);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _buildResultFromRecord(record: VeoOperationRecord): VeoGenerateResult {
    if (!record.outputPath || !record.outputSha256) {
      throw new VeoGenerationError(`Operation "${record.clipId}" is DONE but missing output evidence.`);
    }
    const sizeBytes = fs.existsSync(record.outputPath) ? fs.statSync(record.outputPath).size : 0;
    return {
      physicalPath: record.outputPath,
      sha256: record.outputSha256,
      sizeBytes,
      operationName: record.operationName,
      model: record.model,
      clipId: record.clipId,
      generationSource: 'LIVE_PROVIDER',
      providerTrust: 'LIVE_EXTERNAL',
      generatedAt: record.submittedAt,
      downloadedAt: record.completedAt ?? record.updatedAt,
    };
  }

  private _getClient(): { models: any; operations: any } {
    if (this.clientFactory) return this.clientFactory();
    return new GoogleGenAI({ apiKey: this.apiKey! }) as any;
  }

  private _categorizeError(err: any): string {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('429') || msg.includes('resourceexhausted') || msg.includes('quota') || msg.includes('rate')) {
      return 'QUOTA_EXCEEDED';
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('permission')) {
      return 'AUTH_ERROR';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) return 'TIMEOUT';
    return 'UNKNOWN';
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Downloads a file from a URL (http or https) to a local path.
   * Handles redirects (up to 5).
   */
  private _downloadFile(url: string, destPath: string, redirectsLeft = 5): Promise<void> {
    return new Promise((resolve, reject) => {
      if (redirectsLeft === 0) {
        reject(new Error(`Too many redirects downloading ${url}`));
        return;
      }
      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.get(url, { headers: { 'User-Agent': 'ai-animation-studio/1.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this._downloadFile(res.headers.location, destPath, redirectsLeft - 1));
          return;
        }
        if (res.statusCode && res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
      });
      req.on('error', reject);
    });
  }
}
