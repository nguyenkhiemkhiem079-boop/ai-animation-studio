/**
 * Phase 26 — Telemetry and Cache-First Policy Tests
 *
 * Verifies:
 *   1. GeminiUsageTelemetry counters: attempted, succeeded, blocked, failed, cacheHits, role breakdown.
 *   2. formatGeminiUsageSummary produces sanitized summary without secret material.
 *   3. Global vs instance telemetry accounting.
 *   4. Cache-First Policy: identical physical media SHA-256 reuses authoritative LIVE_EXTERNAL QA PASS without second LLM call.
 *   5. forceReevaluate option bypasses cache when explicitly requested.
 *   6. ClipService.resumeClip reloads existing operation and verifies media evidence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  GeminiProvider,
  createEmptyUsageTelemetry,
  formatGeminiUsageSummary,
  VisualSemanticQAEvaluator,
  ClipService,
  VeoOperationStore,
} from '../src/index.js';

const TEST_DIR = path.resolve('.studio', 'content', 'phase26-telemetry-tests');
const CLIPS_DIR = path.join(TEST_DIR, 'clips');
const OPS_DIR = path.join(TEST_DIR, 'veo-operations');

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
    `"${ffmpegBin}" -f lavfi -i color=c=blue:s=64x64:d=1 -r 24 -vcodec libx264 -pix_fmt yuv420p -y "${filePath}"`,
    { stdio: 'pipe' }
  );
  return fs.readFileSync(filePath);
}

describe('Phase 26 — Gemini Usage Telemetry & Cache-First Policy', () => {
  beforeEach(() => {
    GeminiProvider.resetGlobalUsageTelemetry();
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  describe('GeminiUsageTelemetry', () => {
    it('T1. starts with zero counters across all metrics and roles', () => {
      const initial = createEmptyUsageTelemetry();
      expect(initial.liveRequestsAttempted).toBe(0);
      expect(initial.liveRequestsSucceeded).toBe(0);
      expect(initial.liveRequestsBlocked).toBe(0);
      expect(initial.liveRequestsFailed).toBe(0);
      expect(initial.cacheHits).toBe(0);
      expect(initial.byRole.FAST).toBe(0);
      expect(initial.byRole.REASONING).toBe(0);
      expect(initial.byRole.STRUCTURED).toBe(0);
      expect(initial.byRole.QA).toBe(0);
      expect(initial.byRole.VISION_QA).toBe(0);
    });

    it('T2. increments liveRequestsBlocked when live network call is blocked offline', async () => {
      const provider = new GeminiProvider({
        apiKey: 'AIzaFakeTestKeyForOfflineSafetyTesting12345678',
        allowLiveCalls: false,
      });

      // diagnoseHealth(true) with allowLiveCalls: false should block
      const health = await provider.diagnoseHealth(true);
      expect(health.details).toContain('Live network check skipped');

      const telemetry = provider.getUsageTelemetry();
      expect(telemetry.liveRequestsBlocked).toBe(1);
      expect(telemetry.liveRequestsAttempted).toBe(0);
      expect(telemetry.liveRequestsSucceeded).toBe(0);
    });

    it('T3. increments attempted, succeeded, and role counter on successful call', async () => {
      const mockClient = {
        models: {
          generateContent: async () => ({
            text: '{"status":"ok"}',
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          }),
        },
      };

      const provider = new GeminiProvider({
        apiKey: 'AIzaMockKey12345678',
        client: mockClient as any,
        allowLiveCalls: true,
      });

      const res = await provider.generateText({
        taskType: 'GENERAL_REASONING',
        prompt: 'test prompt',
        modelRole: 'FAST',
      });

      expect(res.text).toBe('{"status":"ok"}');
      const telemetry = provider.getUsageTelemetry();
      expect(telemetry.liveRequestsAttempted).toBe(1);
      expect(telemetry.liveRequestsSucceeded).toBe(1);
      expect(telemetry.liveRequestsFailed).toBe(0);
      expect(telemetry.byRole.FAST).toBe(1);

      // Verify global telemetry sync
      const globalTel = GeminiProvider.getGlobalUsageTelemetry();
      expect(globalTel.liveRequestsAttempted).toBe(1);
      expect(globalTel.liveRequestsSucceeded).toBe(1);
    });

    it('T4. records cacheHits and skips network call on duplicate prompt', async () => {
      let callCount = 0;
      const mockClient = {
        models: {
          generateContent: async () => {
            callCount++;
            return {
              text: 'Cached result text',
              usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
            };
          },
        },
      };

      const provider = new GeminiProvider({
        apiKey: 'AIzaMockKey12345678',
        client: mockClient as any,
        allowLiveCalls: true,
      });

      const req = {
        taskType: 'GENERAL_REASONING',
        prompt: 'identical question',
        seriesId: 'series_cache_test',
      };

      const res1 = await provider.generateText(req);
      expect(res1.wasCached).toBe(false);
      expect(callCount).toBe(1);

      const res2 = await provider.generateText(req);
      expect(res2.wasCached).toBe(true);
      expect(callCount).toBe(1); // No new network call

      const telemetry = provider.getUsageTelemetry();
      expect(telemetry.liveRequestsAttempted).toBe(1);
      expect(telemetry.liveRequestsSucceeded).toBe(1);
      expect(telemetry.cacheHits).toBe(1);
    });

    it('T5. records liveRequestsFailed on quota exhaustion without retrying', async () => {
      const quotaErr = Object.assign(new Error('Resource has been exhausted (e.g. check quota) 429 daily requests exceeded'), {
        status: 429,
      });
      let attempts = 0;
      const failingClient = {
        models: {
          generateContent: async () => {
            attempts++;
            throw quotaErr;
          },
        },
      };

      const provider = new GeminiProvider({
        apiKey: 'AIzaMockKey12345678',
        client: failingClient as any,
        allowLiveCalls: true,
      });

      await expect(
        provider.generateText({
          taskType: 'GENERAL_REASONING',
          prompt: 'fail fast test',
        })
      ).rejects.toThrow('QUOTA_EXCEEDED');

      expect(attempts).toBe(1); // Fail fast, 0 retries
      const telemetry = provider.getUsageTelemetry();
      expect(telemetry.liveRequestsFailed).toBe(1);
    });

    it('T6. formats clean summary without printing API key or sensitive data', () => {
      const telemetry = {
        liveRequestsAttempted: 5,
        liveRequestsSucceeded: 4,
        liveRequestsBlocked: 1,
        liveRequestsFailed: 1,
        cacheHits: 8,
        byRole: {
          FAST: 2,
          REASONING: 1,
          STRUCTURED: 1,
          QA: 0,
          VISION_QA: 1,
        },
      };

      const summary = formatGeminiUsageSummary(telemetry);
      expect(summary).toContain('Gemini API Usage');
      expect(summary).toContain('Live requests : 5');
      expect(summary).toContain('Cache hits    : 8');
      expect(summary).toContain('Blocked       : 1');
      expect(summary).toContain('VISION_QA  : 1');
      expect(summary).not.toContain('AIza');
      expect(summary).not.toContain('key');
    });
  });

  describe('Cache-First Policy', () => {
    it('T7. VisualSemanticQAEvaluator caches and reuses authoritative LIVE_EXTERNAL PASS for identical media SHA', async () => {
      const mp4Path = path.join(TEST_DIR, 'test_cache.mp4');
      createRealMp4(mp4Path);

      let generateCallCount = 0;
      const mockLlm = {
        metadata: {
          id: 'gemini-2.5-flash',
          name: 'Gemini 2.5 Flash',
          supportsImages: true,
          supportsMultimodalStructuredOutput: true,
          providerTrust: 'LIVE_EXTERNAL',
        },
        generateStructured: async () => {
          generateCallCount++;
          return {
            data: {
              identityConsistencyScore: 0.95,
              spatialPerspectiveScore: 0.92,
              visualDefectScore: 0.95,
              overallVisualContinuityScore: 0.94,
              passed: true,
              defects: [],
              retakeRecommendations: [],
            },
            usage: { latencyMs: 150 },
          };
        },
      };

      const evaluator = new VisualSemanticQAEvaluator(mockLlm as any);
      const shot: any = {
        id: 'shot_cache_1',
        sceneId: 'sc1',
        purpose: 'action',
        frame: { durationSeconds: 1, targetFps: 24 },
        camera: { shotSize: 'medium', angle: 'eye_level' },
        lighting: { mood: 'natural' },
      };

      // First run: calls LLM
      const rep1 = await evaluator.evaluateShotVideo({
        projectId: 'proj_test',
        shot,
        videoPath: mp4Path,
        executionMode: 'LOCAL',
      });

      expect(rep1.passed).toBe(true);
      expect(generateCallCount).toBe(1);

      // Second run on same physical video: should hit cache and NOT call LLM again
      const rep2 = await evaluator.evaluateShotVideo({
        projectId: 'proj_test',
        shot,
        videoPath: mp4Path,
        executionMode: 'LOCAL',
        forceReevaluate: false,
      });

      expect(rep2.passed).toBe(true);
      expect(generateCallCount).toBe(1); // LLM was not called a second time!

      // Third run with forceReevaluate: true should bypass cache
      const rep3 = await evaluator.evaluateShotVideo({
        projectId: 'proj_test',
        shot,
        videoPath: mp4Path,
        executionMode: 'LOCAL',
        forceReevaluate: true,
      });

      expect(rep3.passed).toBe(true);
      expect(generateCallCount).toBe(2); // LLM was called due to forceReevaluate
    });
  });

  describe('ClipService.resumeClip', () => {
    it('T8. successfully resumes a POLLING clip operation by clipId', async () => {
      const mp4Path = path.join(CLIPS_DIR, 'mock.mp4');
      const videoBytes = createRealMp4(mp4Path);

      const opStore = new VeoOperationStore(OPS_DIR);
      opStore.save({
        operationName: 'operations/resume-op-1',
        clipId: 'clip_resume_test',
        projectId: 'proj_resume',
        promptHash: 'fake_hash',
        model: 'veo-2.0-generate-001',
        aspectRatio: '16:9',
        resolution: '720p',
        status: 'POLLING',
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pollCount: 1,
      });

      const mockDoneOp = {
        name: 'operations/resume-op-1',
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: videoBytes.toString('base64') } }],
        },
      };

      const mockClientFactory = () => ({
        models: { generateVideos: async () => ({ name: 'op' }) },
        operations: { getVideosOperation: async () => mockDoneOp },
      });

      const clipSvc = new ClipService({
        apiKey: 'AIzaMockKey',
        operationStoreDir: OPS_DIR,
        outputBaseDir: CLIPS_DIR,
        enableQA: false,
        pollIntervalMs: 10,
      });

      // Inject clientFactory on underlying provider
      (clipSvc as any).provider.clientFactory = mockClientFactory;

      const result = await clipSvc.resumeClip('proj_resume', 'clip_resume_test', { enableQA: false });
      expect(result.status).toBe('READY');
      expect(result.clipId).toBe('clip_resume_test');
      expect(result.ffprobe.hasVideoStream).toBe(true);
      expect(fs.existsSync(result.physicalPath)).toBe(true);
    });
  });
});
