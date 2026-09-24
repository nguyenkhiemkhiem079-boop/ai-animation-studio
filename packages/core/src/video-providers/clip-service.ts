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
import { LLMProvider } from '../llm/llm-provider.js';
import { VisualSemanticQAEvaluator } from '../qa/visual-semantic-qa-evaluator.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClipType = 'PREVIEW_CLIP' | 'MASTER_PRODUCTION';
export type ClipStatus = 'READY' | 'RETAKE_RECOMMENDED' | 'WAITING_FOR_PROVIDER' | 'FAILED';

export interface ClipServiceOptions {
  /** GEMINI_API_KEY. Defaults to process.env.GEMINI_API_KEY */
  apiKey?: string;
  /** LLM Provider for multimodal vision QA (optional) */
  llm?: LLMProvider;
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
  qaReport?: {
    mediaSha256: string;
    model: string;
    providerTrust: string;
    mechanism: string;
    scores: {
      overall: number | null;
      defects: number | null;
      spatial: number | null;
      identity: number | null;
    };
    defects: Array<{ defectId: string; severity: string; description: string }>;
    retakeRecommendations: Array<{ strategy: string; rationale: string }>;
  };
  generatedAt: string;
  downloadedAt: string;
  /** Reason for RETAKE_RECOMMENDED or FAILED status */
  failureReason?: string;
}

// ─── ClipService ──────────────────────────────────────────────────────────────

export class ClipService {
  private readonly provider: GeminiVeoVideoProvider;
  private readonly llm?: LLMProvider;
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
    this.llm = options.llm;
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
    let qaReport: ClipResult['qaReport'] | undefined;

    if (runQA) {
      const qaOutcome = await this._executeVisualQA(veoResult.physicalPath, req.prompt, verification);
      qaStatus = qaOutcome.status;
      qaDetails = qaOutcome.details;
      qaReport = qaOutcome.report;
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
      qaReport,
      generatedAt: veoResult.generatedAt,
      downloadedAt: veoResult.downloadedAt,
    };
  }

  /**
   * Resumes an existing clip operation by clipId (e.g. after crash recovery).
   */
  public async resumeClip(projectId: string, clipId: string, options: { enableQA?: boolean } = {}): Promise<ClipResult> {
    const runQA = options.enableQA !== undefined ? options.enableQA : this.enableQA;
    let veoResult: VeoGenerateResult;
    try {
      veoResult = await this.provider.resumeOperation(projectId, clipId);
    } catch (err: any) {
      if (err instanceof VeoQuotaError) {
        return this._buildFailedResult({ prompt: clipId }, clipId, '', 'PREVIEW_CLIP', 'WAITING_FOR_PROVIDER', err.message);
      }
      return this._buildFailedResult({ prompt: clipId }, clipId, '', 'PREVIEW_CLIP', 'FAILED', `Resume failed: ${err?.message}`);
    }

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

    let qaStatus: ClipResult['qaStatus'] = 'SKIPPED';
    let qaDetails: string | undefined;
    let qaReport: ClipResult['qaReport'] | undefined;

    if (runQA) {
      const qaOutcome = await this._executeVisualQA(veoResult.physicalPath, clipId, verification);
      qaStatus = qaOutcome.status;
      qaDetails = qaOutcome.details;
      qaReport = qaOutcome.report;
    }

    const status: ClipStatus = qaStatus === 'FAIL' ? 'RETAKE_RECOMMENDED' : 'READY';

    return {
      status,
      clipType: 'PREVIEW_CLIP',
      clipId: veoResult.clipId,
      physicalPath: veoResult.physicalPath,
      sha256: veoResult.sha256,
      sizeBytes: veoResult.sizeBytes,
      provider: 'google-veo',
      model: veoResult.model,
      operationName: veoResult.operationName,
      prompt: clipId,
      promptHash: '',
      ffprobe,
      qaStatus,
      qaDetails,
      qaReport,
      generatedAt: veoResult.generatedAt,
      downloadedAt: veoResult.downloadedAt,
    };
  }

  private async _executeVisualQA(
    physicalPath: string,
    prompt: string,
    verification: ReturnType<typeof ArtifactVerifier.verify>
  ): Promise<{ status: 'PASS' | 'FAIL' | 'WARN'; details: string; report?: ClipResult['qaReport'] }> {
    if (this.llm && (typeof (this.llm as any).isConfigured !== 'function' || (this.llm as any).isConfigured())) {
      try {
        const evaluator = new VisualSemanticQAEvaluator(this.llm);
        const shotContract: any = {
          id: 'preview_shot',
          sceneId: 'preview_scene',
          shotNumber: 1,
          purpose: 'action',
          complexity: 'simple_generative_video',
          rendererIntent: 'generative_full_video',
          frame: { durationSeconds: verification.durationSeconds ?? 5, aspectRatio: '16:9', targetFps: verification.fps ?? 24 },
          camera: { focalLength: '35mm', shotSize: 'medium', angle: 'eye_level', movement: 'static', semanticSkills: [] },
          lighting: { keyLightDirection: 'front', mood: 'natural', colorTemperature: 'neutral', fogAtmosphere: false },
          composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
          acting: [],
          transition: { type: 'cut', durationSeconds: 0 },
          audioCue: { sfx: [] },
          requiredAssetIds: [],
          dependsOnShotIds: [],
          directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
          provenance: { decidedAt: new Date().toISOString() },
        };
        const rep = await evaluator.evaluateShotVideo({
          projectId: 'preview',
          shot: shotContract,
          videoPath: physicalPath,
          executionMode: 'LOCAL',
        });
        const qaStatus = rep.passed ? 'PASS' : 'FAIL';
        return {
          status: qaStatus,
          details: `Vision QA ${qaStatus} (score: ${rep.overallVisualContinuityScore?.toFixed(2) ?? 'N/A'}, defects: ${rep.defects.length})`,
          report: {
            mediaSha256: (rep as any).mediaSha256 ?? '',
            model: (rep.metadata as any)?.modelUsed ?? 'gemini-vision',
            providerTrust: (rep.metadata as any)?.providerTrust ?? 'LIVE_EXTERNAL',
            mechanism: rep.evaluationMechanism,
            scores: {
              overall: rep.overallVisualContinuityScore,
              defects: rep.visualDefectScore,
              spatial: rep.spatialPerspectiveScore,
              identity: rep.identityConsistencyScore,
            },
            defects: rep.defects.map((d) => ({ defectId: d.defectId, severity: d.severity, description: d.description })),
            retakeRecommendations: rep.retakeRecommendations.map((r) => ({ strategy: r.strategy, rationale: r.rationale })),
          },
        };
      } catch {
        // Fall back to lightweight QA
      }
    }
    return this._runLightweightQA(physicalPath, verification);
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
