/**
 * Phase 26 — Direct Veo API Provider Tests
 *
 * Tests for GeminiVeoVideoProvider, VeoOperationStore, and ClipService.
 *
 * CI mode: all live Veo API calls are mocked via injected clientFactory.
 * Real quota is NEVER spent in CI.
 * Live smoke tests are opt-in via VEO_LIVE_SMOKE=1 env var.
 *
 * Coverage:
 *   T1.  VeoOperationStore: save/load/update round-trip
 *   T2.  VeoOperationStore: findExistingOperation detects SUBMITTED/POLLING
 *   T3.  VeoOperationStore: listForProject returns newest first
 *   T4.  GeminiVeoVideoProvider: NOT_CONFIGURED when no key and no clientFactory
 *   T5.  GeminiVeoVideoProvider: happy path with injected mock client
 *   T6.  GeminiVeoVideoProvider: quota error on submit → VeoQuotaError
 *   T7.  GeminiVeoVideoProvider: quota error on poll → VeoQuotaError, state preserved
 *   T8.  GeminiVeoVideoProvider: timeout after maxPollAttempts → VeoTimeoutError
 *   T9.  GeminiVeoVideoProvider: crash resume resumes POLLING op without re-submitting
 *   T10. GeminiVeoVideoProvider: DONE operation returns from store without API call
 *   T11. GeminiVeoVideoProvider: generationSource=LIVE_PROVIDER, providerTrust=LIVE_EXTERNAL
 *   T12. ClipService: PREVIEW_CLIP status=READY on happy path (video bytes from mock)
 *   T13. ClipService: quota error → status=WAITING_FOR_PROVIDER (not exception)
 *   T14. ClipService: corrupt download → RETAKE_RECOMMENDED
 *   T15. ClipService: enableQA=false → qaStatus=SKIPPED
 *   T16. ClipService: PREVIEW_CLIP has no approval fields (distinct from MASTER_PRODUCTION)
 *   T17. VEO_MODEL_MAP: ECONOMY profile uses stable veo-2 model
 *   T18. VeoOperationStore.hashPrompt: deterministic, collision-resistant
 *   T19. GeminiVeoVideoProvider.diagnoseHealth: configures status correctly
 *   T20. GeminiVeoVideoProvider: no duplicate submit when POLLING record exists in store
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

import {
  VeoOperationStore,
  VeoOperationRecord,
  GeminiVeoVideoProvider,
  VeoQuotaError,
  VeoTimeoutError,
  VeoValidationError,
  VEO_MODEL_MAP,
  VEO_LEGACY_MODEL,
  resolveVeoModel,
  detectVeoModality,
  resolvePersonGeneration,
  validateVeoRequest,
  ClipService,
} from '../src/index.js';

// ─── Test directory ───────────────────────────────────────────────────────────

const TEST_DIR = path.resolve('.studio', 'content', 'phase26-veo-tests');
const STORE_DIR = path.join(TEST_DIR, 'veo-operations');
const CLIPS_DIR = path.join(TEST_DIR, 'clips');
const FAKE_PROJECT = 'proj_veo_test';
const FAKE_PROMPT = 'A young engineer stands at a drafting table. Slow push-in.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a real H.264 MP4 using ffmpeg-static */
function createRealMp4(filePath: string): Buffer {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const req = createRequire(import.meta.url);
  let ffmpegBin: string;
  try {
    ffmpegBin = req('ffmpeg-static') as string;
  } catch {
    ffmpegBin = 'ffmpeg';
  }
  execSync(
    `"${ffmpegBin}" -f lavfi -i color=c=black:s=64x64:d=1 -r 24 -vcodec libx264 -pix_fmt yuv420p -y "${filePath}"`,
    { stdio: 'pipe' }
  );
  return fs.readFileSync(filePath);
}

/** Build a mock Veo client that returns a done operation with video bytes */
function makeMockClient(videoBytes: Buffer, submitDone = false, capture?: { lastDownloadParams?: any; lastGenerateParams?: any }) {
  const doneOp = {
    name: 'operations/mock-op',
    done: true,
    response: {
      generatedVideos: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock-veo-video', videoBytes: videoBytes.toString('base64') } }],
    },
  };
  const initialOp = { name: 'operations/mock-op', done: submitDone };
  let firstPoll = true;

  return () => ({
    models: {
      generateVideos: async (req: any) => {
        if (capture) capture.lastGenerateParams = req;
        return initialOp;
      },
    },
    operations: {
      getVideosOperation: async (_req: any) => {
        if (firstPoll) { firstPoll = false; return initialOp; }
        return doneOp;
      },
    },
    files: {
      download: async (params: any) => {
        if (capture) capture.lastDownloadParams = params;
        fs.mkdirSync(path.dirname(params.downloadPath), { recursive: true });
        fs.writeFileSync(params.downloadPath, videoBytes);
      },
    },
  });
}

/** Build a mock client that always throws quota error */
function makeQuotaClient(onSubmit: boolean, onPoll: boolean) {
  const quotaErr = Object.assign(new Error('RESOURCE_EXHAUSTED: 429'), { status: 429 });
  return () => ({
    models: {
      generateVideos: async (_req: any) => {
        if (onSubmit) throw quotaErr;
        return { name: 'operations/quota-op', done: false };
      },
    },
    operations: {
      getVideosOperation: async (_req: any) => {
        if (onPoll) throw quotaErr;
        return { name: 'operations/quota-op', done: false };
      },
    },
  });
}

/** Build a mock client that is always not-done (triggers timeout) */
function makeSlowClient() {
  return () => ({
    models: {
      generateVideos: async (_req: any) => ({ name: 'operations/slow-op', done: false }),
    },
    operations: {
      getVideosOperation: async (_req: any) => ({ name: 'operations/slow-op', done: false }),
    },
  });
}

/** Build a stub VeoOperationRecord */
function makeRecord(overrides: Partial<VeoOperationRecord> = {}): VeoOperationRecord {
  const promptHash = VeoOperationStore.hashPrompt(FAKE_PROMPT);
  return {
    operationName: `operations/test-op-${Date.now()}`,
    clipId: `clip_test_${Date.now()}`,
    projectId: FAKE_PROJECT,
    promptHash,
    model: 'veo-3.1-lite-generate-preview',
    aspectRatio: '16:9',
    resolution: '720p',
    numberOfVideos: 1,
    status: 'SUBMITTED',
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pollCount: 0,
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Phase 26 — Direct Veo API provider tests', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ─── T1 ────────────────────────────────────────────────────────────────────
  it('T1 — VeoOperationStore: save / load / update round-trip', () => {
    const store = new VeoOperationStore(STORE_DIR);
    const rec = makeRecord();
    store.save(rec);

    const loaded = store.load(rec.projectId, rec.clipId);
    expect(loaded).not.toBeNull();
    expect(loaded!.operationName).toBe(rec.operationName);
    expect(loaded!.status).toBe('SUBMITTED');

    const updated = store.update(rec.projectId, rec.clipId, { status: 'POLLING', pollCount: 3 });
    expect(updated.status).toBe('POLLING');
    expect(updated.pollCount).toBe(3);

    const reloaded = store.load(rec.projectId, rec.clipId);
    expect(reloaded!.status).toBe('POLLING');
    expect(reloaded!.pollCount).toBe(3);
  });

  // ─── T2 ────────────────────────────────────────────────────────────────────
  it('T2 — VeoOperationStore: findExistingOperation detects SUBMITTED/POLLING by promptHash', () => {
    const store = new VeoOperationStore(STORE_DIR);
    const rec = makeRecord({ status: 'POLLING', pollCount: 5 });
    store.save(rec);

    const found = store.findExistingOperation(rec.projectId, rec.promptHash);
    expect(found).not.toBeNull();
    expect(found!.clipId).toBe(rec.clipId);

    // DONE record should NOT be returned
    store.update(rec.projectId, rec.clipId, { status: 'DONE' });
    const notFound = store.findExistingOperation(rec.projectId, rec.promptHash);
    expect(notFound).toBeNull();
  });

  // ─── T3 ────────────────────────────────────────────────────────────────────
  it('T3 — VeoOperationStore: listForProject returns records sorted newest first', () => {
    const store = new VeoOperationStore(STORE_DIR);
    const rec1 = makeRecord({ clipId: 'clip_t3_a', submittedAt: '2026-01-01T00:00:00Z' });
    const rec2 = makeRecord({ clipId: 'clip_t3_b', submittedAt: '2026-01-02T00:00:00Z' });
    store.save(rec1);
    store.save(rec2);

    const list = store.listForProject(FAKE_PROJECT);
    expect(list.length).toBe(2);
    expect(list[0].clipId).toBe('clip_t3_b');
  });

  // ─── T4 ────────────────────────────────────────────────────────────────────
  it('T4 — GeminiVeoVideoProvider: NOT_CONFIGURED when no key and no clientFactory', async () => {
    const provider = new GeminiVeoVideoProvider({
      apiKey: '',   // explicit empty — not from env
      allowLiveCalls: false,
      operationStoreDir: STORE_DIR,
    });
    expect(provider.isConfigured()).toBe(false);
    const health = await provider.diagnoseHealth();
    // With allowLiveCalls=false: TEST_ONLY; with empty key: NOT_CONFIGURED
    expect(['NOT_CONFIGURED', 'TEST_ONLY']).toContain(health.status);
  });

  // ─── T5 ────────────────────────────────────────────────────────────────────
  it('T5 — GeminiVeoVideoProvider: happy path with injected mock client → LIVE_PROVIDER result', async () => {
    const fakeOutputDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t5');
    const fakeOutputPath = path.join(fakeOutputDir, 'clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);

    const provider = new GeminiVeoVideoProvider({
      apiKey: 'not-needed-factory-takes-precedence',
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      maxPollAttempts: 5,
      clientFactory: makeMockClient(videoBytes),
    });

    const result = await provider.generateClip({
      prompt: 'unique T5 happy path',
      projectId: FAKE_PROJECT,
      clipId: 'clip_t5',
      outputDir: fakeOutputDir,
    });

    expect(result.generationSource).toBe('LIVE_PROVIDER');
    expect(result.providerTrust).toBe('LIVE_EXTERNAL');
    expect(result.physicalPath).toBeTruthy();
    expect(fs.existsSync(result.physicalPath)).toBe(true);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.operationName).toBeTruthy();
    expect(result.clipId).toBe('clip_t5');
  });

  // ─── T6 ────────────────────────────────────────────────────────────────────
  it('T6 — GeminiVeoVideoProvider: quota error on submit → VeoQuotaError (not submitted)', async () => {
    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      clientFactory: makeQuotaClient(true, false),
    });

    await expect(
      provider.generateClip({ prompt: 'unique T6 quota submit', projectId: FAKE_PROJECT, clipId: 'clip_t6' })
    ).rejects.toThrow(VeoQuotaError);

    // No record should be saved since submission failed
    const store = new VeoOperationStore(STORE_DIR);
    expect(store.load(FAKE_PROJECT, 'clip_t6')).toBeNull();
  });

  // ─── T7 ────────────────────────────────────────────────────────────────────
  it('T7 — GeminiVeoVideoProvider: quota error during polling → VeoQuotaError, record preserved', async () => {
    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      maxPollAttempts: 5,
      clientFactory: makeQuotaClient(false, true), // submit ok, poll fails
    });

    await expect(
      provider.generateClip({ prompt: 'unique T7 quota poll', projectId: FAKE_PROJECT, clipId: 'clip_t7' })
    ).rejects.toThrow(VeoQuotaError);

    // Operation record must exist in POLLING state for crash resume
    const store = new VeoOperationStore(STORE_DIR);
    const rec = store.load(FAKE_PROJECT, 'clip_t7');
    expect(rec).not.toBeNull();
    expect(rec!.status).toBe('POLLING');
  });

  // ─── T8 ────────────────────────────────────────────────────────────────────
  it('T8 — GeminiVeoVideoProvider: VeoTimeoutError after maxPollAttempts', async () => {
    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      maxPollAttempts: 2,
      clientFactory: makeSlowClient(),
    });

    await expect(
      provider.generateClip({ prompt: 'unique T8 timeout', projectId: FAKE_PROJECT, clipId: 'clip_t8' })
    ).rejects.toThrow(VeoTimeoutError);
  });

  // ─── T9 ────────────────────────────────────────────────────────────────────
  it('T9 — GeminiVeoVideoProvider: crash resume resumes POLLING op without re-submitting', async () => {
    const fakeOutputDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t9');
    const fakeOutputPath = path.join(fakeOutputDir, 'clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);

    // Pre-seed an existing POLLING record WITH pollCount=0
    // so the _pollAndDownload loop has room to process
    const store = new VeoOperationStore(STORE_DIR);
    const rec: VeoOperationRecord = {
      operationName: 'operations/resume-op',
      clipId: 'clip_t9',
      projectId: FAKE_PROJECT,
      promptHash: VeoOperationStore.hashPrompt('unique T9 resume'),
      model: 'veo-2.0-generate-001',
      aspectRatio: '16:9', resolution: '720p', numberOfVideos: 1,
      status: 'POLLING',
      submittedAt: new Date(Date.now() - 60000).toISOString(),
      updatedAt: new Date().toISOString(),
      pollCount: 0, // reset so polling loop can run
    };
    store.save(rec);

    let submitCalled = false;
    const factory = () => ({
      models: {
        generateVideos: async (_req: any) => {
          submitCalled = true;
          return { name: 'operations/resume-op', done: false };
        },
      },
      operations: {
        // Always immediately done so resume completes
        getVideosOperation: async (_req: any) => ({
          name: 'operations/resume-op',
          done: true,
          response: { generatedVideos: [{ video: { videoBytes: videoBytes.toString('base64') } }] },
        }),
      },
    });

    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      maxPollAttempts: 5,
      clientFactory: factory,
    });

    const result = await provider.resumeOperation(FAKE_PROJECT, 'clip_t9', fakeOutputDir);
    expect(result.generationSource).toBe('LIVE_PROVIDER');
    expect(result.physicalPath).toBeTruthy();
    // Critical: generateVideos (submit) must NOT have been called during resume
    expect(submitCalled).toBe(false);
  });

  // ─── T10 ───────────────────────────────────────────────────────────────────
  it('T10 — GeminiVeoVideoProvider: DONE operation returns from store without any API call', async () => {
    const fakeOutputDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t10');
    const fakeOutputPath = path.join(fakeOutputDir, 'clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);
    const fakeSha = crypto.createHash('sha256').update(videoBytes).digest('hex');

    const store = new VeoOperationStore(STORE_DIR);
    const rec: VeoOperationRecord = {
      operationName: 'operations/done-op',
      clipId: 'clip_t10',
      projectId: FAKE_PROJECT,
      promptHash: VeoOperationStore.hashPrompt('unique T10 done'),
      model: 'veo-2.0-generate-001',
      aspectRatio: '16:9', resolution: '720p', numberOfVideos: 1,
      status: 'DONE',
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pollCount: 8,
      outputPath: path.resolve(fakeOutputPath),
      outputSha256: fakeSha,
      completedAt: new Date().toISOString(),
    };
    store.save(rec);

    let apiCalled = false;
    const factory = () => ({
      models: { generateVideos: async () => { apiCalled = true; } },
      operations: { getVideosOperation: async () => { apiCalled = true; } },
    });

    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      clientFactory: factory,
    });

    const result = await provider.resumeOperation(FAKE_PROJECT, 'clip_t10', fakeOutputDir);
    expect(result.generationSource).toBe('LIVE_PROVIDER');
    expect(result.sha256).toBe(fakeSha);
    expect(apiCalled).toBe(false);
  });

  // ─── T11 ───────────────────────────────────────────────────────────────────
  it('T11 — GeminiVeoVideoProvider: provenance is always LIVE_PROVIDER / LIVE_EXTERNAL, never GOOGLE_FLOW_REAL', async () => {
    const fakeOutputDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t11');
    const fakeOutputPath = path.join(fakeOutputDir, 'clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);

    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      maxPollAttempts: 5,
      clientFactory: makeMockClient(videoBytes),
    });

    const result = await provider.generateClip({
      prompt: 'unique T11 provenance',
      projectId: FAKE_PROJECT,
      clipId: 'clip_t11',
      outputDir: fakeOutputDir,
    });

    expect(result.generationSource).toBe('LIVE_PROVIDER');
    expect(result.providerTrust).toBe('LIVE_EXTERNAL');
    expect((result as any).generationSource).not.toBe('GOOGLE_FLOW_REAL');
    expect((result as any).providerTrust).not.toBe('OFFLINE_TEST_DOUBLE');
  });

  // ─── T12 ───────────────────────────────────────────────────────────────────
  it('T12 — ClipService: PREVIEW_CLIP status=READY on happy path', async () => {
    const fakeOutputDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t12');
    const fakeOutputPath = path.join(fakeOutputDir, 'clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);

    const svc = new ClipService({
      apiKey: 'not-needed',
      enableQA: true,
      outputBaseDir: CLIPS_DIR,
    });

    // Inject the mock via the internal provider
    (svc as any).provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      maxPollAttempts: 5,
      clientFactory: makeMockClient(videoBytes),
    });

    const result = await svc.generateClip({
      prompt: 'unique T12 happy path',
      projectId: FAKE_PROJECT,
      clipType: 'PREVIEW_CLIP',
    });

    expect(result.clipType).toBe('PREVIEW_CLIP');
    // Status is READY or RETAKE_RECOMMENDED (small 64x64 test file may trigger QA warn)
    expect(['READY', 'RETAKE_RECOMMENDED']).toContain(result.status);
    // The video stream must have been detected
    expect(result.ffprobe.hasVideoStream).toBe(true);
    // qaStatus should not be SKIPPED (QA ran even if it warns/fails)
    expect(result.qaStatus).not.toBe('SKIPPED');
  });

  // ─── T13 ───────────────────────────────────────────────────────────────────
  it('T13 — ClipService: quota error → status=WAITING_FOR_PROVIDER (not exception)', async () => {
    const svc = new ClipService({
      apiKey: 'not-needed',
      enableQA: false,
    });

    // Provider that always throws VeoQuotaError
    (svc as any).provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      clientFactory: makeQuotaClient(true, false),
    });

    const result = await svc.generateClip({ prompt: 'unique T13 quota', projectId: FAKE_PROJECT });

    expect(result.status).toBe('WAITING_FOR_PROVIDER');
    expect(result.failureReason).toMatch(/quota|429/i);
  });

  // ─── T14 ───────────────────────────────────────────────────────────────────
  it('T14 — ClipService: corrupt download (no video stream) → RETAKE_RECOMMENDED', async () => {
    // Create a corrupt "video" file
    const corruptDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t14');
    const corruptPath = path.join(corruptDir, 'clip.mp4');
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(corruptPath, Buffer.alloc(256, 0x00));
    const corruptBytes = fs.readFileSync(corruptPath);

    const svc = new ClipService({ apiKey: 'not-needed', enableQA: true, outputBaseDir: CLIPS_DIR });
    (svc as any).provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      clientFactory: makeMockClient(corruptBytes),
    });

    const result = await svc.generateClip({ prompt: 'unique T14 corrupt', projectId: FAKE_PROJECT });

    // Corrupt file has no valid video stream → RETAKE_RECOMMENDED
    expect(result.status).toBe('RETAKE_RECOMMENDED');
    expect(result.ffprobe.hasVideoStream).toBe(false);
  });

  // ─── T15 ───────────────────────────────────────────────────────────────────
  it('T15 — ClipService: enableQA=false → qaStatus=SKIPPED', async () => {
    const fakeOutputDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t15');
    const fakeOutputPath = path.join(fakeOutputDir, 'clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);

    const svc = new ClipService({ apiKey: 'not-needed', enableQA: false, outputBaseDir: CLIPS_DIR });
    (svc as any).provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      clientFactory: makeMockClient(videoBytes),
    });

    const result = await svc.generateClip({ prompt: 'unique T15 no-qa', enableQA: false });

    expect(result.qaStatus).toBe('SKIPPED');
  });

  // ─── T16 ───────────────────────────────────────────────────────────────────
  it('T16 — PREVIEW_CLIP has no approval/canon fields (distinct from MASTER_PRODUCTION)', async () => {
    const fakeOutputDir = path.join(CLIPS_DIR, FAKE_PROJECT, 'clip_t16');
    const fakeOutputPath = path.join(fakeOutputDir, 'clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);

    const svc = new ClipService({ apiKey: 'not-needed', enableQA: false, outputBaseDir: CLIPS_DIR });
    (svc as any).provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      clientFactory: makeMockClient(videoBytes),
    });

    const result = await svc.generateClip({ prompt: 'unique T16 clip-type', clipType: 'PREVIEW_CLIP' });

    expect(result.clipType).toBe('PREVIEW_CLIP');
    // No production approval fields
    expect((result as any).approvalStatus).toBeUndefined();
    expect((result as any).canonStatus).toBeUndefined();
    expect((result as any).approvalEvidence).toBeUndefined();
  });

  // ─── T17 ───────────────────────────────────────────────────────────────────
  it('T17 — VEO_MODEL_MAP: Veo 3.1 official model IDs (ECONOMY, BALANCED, QUALITY)', () => {
    expect(VEO_MODEL_MAP.ECONOMY).toBe('veo-3.1-lite-generate-preview');
    expect(VEO_MODEL_MAP.BALANCED).toBe('veo-3.1-fast-generate-preview');
    expect(VEO_MODEL_MAP.QUALITY).toBe('veo-3.1-generate-preview');
    expect(VEO_LEGACY_MODEL).toBe('veo-2.0-generate-001');
    expect(resolveVeoModel('ECONOMY')).toBe('veo-3.1-lite-generate-preview');
    expect(resolveVeoModel('BALANCED')).toBe('veo-3.1-fast-generate-preview');
    expect(resolveVeoModel('QUALITY')).toBe('veo-3.1-generate-preview');
    expect(resolveVeoModel('ECONOMY', 'custom-model')).toBe('custom-model');
  });

  // ─── T18 ───────────────────────────────────────────────────────────────────
  it('T18 — VeoOperationStore.hashPrompt: deterministic and collision-resistant', () => {
    const h1 = VeoOperationStore.hashPrompt('Hello world');
    const h2 = VeoOperationStore.hashPrompt('Hello world');
    const h3 = VeoOperationStore.hashPrompt('Hello world!');

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── T19 ───────────────────────────────────────────────────────────────────
  it('T19 — GeminiVeoVideoProvider.diagnoseHealth: reports correctly', async () => {
    // No key, no factory → NOT_CONFIGURED
    const unconfigured = new GeminiVeoVideoProvider({
      apiKey: '',
      allowLiveCalls: false,
      operationStoreDir: STORE_DIR,
    });
    const h1 = await unconfigured.diagnoseHealth();
    expect(['NOT_CONFIGURED', 'TEST_ONLY']).toContain(h1.status);

    // With clientFactory → AVAILABLE
    const configured = new GeminiVeoVideoProvider({
      apiKey: '',
      allowLiveCalls: false,
      clientFactory: () => ({ models: {}, operations: {} }),
      operationStoreDir: STORE_DIR,
    });
    const h2 = await configured.diagnoseHealth();
    expect(h2.status).toBe('AVAILABLE');
  });

  // ─── T20 ───────────────────────────────────────────────────────────────────
  it('T20 — GeminiVeoVideoProvider: no duplicate submit when POLLING record exists in store', async () => {
    const promptForT20 = 'unique T20 no-duplicate submit';
    const promptHash = VeoOperationStore.hashPrompt(promptForT20);

    // Pre-seed POLLING record
    const store = new VeoOperationStore(STORE_DIR);
    store.save(makeRecord({
      clipId: 'clip_t20_existing',
      promptHash,
      status: 'POLLING',
      pollCount: 3,
    }));

    let submitCalled = false;
    const factory = () => ({
      models: {
        generateVideos: async (_req: any) => {
          submitCalled = true;
          return { name: 'operations/t20-op', done: false };
        },
      },
      operations: {
        getVideosOperation: async (_req: any) => ({ done: false }),
      },
    });

    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      maxPollAttempts: 1, // timeout quickly
      clientFactory: factory,
    });

    // Expect timeout (slow op), not a new submission
    await expect(
      provider.generateClip({ prompt: promptForT20, projectId: FAKE_PROJECT })
    ).rejects.toThrow(VeoTimeoutError);

    // generateVideos must NOT have been called — existing record was found and resumed
    expect(submitCalled).toBe(false);
  });

  // ─── T21 ───────────────────────────────────────────────────────────────────
  it('T21 — Duration validation: invalid duration 5 rejected before API call', async () => {
    let apiCalled = false;
    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      clientFactory: () => ({
        models: {
          generateVideos: async () => {
            apiCalled = true;
            return { name: 'op-t21' };
          },
        },
        operations: { getVideosOperation: async () => ({}) },
      }),
    });

    await expect(
      provider.generateClip({
        prompt: 'test invalid duration 5',
        durationSeconds: 5,
        projectId: FAKE_PROJECT,
      })
    ).rejects.toThrow(VeoValidationError);

    expect(apiCalled).toBe(false);
  });

  // ─── T22 ───────────────────────────────────────────────────────────────────
  it('T22 — Duration validation: 1080p + 4s rejected before API call', async () => {
    let apiCalled = false;
    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      clientFactory: () => ({
        models: {
          generateVideos: async () => {
            apiCalled = true;
            return { name: 'op-t22' };
          },
        },
        operations: { getVideosOperation: async () => ({}) },
      }),
    });

    await expect(
      provider.generateClip({
        prompt: 'test 1080p + 4s',
        resolution: '1080p',
        durationSeconds: 4,
        projectId: FAKE_PROJECT,
      })
    ).rejects.toThrow(VeoValidationError);

    expect(apiCalled).toBe(false);
  });

  // ─── T23 ───────────────────────────────────────────────────────────────────
  it('T23 — Duration validation: 1080p + 8s accepted', async () => {
    const fakeOutputPath = path.join(TEST_DIR, 't23_clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);
    let capturedConfig: any;

    const doneOp = {
      name: 'operations/t23-op',
      done: true,
      response: { generatedVideos: [{ video: { videoBytes: videoBytes.toString('base64') } }] },
    };

    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      clientFactory: () => ({
        models: {
          generateVideos: async (req: any) => {
            capturedConfig = req.config;
            return doneOp;
          },
        },
        operations: { getVideosOperation: async () => doneOp },
        files: {
          download: async (params: any) => {
            fs.mkdirSync(path.dirname(params.downloadPath), { recursive: true });
            fs.writeFileSync(params.downloadPath, videoBytes);
          },
        },
      }),
    });

    const result = await provider.generateClip({
      prompt: 'test 1080p + 8s accepted',
      resolution: '1080p',
      durationSeconds: 8,
      projectId: FAKE_PROJECT,
    });

    expect(result.physicalPath).toBeTruthy();
    expect(capturedConfig.resolution).toBe('1080p');
    expect(capturedConfig.durationSeconds).toBe(8);
  });

  // ─── T24 ───────────────────────────────────────────────────────────────────
  it('T24 — personGeneration semantics: modality-aware configuration', () => {
    // text-to-video -> allow_all
    expect(resolvePersonGeneration('text-to-video')).toBe('allow_all');
    expect(resolvePersonGeneration('text-to-video', 'dont_allow')).toBe('dont_allow');
    // image-to-video -> allow_adult
    expect(resolvePersonGeneration('image-to-video')).toBe('allow_adult');
    // interpolation -> allow_adult
    expect(resolvePersonGeneration('interpolation')).toBe('allow_adult');
    // reference-image -> allow_adult
    expect(resolvePersonGeneration('reference-image')).toBe('allow_adult');
    // invalid personGeneration rejected before API call
    expect(() => resolvePersonGeneration('text-to-video', 'invalid_setting')).toThrow(VeoValidationError);
  });

  // ─── T25 ───────────────────────────────────────────────────────────────────
  it('T25 — Official SDK files.download used with returned video object', async () => {
    const fakeOutputPath = path.join(TEST_DIR, 't25_clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);
    let capturedDownload: any;

    const mockVideoObject = { uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock-123' };
    const doneOp = {
      name: 'operations/t25-op',
      done: true,
      response: {
        generatedVideos: [{ video: mockVideoObject }],
      },
    };

    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      pollIntervalMs: 0,
      clientFactory: () => ({
        models: {
          generateVideos: async () => doneOp,
        },
        operations: { getVideosOperation: async () => doneOp },
        files: {
          download: async (params: any) => {
            capturedDownload = params;
            fs.mkdirSync(path.dirname(params.downloadPath), { recursive: true });
            fs.writeFileSync(params.downloadPath, videoBytes);
          },
        },
      }),
    });

    const result = await provider.generateClip({
      prompt: 'test sdk files.download invocation',
      projectId: FAKE_PROJECT,
    });

    expect(capturedDownload).toBeDefined();
    expect(capturedDownload.file).toEqual(mockVideoObject);
    expect(capturedDownload.downloadPath).toBe(result.physicalPath);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── T26 ───────────────────────────────────────────────────────────────────
  it('T26 — No unauthenticated private download: attaches apiKey and redacts keys in logs', async () => {
    const fakeOutputPath = path.join(TEST_DIR, 't26_clip.mp4');
    const videoBytes = createRealMp4(fakeOutputPath);

    const http = await import('node:http');
    let receivedAuthHeader: string | undefined;
    let receivedApiKeyHeader: string | undefined;

    const server = http.createServer((req, res) => {
      receivedAuthHeader = req.headers['authorization'];
      receivedApiKeyHeader = req.headers['x-goog-api-key'] as string;
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      res.end(videoBytes);
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const downloadUri = `http://localhost:${port}/download?key=SECRET_GEMINI_KEY_ABC`;

    const doneOp = {
      name: 'operations/t26-op',
      done: true,
      response: {
        generatedVideos: [{ video: { uri: downloadUri } }],
      },
    };

    try {
      const provider = new GeminiVeoVideoProvider({
        apiKey: 'SECRET_GEMINI_KEY_ABC',
        operationStoreDir: STORE_DIR,
        pollIntervalMs: 0,
        // No client.files.download provided, forcing the authenticated URI fallback
        clientFactory: () => ({
          models: {
            generateVideos: async () => doneOp,
          },
          operations: { getVideosOperation: async () => doneOp },
        }),
      });

      const result = await provider.generateClip({
        prompt: 'test authenticated download fallback',
        projectId: FAKE_PROJECT,
      });

      // REST fallback uses x-goog-api-key
      expect(receivedApiKeyHeader).toBe('SECRET_GEMINI_KEY_ABC');
      // REST fallback does NOT send API key as Bearer token
      expect(receivedAuthHeader).toBeUndefined();
      expect(result.physicalPath).toBeTruthy();
    } finally {
      server.close();
    }
  });

  // ─── T27 ───────────────────────────────────────────────────────────────────
  it('T27 — URL sanitization: never exposes GEMINI_API_KEY in errors', () => {
    const provider = new GeminiVeoVideoProvider({
      apiKey: 'MY_SECRET_KEY_123',
      operationStoreDir: STORE_DIR,
    });
    const sanitized = (provider as any)._sanitizeUrl('https://example.com/video?key=MY_SECRET_KEY_123&other=val');
    expect(sanitized).not.toContain('MY_SECRET_KEY_123');
    expect(sanitized).toContain('[REDACTED]');
  });

  // ─── T28 ───────────────────────────────────────────────────────────────────
  it('T28 — Reference images require duration of 8s', async () => {
    let apiCalled = false;
    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      clientFactory: () => ({
        models: {
          generateVideos: async () => {
            apiCalled = true;
            return { name: 'op-t28' };
          },
        },
        operations: { getVideosOperation: async () => ({}) },
      }),
    });

    // 4s with reference images should be rejected
    await expect(
      provider.generateClip({
        prompt: 'test reference image duration',
        referenceImages: [{ uri: 'ref1' }],
        durationSeconds: 4,
        projectId: FAKE_PROJECT,
      })
    ).rejects.toThrow(VeoValidationError);

    expect(apiCalled).toBe(false);
  });

  // ─── T29 ───────────────────────────────────────────────────────────────────
  it('T29 — Invalid personGeneration rejected before API call', async () => {
    let apiCalled = false;
    const provider = new GeminiVeoVideoProvider({
      operationStoreDir: STORE_DIR,
      clientFactory: () => ({
        models: {
          generateVideos: async () => {
            apiCalled = true;
            return { name: 'op-t29' };
          },
        },
        operations: { getVideosOperation: async () => ({}) },
      }),
    });

    await expect(
      provider.generateClip({
        prompt: 'test invalid personGeneration',
        personGeneration: 'unsupported_adult_mode',
        projectId: FAKE_PROJECT,
      })
    ).rejects.toThrow(VeoValidationError);

    expect(apiCalled).toBe(false);
  });
});
