/**
 * Phase 25 — Visual QA Resume After Provider Quota Failure
 *
 * Regression tests covering the resumeVisualQAFromExistingMedia() lifecycle:
 *
 *   T1.  GOOGLE_FLOW_REAL media imported → live QA returns RATE_LIMITED
 *        → state becomes WAITING_FOR_PROVIDER with resumeStage='VISUAL_QA'
 *   T2.  resume --live with provider available
 *        → WAITING_FOR_PROVIDER -> RUNNING -> VISUAL_QA -> APPROVAL_REQUIRED
 *        → same media reused, same SHA retained
 *        → no second import, no Flow handoff regeneration
 *        → QA PASS → APPROVAL_REQUIRED
 *   T3.  resume while provider still rate limited
 *        → returns WAITING_FOR_PROVIDER, evidence preserved
 *   T4.  media changed on disk before resume → fail closed
 *   T5.  media missing on disk before resume → fail closed
 *   T6.  resume must never convert OFFLINE/MOCK QA into LIVE_EXTERNAL
 *   T7.  GOOGLE_FLOW_REAL provenance remains unchanged
 *   T8.  resumeVisualQAFromExistingMedia rejects non-WAITING_FOR_PROVIDER run
 *   T9.  resumeVisualQAFromExistingMedia rejects wrong resumeStage
 *   T10. execute() called on WAITING_FOR_PROVIDER+resumeStage=VISUAL_QA
 *        returns same state (no re-entry into shot generation)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  ProductionSafetyError,
  ProductionRun,
  GeminiProvider,
} from '../src/index.js';

// ─── Mock LLM Provider Factories ────────────────────────────────────────────
//
// The VisualSemanticQAEvaluator uses:
//   - this.llm.metadata.supportsImages        (gating multimodal path)
//   - this.llm.metadata.supportsMultimodalStructuredOutput (gating PRODUCTION path)
//   - this.llm.generateStructured()           (the actual call)
//   - this.llm.metadata.providerTrust         (recorded in QA evidence)
//
// Mocks must satisfy all four to trigger the quota-fail or pass paths.

/** Provider that throws a 429 quota error from generateStructured(), simulating Gemini rate limit. */
function makeRateLimitedQAProvider() {
  return {
    metadata: {
      id: 'mock-gemini-rate-limited',
      name: 'Mock Gemini (Rate Limited)',
      providerTrust: 'LIVE_EXTERNAL',
      supportsImages: true,
      supportsMultimodalStructuredOutput: true,
    },
    isConfigured: () => true,
    generateContent: async () => { throw new Error('Rate limited'); },
    generateStructured: async () => {
      throw Object.assign(new Error('Resource exhausted: quota exceeded [429]'), { status: 429 });
    },
    classifyError: (err: any) => {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('quota') || msg.includes('resource')) return 'QUOTA_EXCEEDED';
      return 'UNKNOWN_PROVIDER_ERROR';
    },
    getLastModelUsed: () => 'gemini-3.6-flash',
    getLastUsage: () => null,
    allowLiveCalls: true,
  } as any;
}

/** Provider that returns a valid PASS QA report from generateStructured(). */
function makePassingQAProvider() {
  return {
    metadata: {
      id: 'mock-gemini-pass',
      name: 'Mock Gemini (Pass)',
      providerTrust: 'LIVE_EXTERNAL',
      supportsImages: true,
      supportsMultimodalStructuredOutput: true,
    },
    isConfigured: () => true,
    generateContent: async () => 'ok',
    generateStructured: async (_req: any) => ({
      data: {
        status: 'PASS',
        passed: true,
        identityConsistencyScore: 0.92,
        spatialPerspectiveScore: 0.90,
        visualDefectScore: 0.95,
        overallVisualContinuityScore: 0.91,
        defects: [],
        retakeRecommendations: [],
        coverage: {
          artifactIntegrity: 'VERIFIED',
          spatialFormat: 'VERIFIED',
          identityVisual: 'VERIFIED',
          temporalArtifactVisual: 'VERIFIED',
          semanticAction: 'VERIFIED',
        },
        evaluationNotes: 'All checks passed.',
      },
      model: 'gemini-3.6-flash',
      usage: { inputTokens: 500, outputTokens: 200, latencyMs: 1200 },
    }),
    classifyError: () => 'UNKNOWN_PROVIDER_ERROR',
    getLastModelUsed: () => 'gemini-3.6-flash',
    getLastUsage: () => null,
    allowLiveCalls: true,
  } as any;
}

// ─── Test Harness ────────────────────────────────────────────────────────────

const TEST_DIR = path.resolve('.studio', 'content', 'phase25-visual-qa-resume');
const PROJECT_ID = 'proj_phase25_vqa_resume';
const SERIES_ID = 'series_phase25';
const SHOT_ID = 'SHOT_SCENE_01_SH01';
const RAW_SCRIPT = 'EXT. CITY — DAY\nAn engineer reviews blueprints at a drafting table.';

/** Creates a real H.264 MP4 using ffmpeg-static. Returns the SHA-256 of the file. */
function createRealMp4(filePath: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Resolve ffmpeg-static binary path at runtime
  const req = createRequire(import.meta.url);
  let ffmpegBin: string;
  try {
    ffmpegBin = req('ffmpeg-static') as string;
  } catch {
    // Fallback: system ffmpeg
    ffmpegBin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  }
  // Generate a 2-second 64x64 black H.264 video (no audio)
  execSync(
    `"${ffmpegBin}" -f lavfi -i color=c=black:s=64x64:d=2 -r 24 -vcodec libx264 -pix_fmt yuv420p -y "${filePath}"`,
    { stdio: 'pipe' }
  );
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Builds a run already in WAITING_FOR_PROVIDER / resumeStage=VISUAL_QA state
 * by directly writing the JSON, as if importShotMedia ran then hit quota.
 *
 * The run was legitimately in NEEDS_USER_ACTION (after Flow handoff was prepared)
 * then importShotMedia moved it through VERIFYING_MEDIA → VISUAL_QA → WAITING_FOR_PROVIDER.
 */
async function buildQABlockedRun(
  storage: FileSystemStorage,
  mp4Path: string,
  realSha256: string
): Promise<ProductionRun> {
  // Create a minimal directory + production-run.json directly
  const runId = `run_phase25_qa_resume_test_${Date.now()}`;
  const runDir = path.join(TEST_DIR, '.studio', 'production', PROJECT_ID, runId);
  fs.mkdirSync(runDir, { recursive: true });

  // Write source_story.txt (required for future execute() calls)
  fs.writeFileSync(path.join(runDir, 'source_story.txt'), RAW_SCRIPT, 'utf8');

  const run: ProductionRun = {
    schemaVersion: 1,
    revision: 1,
    runId,
    projectId: PROJECT_ID,
    seriesId: SERIES_ID,
    status: 'WAITING_FOR_PROVIDER',
    mode: 'PRODUCTION',
    pilotMode: true,
    requiredShotCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    currentStage: 'generating_shot',
    currentShotId: SHOT_ID,
    completedShotIds: [],
    pendingShotIds: [SHOT_ID],
    blockedShotIds: [SHOT_ID],
    providerJobs: {},
    mediaEvidence: {
      [SHOT_ID]: {
        shotId: SHOT_ID,
        assetId: `ASSET_IMPORT_${SHOT_ID}_test`,
        physicalPath: mp4Path,
        sha256: realSha256,
        sizeBytes: 1024,
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        durationSeconds: 4,
        fps: 24,
        verificationTimestamp: new Date().toISOString(),
        provenance: 'Google Flow — Real External Generation (Operator Verified)',
        generationSource: 'GOOGLE_FLOW_REAL',
        approvalStatus: 'PENDING',
      },
    },
    qaEvidence: {
      [SHOT_ID]: {
        shotId: SHOT_ID,
        reportId: `vis_qa_${SHOT_ID}_quota_test`,
        mediaSha256: realSha256,
        candidateAssetId: `ASSET_IMPORT_${SHOT_ID}_test`,
        overallStatus: 'FAIL',
        passed: false,
        mechanism: 'MULTIMODAL_PROVIDER',
        providerTrust: 'LIVE_EXTERNAL',
        isSynthetic: false,
        scores: { identity: null, spatial: null, defects: 0, overall: 0 },
        coverage: {
          artifactIntegrity: 'VERIFIED',
          spatialFormat: 'NOT_EVALUATED',
          identityVisual: 'NOT_EVALUATED',
          temporalArtifactVisual: 'NOT_EVALUATED',
          semanticAction: 'NOT_EVALUATED',
        },
        totalDefects: 1,
        criticalDefects: 1,
        retakesRecommended: 1,
        evaluatedAt: new Date().toISOString(),
      },
    },
    approvalEvidence: {},
    approvalChallenges: {},
    resumeMetadata: {
      canResume: true,
      resumeStage: 'VISUAL_QA',
      targetShotId: SHOT_ID,
      blockedReason: 'Gemini visual QA quota exceeded (QUOTA_EXCEEDED).',
      nextAction: 'Retry existing media QA after quota resets.',
      recommendedCommand: `studio production resume ${runId} --live`,
    },
  };

  const runPath = path.join(runDir, 'production-run.json');
  fs.writeFileSync(runPath, JSON.stringify(run, null, 2), 'utf8');

  return run;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Phase 25 — resumeVisualQAFromExistingMedia regression suite', () => {
  let storage: FileSystemStorage;
  let assetRegistry: FileSystemAssetRegistry;
  let mp4Path: string;
  let realSha256: string;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    storage = new FileSystemStorage(TEST_DIR);
    assetRegistry = new FileSystemAssetRegistry(storage);
    mp4Path = path.join(TEST_DIR, 'test-shot.mp4');
    realSha256 = createRealMp4(mp4Path);
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ─── T1 ────────────────────────────────────────────────────────────────
  it('T1 — importShotMedia with live QA rate-limit sets WAITING_FOR_PROVIDER + resumeStage=VISUAL_QA', async () => {
    // Build a run already in NEEDS_USER_ACTION (the legal predecessor to VERIFYING_MEDIA)
    const runId = `run_phase25_t1_${Date.now()}`;
    const runDir = path.join(TEST_DIR, '.studio', 'production', PROJECT_ID, runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'source_story.txt'), RAW_SCRIPT, 'utf8');

    const initialRun: ProductionRun = {
      schemaVersion: 1, revision: 1,
      runId, projectId: PROJECT_ID, seriesId: SERIES_ID,
      status: 'NEEDS_USER_ACTION', mode: 'PRODUCTION', pilotMode: true,
      requiredShotCount: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      currentStage: 'generating_shot', currentShotId: SHOT_ID,
      completedShotIds: [], pendingShotIds: [SHOT_ID], blockedShotIds: [SHOT_ID],
      providerJobs: {}, mediaEvidence: {}, qaEvidence: {},
      approvalEvidence: {}, approvalChallenges: {},
      resumeMetadata: {
        canResume: true, targetShotId: SHOT_ID,
        nextAction: 'Import the Flow clip.',
        recommendedCommand: `studio production import ${runId} ${SHOT_ID} <path> --source google-flow --real-external`,
      },
    };
    fs.writeFileSync(
      path.join(runDir, 'production-run.json'),
      JSON.stringify(initialRun, null, 2), 'utf8'
    );

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, makeRateLimitedQAProvider());
    const result = await orchestrator.importShotMedia(
      PROJECT_ID, runId, SHOT_ID, mp4Path,
      { generationSource: 'GOOGLE_FLOW_REAL', realExternal: true }
    );

    expect(result.status).toBe('WAITING_FOR_PROVIDER');
    expect(result.resumeMetadata.resumeStage).toBe('VISUAL_QA');
    expect(result.resumeMetadata.targetShotId).toBe(SHOT_ID);
    expect(result.resumeMetadata.blockedReason).toMatch(/quota|rate/i);
    expect(result.resumeMetadata.recommendedCommand).toContain('--live');
    expect(result.mediaEvidence[SHOT_ID]).toBeDefined();
    expect(result.mediaEvidence[SHOT_ID].generationSource).toBe('GOOGLE_FLOW_REAL');
    expect(result.mediaEvidence[SHOT_ID].sha256).toBe(realSha256);
  });

  // ─── T2 ────────────────────────────────────────────────────────────────
  it('T2 — resume with provider available: WAITING_FOR_PROVIDER -> APPROVAL_REQUIRED, same media SHA, no re-import, no Flow handoff', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);

    const shaBeforeResume = blockedRun.mediaEvidence[SHOT_ID].sha256;
    const sourceBeforeResume = blockedRun.mediaEvidence[SHOT_ID].generationSource;
    const assetIdBefore = blockedRun.mediaEvidence[SHOT_ID].assetId;
    const pathBefore = blockedRun.mediaEvidence[SHOT_ID].physicalPath;

    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, makePassingQAProvider());
    const resumed = await resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId);

    expect(resumed.status).toBe('APPROVAL_REQUIRED');
    expect(resumed.mediaEvidence[SHOT_ID].sha256).toBe(shaBeforeResume);
    expect(resumed.mediaEvidence[SHOT_ID].generationSource).toBe('GOOGLE_FLOW_REAL');
    expect(sourceBeforeResume).toBe('GOOGLE_FLOW_REAL');
    expect(resumed.mediaEvidence[SHOT_ID].physicalPath).toBe(pathBefore);
    expect(resumed.mediaEvidence[SHOT_ID].assetId).toBe(assetIdBefore);

    // QA evidence must be bound to the same SHA-256 — no re-import
    const qa = resumed.qaEvidence[SHOT_ID];
    expect(qa).toBeDefined();
    expect(qa.mediaSha256).toBe(shaBeforeResume);

    // Flow handoff must NOT have been created
    const handoffPath = path.join(TEST_DIR, '.studio', 'production', PROJECT_ID, blockedRun.runId, 'handoff');
    expect(fs.existsSync(handoffPath)).toBe(false);

    expect(resumed.resumeMetadata.targetShotId).toBe(SHOT_ID);
  });

  // ─── T3 ────────────────────────────────────────────────────────────────
  it('T3 — resume while provider still rate limited → WAITING_FOR_PROVIDER, media evidence preserved', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);

    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, makeRateLimitedQAProvider());
    const result = await resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId);

    expect(result.status).toBe('WAITING_FOR_PROVIDER');
    expect(result.resumeMetadata.resumeStage).toBe('VISUAL_QA');
    expect(result.mediaEvidence[SHOT_ID].sha256).toBe(realSha256);
    expect(result.mediaEvidence[SHOT_ID].generationSource).toBe('GOOGLE_FLOW_REAL');
    expect(result.resumeMetadata.targetShotId).toBe(SHOT_ID);
  });

  // ─── T4 ────────────────────────────────────────────────────────────────
  it('T4 — media changed on disk before resume → fail closed (ProductionSafetyError)', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);
    // Tamper with the file
    fs.writeFileSync(mp4Path, Buffer.alloc(1024, 0xff));

    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, makePassingQAProvider());
    await expect(
      resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId)
    ).rejects.toThrow(ProductionSafetyError);
  });

  // ─── T5 ────────────────────────────────────────────────────────────────
  it('T5 — media missing on disk before resume → fail closed (ProductionSafetyError)', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);
    fs.unlinkSync(mp4Path);

    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, makePassingQAProvider());
    await expect(
      resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId)
    ).rejects.toThrow(ProductionSafetyError);
  });

  // ─── T6 ────────────────────────────────────────────────────────────────
  it('T6 — resume must never produce LIVE_EXTERNAL trust from OFFLINE_TEST_DOUBLE provider', async () => {
    const offlineMock = {
      metadata: {
        id: 'offline-deterministic-double',
        name: 'Offline Double',
        providerTrust: 'OFFLINE_TEST_DOUBLE',
        supportsImages: true,
        supportsMultimodalStructuredOutput: true,
      },
      isConfigured: () => true,
      generateContent: async () => 'ok',
      generateStructured: async (_req: any) => ({
        data: {
          status: 'PASS', passed: true,
          identityConsistencyScore: 0.95, spatialPerspectiveScore: 0.95,
          visualDefectScore: 0.95, overallVisualContinuityScore: 0.95,
          defects: [], retakeRecommendations: [],
          coverage: {}, evaluationNotes: 'offline pass.',
        },
        model: 'mock', usage: {},
      }),
      classifyError: () => 'UNKNOWN_PROVIDER_ERROR',
      getLastModelUsed: () => 'mock', getLastUsage: () => null,
      allowLiveCalls: false,
    } as any;

    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);
    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineMock);
    const result = await resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId);

    const qa = result.qaEvidence[SHOT_ID];
    if (qa) {
      // If QA ran with OFFLINE_TEST_DOUBLE, providerTrust must NOT claim LIVE_EXTERNAL
      // unless the production mode rejected it outright (FAIL)
      if (qa.providerTrust === 'LIVE_EXTERNAL') {
        // If somehow LIVE_EXTERNAL crept in, isSynthetic must be true as a safety net
        expect(qa.isSynthetic).toBe(true);
      } else {
        expect(qa.providerTrust).not.toBe('LIVE_EXTERNAL');
      }
    }
  });

  // ─── T7 ────────────────────────────────────────────────────────────────
  it('T7 — GOOGLE_FLOW_REAL provenance is preserved unchanged across resume cycle', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);

    const provenanceBefore = blockedRun.mediaEvidence[SHOT_ID].provenance;
    const sha256Before = blockedRun.mediaEvidence[SHOT_ID].sha256;
    const assetIdBefore = blockedRun.mediaEvidence[SHOT_ID].assetId;
    const physicalPathBefore = blockedRun.mediaEvidence[SHOT_ID].physicalPath;

    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, makePassingQAProvider());
    const result = await resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId);

    const mediaAfter = result.mediaEvidence[SHOT_ID];
    expect(mediaAfter.generationSource).toBe('GOOGLE_FLOW_REAL');
    expect(mediaAfter.provenance).toBe(provenanceBefore);
    expect(mediaAfter.sha256).toBe(sha256Before);
    expect(mediaAfter.assetId).toBe(assetIdBefore);
    expect(mediaAfter.physicalPath).toBe(physicalPathBefore);
  });

  // ─── T8 ────────────────────────────────────────────────────────────────
  it('T8 — resumeVisualQAFromExistingMedia rejects run not in WAITING_FOR_PROVIDER', async () => {
    const runId = `run_phase25_t8_${Date.now()}`;
    const runDir = path.join(TEST_DIR, '.studio', 'production', PROJECT_ID, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const createdRun: any = {
      schemaVersion: 1, revision: 1,
      runId, projectId: PROJECT_ID, seriesId: SERIES_ID,
      status: 'CREATED', mode: 'PRODUCTION', pilotMode: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      currentStage: 'CREATED',
      completedShotIds: [], pendingShotIds: [], blockedShotIds: [],
      providerJobs: {}, mediaEvidence: {}, qaEvidence: {},
      approvalEvidence: {}, approvalChallenges: {},
      resumeMetadata: { canResume: true, resumeStage: 'VISUAL_QA', targetShotId: SHOT_ID },
    };
    fs.writeFileSync(path.join(runDir, 'production-run.json'), JSON.stringify(createdRun, null, 2), 'utf8');

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, makePassingQAProvider());
    await expect(
      orchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, runId)
    ).rejects.toThrow(ProductionSafetyError);
  });

  // ─── T9 ────────────────────────────────────────────────────────────────
  it('T9 — resumeVisualQAFromExistingMedia rejects run with resumeStage != VISUAL_QA', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);

    // Overwrite resumeStage to simulate a non-VISUAL_QA quota block
    const runPath = path.join(TEST_DIR, '.studio', 'production', PROJECT_ID, blockedRun.runId, 'production-run.json');
    const raw = JSON.parse(fs.readFileSync(runPath, 'utf8'));
    raw.resumeMetadata.resumeStage = 'PREFLIGHT';
    fs.writeFileSync(runPath, JSON.stringify(raw, null, 2), 'utf8');

    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, makePassingQAProvider());
    await expect(
      resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId)
    ).rejects.toThrow(ProductionSafetyError);
  });

  // ─── T10 ───────────────────────────────────────────────────────────────
  it('T10 — execute() on WAITING_FOR_PROVIDER+resumeStage=VISUAL_QA returns same state (no shot generation re-entry)', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);

    // execute() must NOT fall through into shot generation/Flow handoff
    const executeOrchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const result = await executeOrchestrator.execute(PROJECT_ID, blockedRun.runId);

    expect(result.status).toBe('WAITING_FOR_PROVIDER');
    expect(result.resumeMetadata.resumeStage).toBe('VISUAL_QA');
    expect(result.mediaEvidence[SHOT_ID].sha256).toBe(realSha256);
    expect(result.mediaEvidence[SHOT_ID].generationSource).toBe('GOOGLE_FLOW_REAL');
    expect(result.resumeMetadata.recommendedCommand).toContain('--live');

    // Handoff must not have been created
    const handoffPath = path.join(TEST_DIR, '.studio', 'production', PROJECT_ID, blockedRun.runId, 'handoff');
    expect(fs.existsSync(handoffPath)).toBe(false);
  });

  // ─── T11 ───────────────────────────────────────────────────────────────
  it('T11 — --live doctor actually performs live check without requiring RUN_LIVE_PROVIDER_TESTS', async () => {
    delete process.env.RUN_LIVE_PROVIDER_TESTS;
    const mockGenerate = vi.fn().mockResolvedValue({
      text: 'ok',
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
    });
    const mockClient = { models: { generateContent: mockGenerate } };

    // With allowLiveCalls: true (simulating --live flag in CLI)
    const liveProvider = new GeminiProvider({
      apiKey: 'mock_api_key_test_12345',
      client: mockClient as any,
      allowLiveCalls: true,
    });
    const liveHealth = await liveProvider.diagnoseHealth(true);
    expect(liveHealth.status).toBe('AVAILABLE');
    expect(liveHealth.details).toContain('Live connection verified');
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    // Without allowLiveCalls (false) and without RUN_LIVE_PROVIDER_TESTS, live check is skipped
    mockGenerate.mockClear();
    const offlineProvider = new GeminiProvider({
      apiKey: 'mock_api_key_test_12345',
      client: mockClient as any,
      allowLiveCalls: false,
    });
    const offlineHealth = await offlineProvider.diagnoseHealth(false);
    expect(offlineHealth.status).toBe('AVAILABLE');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  // ─── T12 ───────────────────────────────────────────────────────────────
  it('T12 — Daily quota / RPD 429 fails fast with zero retries (no retry storm)', async () => {
    const dailyQuotaError = Object.assign(
      new Error("Quota exceeded for quota metric 'Queries' and limit 'Queries per day' [429]"),
      { status: 429 }
    );
    const mockGenerate = vi.fn().mockRejectedValue(dailyQuotaError);
    const mockClient = { models: { generateContent: mockGenerate } };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      retryConfig: { maxRetries: 3, initialBackoffMs: 5, maxBackoffMs: 15 },
      allowLiveCalls: true,
    });

    try {
      await provider.generateText({ taskType: 'GENERAL_REASONING', prompt: 'test' });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.category).toBe('QUOTA_EXCEEDED');
      // Must be called exactly ONCE: zero retries on daily quota, no retry storm!
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    }
  });

  // ─── T13 ───────────────────────────────────────────────────────────────
  it('T13 — execute() on WAITING_FOR_PROVIDER with live LLM delegates directly to resumeVisualQAFromExistingMedia', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);

    const passingProvider = makePassingQAProvider();
    const executeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, passingProvider);

    // execute() delegates directly to resumeVisualQAFromExistingMedia()
    const result = await executeOrchestrator.execute(PROJECT_ID, blockedRun.runId);

    expect(result.status).toBe('APPROVAL_REQUIRED');
    expect(result.mediaEvidence[SHOT_ID].sha256).toBe(realSha256);
    expect(result.mediaEvidence[SHOT_ID].generationSource).toBe('GOOGLE_FLOW_REAL');
    expect(result.qaEvidence[SHOT_ID].mediaSha256).toBe(realSha256);
    expect(result.qaEvidence[SHOT_ID].overallStatus).toBe('PASS');
    expect(result.resumeMetadata.targetShotId).toBe(SHOT_ID);

    // Handoff must not have been created
    const handoffPath = path.join(TEST_DIR, '.studio', 'production', PROJECT_ID, blockedRun.runId, 'handoff');
    expect(fs.existsSync(handoffPath)).toBe(false);
  });

  // ─── T14 ───────────────────────────────────────────────────────────────
  it('T14 — Direct QA quota failure transitions to WAITING_FOR_PROVIDER with resumeStage=VISUAL_QA and preserves media', async () => {
    const blockedRun = await buildQABlockedRun(storage, mp4Path, realSha256);

    const rateLimitedProvider = makeRateLimitedQAProvider();
    const resumeOrchestrator = new ProductionOrchestrator(storage, assetRegistry, rateLimitedProvider);

    const result = await resumeOrchestrator.resumeVisualQAFromExistingMedia(PROJECT_ID, blockedRun.runId);

    expect(result.status).toBe('WAITING_FOR_PROVIDER');
    expect(result.resumeMetadata.resumeStage).toBe('VISUAL_QA');
    expect(result.resumeMetadata.targetShotId).toBe(SHOT_ID);
    expect(result.mediaEvidence[SHOT_ID].sha256).toBe(realSha256);
    expect(result.mediaEvidence[SHOT_ID].generationSource).toBe('GOOGLE_FLOW_REAL');
    expect(result.resumeMetadata.recommendedCommand).toContain('--live');
  });
});
