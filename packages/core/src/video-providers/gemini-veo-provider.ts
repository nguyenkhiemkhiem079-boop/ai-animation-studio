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

// ─── Generation Profile & Models ──────────────────────────────────────────────

export type VeoGenerationProfile = 'ECONOMY' | 'BALANCED' | 'QUALITY';

/** Explicit legacy fallback model for backward compatibility (not default) */
export const VEO_LEGACY_MODEL = 'veo-2.0-generate-001';

/** Model identifiers, in preference order per profile. Configurable via environment variables. */
export const VEO_MODEL_MAP: Record<VeoGenerationProfile, string> = {
  ECONOMY: process.env.VEO_MODEL_ECONOMY || 'veo-3.1-lite-generate-preview',
  BALANCED: process.env.VEO_MODEL_BALANCED || 'veo-3.1-fast-generate-preview',
  QUALITY: process.env.VEO_MODEL_QUALITY || 'veo-3.1-generate-preview',
};

/** Resolve active model identifier from profile and optional override. */
export function resolveVeoModel(profile: VeoGenerationProfile = 'ECONOMY', modelOverride?: string): string {
  if (modelOverride) return modelOverride;
  return VEO_MODEL_MAP[profile] ?? VEO_MODEL_MAP.ECONOMY;
}

// ─── Modality & Validation ───────────────────────────────────────────────────

export type VeoModality = 'text-to-video' | 'image-to-video' | 'reference-image' | 'interpolation';

export class VeoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VeoValidationError';
  }
}

/** Detect video generation modality from request inputs */
export function detectVeoModality(req: {
  modality?: VeoModality;
  image?: unknown;
  firstFrame?: unknown;
  lastFrame?: unknown;
  referenceImages?: unknown[];
}): VeoModality {
  if (req.modality) return req.modality;
  if ((req.image || req.firstFrame) && req.lastFrame) return 'interpolation';
  if (req.referenceImages && req.referenceImages.length > 0) return 'reference-image';
  if (req.image || req.firstFrame) return 'image-to-video';
  return 'text-to-video';
}

/**
 * Resolve personGeneration semantics based on modality.
 * For current Veo 3.1 Gemini API contract:
 *   - TEXT-TO-VIDEO: 'allow_all'
 *   - IMAGE-TO-VIDEO: 'allow_adult'
 *   - INTERPOLATION: 'allow_adult'
 *   - REFERENCE IMAGES: 'allow_adult'
 */
export function resolvePersonGeneration(
  modality: VeoModality,
  requested?: string
): string {
  const allowed = ['dont_allow', 'allow_adult', 'allow_all'];
  if (requested) {
    if (!allowed.includes(requested)) {
      throw new VeoValidationError(
        `Invalid personGeneration "${requested}". Supported values are: ${allowed.join(', ')}.`
      );
    }
    return requested;
  }

  switch (modality) {
    case 'text-to-video':
      return 'allow_all';
    case 'image-to-video':
      return 'allow_adult';
    case 'reference-image':
      return 'allow_adult';
    case 'interpolation':
      return 'allow_adult';
    default:
      return 'allow_adult';
  }
}

/**
 * Validates Veo generation request parameters locally before invoking the API.
 * Allowed duration values: 4, 6, 8.
 * 1080p and 4k require duration of 8 seconds.
 * Reference image generations require duration of 8 seconds where required.
 */
export function validateVeoRequest(req: VeoGenerateRequest): {
  durationSeconds: number;
  personGeneration: string;
  modality: VeoModality;
} {
  const modality = detectVeoModality(req);

  // Determine duration (default: 8s for 1080p/4k/ref-image, 4s for economy/standard preview)
  let duration = req.durationSeconds;
  if (duration === undefined) {
    const res = req.resolution?.toLowerCase();
    if (res === '1080p' || res === '4k' || modality === 'reference-image') {
      duration = 8;
    } else {
      duration = 4; // Default preview: 4 seconds for ECONOMY where supported
    }
  }

  // Allowed duration values: strictly 4, 6, or 8
  const ALLOWED_DURATIONS = [4, 6, 8];
  if (!ALLOWED_DURATIONS.includes(duration)) {
    throw new VeoValidationError(
      `Invalid duration ${duration}s. Veo only supports durations of 4, 6, or 8 seconds.`
    );
  }

  const resLower = req.resolution?.toLowerCase();
  if (resLower === '1080p' && duration !== 8) {
    throw new VeoValidationError(
      `1080p resolution requires duration of 8 seconds (received ${duration}s).`
    );
  }

  if (resLower === '4k' && duration !== 8) {
    throw new VeoValidationError(
      `4k resolution requires duration of 8 seconds (received ${duration}s).`
    );
  }

  if (modality === 'reference-image' && duration !== 8) {
    throw new VeoValidationError(
      `Reference image video generation requires duration of 8 seconds (received ${duration}s).`
    );
  }

  const personGeneration = resolvePersonGeneration(modality, req.personGeneration);

  return {
    durationSeconds: duration,
    personGeneration,
    modality,
  };
}

// ─── Input / Output types ─────────────────────────────────────────────────────

export interface VeoGenerateRequest {
  /** Text-to-video prompt */
  prompt: string;
  /** Optional negative prompt */
  negativePrompt?: string;
  /** Aspect ratio: '16:9' | '9:16' | '1:1' */
  aspectRatio?: string;
  /** Resolution: '720p' | '1080p' | '4k' */
  resolution?: string;
  /** Duration in seconds (allowed: 4, 6, 8) */
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
  /** Modality: text-to-video, image-to-video, reference-image, interpolation */
  modality?: VeoModality;
  /** Person generation control */
  personGeneration?: 'dont_allow' | 'allow_adult' | 'allow_all' | string;
  /** Input image for image-to-video */
  image?: unknown;
  /** First frame for video generation */
  firstFrame?: unknown;
  /** Last frame for interpolation */
  lastFrame?: unknown;
  /** Reference images */
  referenceImages?: unknown[];
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
   * The client may expose: .models.generateVideos(), .operations.getVideosOperation(), and .files.download()
   */
  clientFactory?: () => { models: any; operations: any; files?: any };
}

export class GeminiVeoVideoProvider implements IProvider {
  public readonly metadata: ProviderMetadata;
  private readonly apiKey: string | undefined;
  private readonly operationStore: VeoOperationStore;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly defaultProfile: VeoGenerationProfile;
  private readonly allowLiveCalls: boolean;
  private readonly clientFactory?: () => { models: any; operations: any; files?: any };

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
      costEstimateUsdPerInvocation: 0.35,
      averageLatencyMs: 120_000,
    };
  }

  public isConfigured(): boolean {
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
      details: `Configured. Default profile: ${this.defaultProfile}. Default model: ${resolveVeoModel(this.defaultProfile)}`,
    };
  }

  // ─── IProvider.execute (generic task wrapper) ─────────────────────────────

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const defaultDuration = (input?.resolution === '1080p' || input?.resolution === '4k') ? 8 : 4;
    const req: VeoGenerateRequest = {
      prompt: input?.promptPacket?.positivePrompt ?? input?.prompt ?? 'Cinematic shot',
      negativePrompt: input?.promptPacket?.negativePrompt ?? input?.negativePrompt,
      aspectRatio: input?.aspectRatio ?? '16:9',
      resolution: input?.resolution ?? '720p',
      durationSeconds: input?.durationSeconds ?? defaultDuration,
      numberOfVideos: 1,
      profile: input?.profile ?? this.defaultProfile,
      model: input?.model,
      projectId: task.projectId ?? input?.projectId ?? 'default',
      clipId: task.shotId ? `clip_${task.shotId}` : undefined,
      outputDir: input?.outputDir,
      modality: input?.modality,
      personGeneration: input?.personGeneration,
      image: input?.image,
      firstFrame: input?.firstFrame,
      lastFrame: input?.lastFrame,
      referenceImages: input?.referenceImages,
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
   * Rejects invalid request parameter combinations locally before calling the API.
   *
   * Crash recovery: if a SUBMITTED/POLLING operation with the same
   * projectId+promptHash already exists in the store, resumes polling
   * that operation instead of submitting a new one.
   */
  public async generateClip(req: VeoGenerateRequest): Promise<VeoGenerateResult> {
    // ── Local parameter validation (rejects invalid combinations before API call) ──
    const validated = validateVeoRequest(req);

    if (!this.isConfigured()) {
      throw new VeoGenerationError(
        'GeminiVeoVideoProvider is not configured. Set GEMINI_API_KEY and pass --live.'
      );
    }

    const promptHash = VeoOperationStore.hashPrompt(req.prompt);
    const projectId = req.projectId ?? 'default';
    const clipId = req.clipId ?? `clip_${Date.now()}_${promptHash.slice(0, 8)}`;
    const model = req.model ?? resolveVeoModel(req.profile ?? this.defaultProfile);
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
      durationSeconds: validated.durationSeconds,
      personGeneration: validated.personGeneration,
    };
    if (req.negativePrompt) config.negativePrompt = req.negativePrompt;
    if (req.seed !== undefined) config.seed = req.seed;
    if (req.referenceImages) config.referenceImages = req.referenceImages;
    if (req.lastFrame) config.lastFrame = req.lastFrame;

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
      durationSeconds: validated.durationSeconds,
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
   * Safe to call multiple times — queries API for current state.
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

    currentRecord = this.operationStore.update(record.projectId, record.clipId, { status: 'POLLING' });

    for (; pollCount < this.maxPollAttempts; pollCount++) {
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
        console.warn(`[VeoProvider] Transient poll error (attempt ${pollCount}): ${err?.message}`);
        this.operationStore.update(record.projectId, record.clipId, { pollCount });
        continue;
      }

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
        const outputPath = path.resolve(outputDir, 'clip.mp4');

        // Prefer official @google/genai SDK: ai.files.download(...)
        let downloaded = false;
        if (client.files && typeof client.files.download === 'function') {
          try {
            const targetFile = firstVideo?.video ?? firstVideo;
            await client.files.download({
              file: targetFile,
              downloadPath: outputPath,
            });
            downloaded = fs.existsSync(outputPath);
          } catch (sdkErr: any) {
            console.warn(`[VeoProvider] SDK files.download encountered error, trying fallback: ${sdkErr?.message}`);
          }
        }

        if (!downloaded) {
          if (videoBytes) {
            fs.writeFileSync(outputPath, Buffer.from(videoBytes, 'base64'));
            downloaded = true;
          } else if (videoUri) {
            await this._downloadAuthenticatedFile(videoUri, outputPath);
            downloaded = true;
          }
        }

        if (!downloaded || !fs.existsSync(outputPath)) {
          throw new VeoGenerationError(
            'Veo response could not be downloaded via SDK files.download or authenticated fallback.'
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
    }

    // Timed out
    this.operationStore.update(record.projectId, record.clipId, {
      status: 'POLLING',
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

  private _getClient(): { models: any; operations: any; files?: any } {
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

  private _sanitizeUrl(rawUrl: string): string {
    return rawUrl.replace(/([?&](?:key|api_key|apiKey)=)[^&]+/gi, '$1[REDACTED]');
  }

  /**
   * Downloads a file from a URL with proper authentication headers.
   * Strips/redacts sensitive keys from error messages and logs.
   */
  private async _downloadAuthenticatedFile(
    url: string,
    destPath: string,
    redirectsLeft = 5
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (redirectsLeft === 0) {
        reject(new Error(`Too many redirects downloading ${this._sanitizeUrl(url)}`));
        return;
      }
      const protocol = url.startsWith('https') ? https : http;
      const headers: Record<string, string> = {
        'User-Agent': 'ai-animation-studio/1.0',
      };
      if (this.apiKey) {
        headers['x-goog-api-key'] = this.apiKey;
      }
      const req = protocol.get(url, { headers }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this._downloadAuthenticatedFile(res.headers.location, destPath, redirectsLeft - 1));
          return;
        }
        if (res.statusCode && res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode} for ${this._sanitizeUrl(url)}`));
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', (err) => {
          reject(new Error(`Write stream error: ${err.message}`));
        });
      });
      req.on('error', (err) => {
        reject(new Error(`Download network error for ${this._sanitizeUrl(url)}: ${err.message}`));
      });
    });
  }
}

