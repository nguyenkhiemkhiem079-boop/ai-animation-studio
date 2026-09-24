/**
 * ClipService
 *
 * Orchestrates the full one-prompt → video pipeline:
 *
 *   1. Preflight (quota check)
 *   2. Submit Veo generation (or resume existing operation)
 *   3. Poll until done
 *   4. Download MP4
 *   5. FFprobe verification
 *   6. SHA-256 checksum
 *   7. Visual QA (optional, opt-out via --no-qa)
 *   8. Return ClipResult
 *
 * Distinguishes PREVIEW_CLIP from MASTER_PRODUCTION:
 *   - PREVIEW_CLIP: no human approval ceremony, outputs immediately.
 *   - MASTER_PRODUCTION: handled by ProductionOrchestrator with full canon flow.
 *
 * This service handles PREVIEW_CLIP only.
 */

import * as path from 'node:path';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { GeminiVeoVideoProvider, VeoGenerateRequest, VeoGenerateResult, VeoQuotaError, VeoTimeoutError, VeoGenerationProfile, VEO_MODEL_MAP } from './gemini-veo-provider.js';
import { VeoOperationStore } from './veo-operation-store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClipType = 'PREVIEW_CLIP' | 'MASTER_PRODUCTION';
export type ClipStatus = 'READY' | 'RETAKE_RECOMMENDED' | 'WAITING_FOR_PROVIDER' | 'FAILED';

export interface ClipServiceOptions {
  /** GEMINI_API_KEY. Defaults to process.env.GEMINI_API_KEY */
  apiKey?: string;
  /** Enable Visual QA after download (default: true) */
  enableQA?: boolean;
  /** Default output directory for clips */
  outputBaseDir?: string;
  /** Generation profile (default: ECONOMY) */
  profile?: VeoGenerationProfile;
  /** Operation store base directory */
  operationStoreDir?: string;
  /** Poll interval override in ms */
  pollIntervalMs?: number;
  /** Max poll attempts override */
  maxPollAttempts?: number;
}

export interface ClipRequest {
  /** The text prompt for generation */
  prompt: string;
  /** Clip type — only PREVIEW_CLIP is handled here */
  clipType?: ClipType;
  /** Override model */
  model?: string;
  /** Aspect ratio: '16:9' | '9:16' */
  aspectRatio?: string;
  /** Resolution: '720p' | '1080p' */
  resolution?: string;
  /** Duration hint in seconds */
  durationSeconds?: number;
  /** Project ID for file organization */
  projectId?: string;
  /** Override output path for the final MP4 */
  outputPath?: string;
  /** Enable QA (overrides service-level setting) */
  enableQA?: boolean;
  /** Generation profile override */
  profile?: VeoGenerationProfile;
}

export interface FFprobeEvidence {
  hasVideoStream: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  sizeBytes: number;
}

export interface ClipResult {
  status: ClipStatus;
  clipType: ClipType;
  clipId: string;
  physicalPath: string;
  sha256: string;
  sizeBytes: number;
  provider: string;
  model: string;
  operationName: string;
  prompt: string;
  promptHash: string;
  ffprobe: FFprobeEvidence;
  qaStatus?: 'PASS' | 'FAIL' | 'WARN' | 'SKIPPED';
  qaDetails?: string;
  generatedAt: string;
  downloadedAt: string;
  /** Reason for RETAKE_RECOMMENDED or FAILED status */
  failureReason?: string;
}

// ─── ClipService ──────────────────────────────────────────────────────────────

export class ClipService {
  private readonly provider: GeminiVeoVideoProvider;
  private readonly enableQA: boolean;
  private readonly outputBaseDir: string;

  constructor(options: ClipServiceOptions = {}) {
    this.provider = new GeminiVeoVideoProvider({
      apiKey: options.apiKey,
      operationStoreDir: options.operationStoreDir ?? '.studio/veo-operations',
      pollIntervalMs: options.pollIntervalMs,
      maxPollAttempts: options.maxPollAttempts,
      defaultProfile: options.profile ?? 'ECONOMY',
      allowLiveCalls: true,
    });
    this.enableQA = options.enableQA ?? true;
    this.outputBaseDir = options.outputBaseDir ?? '.studio/clips';
  }

  /**
   * Full one-prompt → verified clip pipeline.
   * Returns a ClipResult with status READY, RETAKE_RECOMMENDED, WAITING_FOR_PROVIDER, or FAILED.
   */
  public async generateClip(req: ClipRequest): Promise<ClipResult> {
    const clipType: ClipType = req.clipType ?? 'PREVIEW_CLIP';
    const projectId = req.projectId ?? 'default';
    const promptHash = VeoOperationStore.hashPrompt(req.prompt);
    const clipId = `clip_${Date.now()}_${promptHash.slice(0, 8)}`;

    const outputDir = req.outputPath
      ? path.dirname(req.outputPath)
      : path.join(this.outputBaseDir, projectId, clipId);

    // ── Preflight ──────────────────────────────────────────────────────────
    if (!this.provider.isConfigured()) {
      throw new Error(
        'ClipService: GeminiVeoVideoProvider is not configured. Set GEMINI_API_KEY environment variable.'
      );
    }

    // ── Generate ───────────────────────────────────────────────────────────
    const veoReq: VeoGenerateRequest = {
      prompt: req.prompt,
      aspectRatio: req.aspectRatio ?? '16:9',
      resolution: req.resolution ?? '720p',
      durationSeconds: req.durationSeconds ?? 5,
      numberOfVideos: 1,
      profile: req.profile ?? 'ECONOMY',
      model: req.model,
      projectId,
      clipId,
      outputDir,
    };

    let veoResult: VeoGenerateResult;
    try {
      veoResult = await this.provider.generateClip(veoReq);
    } catch (err: any) {
      if (err instanceof VeoQuotaError) {
        return this._buildFailedResult(req, clipId, promptHash, clipType, 'WAITING_FOR_PROVIDER', err.message);
      }
      if (err instanceof VeoTimeoutError) {
        return this._buildFailedResult(req, clipId, promptHash, clipType, 'FAILED', err.message);
      }
      return this._buildFailedResult(req, clipId, promptHash, clipType, 'FAILED', `Generation error: ${err?.message}`);
    }

    // ── FFprobe verification ───────────────────────────────────────────────
    const verification = ArtifactVerifier.verify(veoResult.physicalPath, {
      requireVideoStream: true,
      requireValidMedia: true,
    });

    const ffprobe: FFprobeEvidence = {
      hasVideoStream: verification.hasVideoStream ?? false,
      durationSeconds: verification.durationSeconds ?? null,
      width: verification.width ?? null,
      height: verification.height ?? null,
      fps: verification.fps ?? null,
      codec: verification.videoCodec ?? null,
      sizeBytes: verification.sizeBytes ?? veoResult.sizeBytes,
    };

    if (!verification.hasVideoStream) {
      return {
        status: 'RETAKE_RECOMMENDED',
        clipType,
        clipId: veoResult.clipId,
        physicalPath: veoResult.physicalPath,
        sha256: veoResult.sha256,
        sizeBytes: veoResult.sizeBytes,
        provider: 'google-veo',
        model: veoResult.model,
        operationName: veoResult.operationName,
        prompt: req.prompt,
        promptHash,
        ffprobe,
        qaStatus: 'SKIPPED',
        generatedAt: veoResult.generatedAt,
        downloadedAt: veoResult.downloadedAt,
        failureReason: 'Downloaded file has no valid video stream.',
      };
    }

    // ── Visual QA (optional) ───────────────────────────────────────────────
    const runQA = req.enableQA !== undefined ? req.enableQA : this.enableQA;
    let qaStatus: ClipResult['qaStatus'] = 'SKIPPED';
    let qaDetails: string | undefined;

    if (runQA) {
      const qaOutcome = await this._runLightweightQA(veoResult.physicalPath, verification);
      qaStatus = qaOutcome.status;
      qaDetails = qaOutcome.details;
    }

    const status: ClipStatus =
      qaStatus === 'FAIL' ? 'RETAKE_RECOMMENDED' : 'READY';

    return {
      status,
      clipType,
      clipId: veoResult.clipId,
      physicalPath: veoResult.physicalPath,
      sha256: veoResult.sha256,
      sizeBytes: veoResult.sizeBytes,
      provider: 'google-veo',
      model: veoResult.model,
      operationName: veoResult.operationName,
      prompt: req.prompt,
      promptHash,
      ffprobe,
      qaStatus,
      qaDetails,
      generatedAt: veoResult.generatedAt,
      downloadedAt: veoResult.downloadedAt,
    };
  }

  /**
   * Lightweight QA for preview clips:
   *   - Checks video stream presence
   *   - Checks duration is non-trivial (>0.5s)
   *   - Checks resolution is reasonable (width ≥ 128)
   *   - Non-zero file size
   *
   * For MASTER_PRODUCTION, the full VisualSemanticQAEvaluator (multimodal Gemini)
   * is used by ProductionOrchestrator, not here.
   */
  private async _runLightweightQA(
    physicalPath: string,
    verification: ReturnType<typeof ArtifactVerifier.verify>
  ): Promise<{ status: 'PASS' | 'FAIL' | 'WARN'; details: string }> {
    const issues: string[] = [];

    if (!verification.hasVideoStream) {
      issues.push('No video stream detected.');
    }
    if ((verification.durationSeconds ?? 0) < 0.5) {
      issues.push(`Duration too short: ${verification.durationSeconds ?? 0}s`);
    }
    if ((verification.width ?? 0) < 128) {
      issues.push(`Resolution too small: ${verification.width ?? 0}x${verification.height ?? 0}`);
    }
    if ((verification.sizeBytes ?? 0) < 1024) {
      issues.push('File size suspiciously small (<1KB).');
    }

    if (issues.length === 0) {
      return { status: 'PASS', details: 'All basic integrity checks passed.' };
    }

    // Duration/size warnings vs hard failures
    const hasCritical = issues.some((i) => i.includes('No video stream') || i.includes('too small'));
    return {
      status: hasCritical ? 'FAIL' : 'WARN',
      details: issues.join(' | '),
    };
  }

  private _buildFailedResult(
    req: ClipRequest,
    clipId: string,
    promptHash: string,
    clipType: ClipType,
    status: ClipStatus,
    failureReason: string
  ): ClipResult {
    return {
      status,
      clipType,
      clipId,
      physicalPath: '',
      sha256: '',
      sizeBytes: 0,
      provider: 'google-veo',
      model: req.model ?? 'unknown',
      operationName: '',
      prompt: req.prompt,
      promptHash,
      ffprobe: {
        hasVideoStream: false,
        durationSeconds: null,
        width: null,
        height: null,
        fps: null,
        codec: null,
        sizeBytes: 0,
      },
      qaStatus: 'SKIPPED',
      generatedAt: new Date().toISOString(),
      downloadedAt: new Date().toISOString(),
      failureReason,
    };
  }

  /** Provider health diagnostics. */
  public async diagnose() {
    return this.provider.diagnoseHealth();
  }

  /** List available configured models and profiles. */
  public listModels(): Array<{ profile: string; model: string; isDefault: boolean }> {
    return Object.entries(VEO_MODEL_MAP).map(([profile, model]) => ({
      profile,
      model: model as string,
      isDefault: profile === 'ECONOMY',
    }));
  }
}
