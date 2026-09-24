/**
 * Phase 27A — Free-First Video Mode & Paid API Safety Tests
 *
 * Verifies:
 *   1. FREE_ONLY is default cost policy.
 *   2. Paid Gemini Veo video generation is BLOCKED by default even when GEMINI_API_KEY is present.
 *   3. No generateVideos() call occurs in FREE_ONLY mode (strict zero-billing guard).
 *   4. Explicit dual authorization (VIDEO_COST_MODE=PAID_ALLOWED and ALLOW_PAID_VIDEO_API=true) is required for paid video.
 *   5. Error classification distinguishes: PAID_PROVIDER_DISABLED, QUOTA_EXCEEDED, RATE_LIMITED, AUTH_ERROR, PROVIDER_UNAVAILABLE.
 *   6. studio clip dry-run produces zero network calls, zero file generation, and $0 estimated paid cost.
 *   7. Deterministic / local-renderable tasks (titles, charts, infographics, explainers, ui, motion) route to FREE_LOCAL engines.
 *   8. Cinematic / generative tasks route to GOOGLE_FLOW_HANDOFF ($0 API cost, assisted operator package) in FREE_ONLY.
 *   9. Template manifest registers and compiles all 7 categories (TITLE, OUTRO, DATA_CHART, INFOGRAPHIC, EXPLAINER, UI_DEMO, MOTION_GRAPHIC).
 *   10. Direct Veo provider is preserved as an optional future provider.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

import {
  resolveVideoCostMode,
  isPaidVideoAllowed,
  PaidProviderDisabledError,
  VeoQuotaError,
  VeoRateLimitError,
  VeoAuthError,
  VeoProviderUnavailableError,
  GeminiVeoVideoProvider,
  ClipService,
  FreeFirstVideoRouter,
  TemplateRegistry,
  STARTER_TEMPLATES,
  HtmlMotionEngineAdapter,
  HyperFramesEngineAdapter,
} from '../src/index.js';

const TEST_DIR = path.resolve('.studio', 'content', 'phase27a-cost-tests');
const CLIPS_DIR = path.join(TEST_DIR, 'clips');
const STORE_DIR = path.join(TEST_DIR, 'veo-operations');

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
    `"${ffmpegBin}" -f lavfi -i color=c=green:s=64x64:d=1 -r 24 -vcodec libx264 -pix_fmt yuv420p -y "${filePath}"`,
    { stdio: 'pipe' }
  );
  return fs.readFileSync(filePath);
}

describe('Phase 27A — Free-First Video Mode & Paid API Safety', () => {
  const origCostMode = process.env.VIDEO_COST_MODE;
  const origAllowPaid = process.env.ALLOW_PAID_VIDEO_API;
  const origKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    // Reset to clean defaults
    delete process.env.VIDEO_COST_MODE;
    delete process.env.ALLOW_PAID_VIDEO_API;
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (origCostMode !== undefined) process.env.VIDEO_COST_MODE = origCostMode;
    else delete process.env.VIDEO_COST_MODE;

    if (origAllowPaid !== undefined) process.env.ALLOW_PAID_VIDEO_API = origAllowPaid;
    else delete process.env.ALLOW_PAID_VIDEO_API;

    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;

    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ─── 1. Policy & Authorization Defaults ─────────────────────────────────────

  it('T1 — resolveVideoCostMode: defaults to FREE_ONLY when env is absent or invalid', () => {
    expect(resolveVideoCostMode()).toBe('FREE_ONLY');
    process.env.VIDEO_COST_MODE = '';
    expect(resolveVideoCostMode()).toBe('FREE_ONLY');
    process.env.VIDEO_COST_MODE = 'invalid-mode';
    expect(resolveVideoCostMode()).toBe('FREE_ONLY');
    process.env.VIDEO_COST_MODE = 'PAID_ALLOWED';
    expect(resolveVideoCostMode()).toBe('PAID_ALLOWED');
  });

  it('T2 — isPaidVideoAllowed: requires dual explicit authorization', () => {
    // Default: false
    expect(isPaidVideoAllowed()).toBe(false);

    // Only VIDEO_COST_MODE=PAID_ALLOWED: false
    process.env.VIDEO_COST_MODE = 'PAID_ALLOWED';
    expect(isPaidVideoAllowed()).toBe(false);

    // Only ALLOW_PAID_VIDEO_API=true: false
    delete process.env.VIDEO_COST_MODE;
    process.env.ALLOW_PAID_VIDEO_API = 'true';
    expect(isPaidVideoAllowed()).toBe(false);

    // Both active: true
    process.env.VIDEO_COST_MODE = 'PAID_ALLOWED';
    process.env.ALLOW_PAID_VIDEO_API = 'true';
    expect(isPaidVideoAllowed()).toBe(true);

    // Explicit override parameters take precedence
    expect(isPaidVideoAllowed('FREE_ONLY', true)).toBe(false);
    expect(isPaidVideoAllowed('PAID_ALLOWED', false)).toBe(false);
    expect(isPaidVideoAllowed('PAID_ALLOWED', true)).toBe(true);
  });

  // ─── 2. Paid Provider Guard & Accidental Billing Safety ───────────────────────

  it('T3 — GeminiVeoVideoProvider.generateClip: BLOCKS paid generation in FREE_ONLY mode even with clientFactory', async () => {
    let generateVideosCalled = false;
    const mockClientFactory = () => ({
      models: {
        generateVideos: async () => {
          generateVideosCalled = true;
          return { name: 'operations/paid-op', done: true };
        },
      },
      operations: {
        getVideosOperation: async () => ({ done: true }),
      },
      files: {
        download: async () => {},
      },
    });

    const provider = new GeminiVeoVideoProvider({
      clientFactory: mockClientFactory,
      costMode: 'FREE_ONLY',
      allowPaidApi: false,
    });

    await expect(
      provider.generateClip({
        prompt: 'Cinematic hyper-realistic hero shot in 4k',
      })
    ).rejects.toThrow(PaidProviderDisabledError);

    // GUARANTEE: zero network generation requests submitted!
    expect(generateVideosCalled).toBe(false);
  });

  it('T4 — GeminiVeoVideoProvider.generateClip: ignores existence of GEMINI_API_KEY when in FREE_ONLY mode', async () => {
    process.env.GEMINI_API_KEY = 'fake-gemini-key-12345';
    // FREE_ONLY is default

    const provider = new GeminiVeoVideoProvider({
      apiKey: 'fake-gemini-key-12345',
    });

    await expect(
      provider.generateClip({
        prompt: 'Cinematic space battle',
      })
    ).rejects.toThrow(PaidProviderDisabledError);
  });

  it('T5 — GeminiVeoVideoProvider.generateClip: permits generation when dual authorization is provided', async () => {
    let generateVideosCalled = false;
    const fakeMp4 = path.join(TEST_DIR, 'sample.mp4');
    const bytes = createRealMp4(fakeMp4);

    const mockClientFactory = () => ({
      models: {
        generateVideos: async () => {
          generateVideosCalled = true;
          return { name: 'operations/authorized-op', done: false };
        },
      },
      operations: {
        getVideosOperation: async () => ({
          name: 'operations/authorized-op',
          done: true,
          response: {
            generatedVideos: [{ video: { uri: 'https://example.com/video.mp4', videoBytes: bytes.toString('base64') } }],
          },
        }),
      },
      files: {
        download: async (p: any) => {
          fs.writeFileSync(p.downloadPath, bytes);
        },
      },
    });

    const provider = new GeminiVeoVideoProvider({
      clientFactory: mockClientFactory,
      costMode: 'PAID_ALLOWED',
      allowPaidApi: true,
      pollIntervalMs: 0,
      operationStoreDir: STORE_DIR,
    });

    const result = await provider.generateClip({
      prompt: 'Authorized cinematic shot',
      outputDir: path.join(TEST_DIR, 'auth-clip'),
    });

    expect(generateVideosCalled).toBe(true);
    expect(result.generationSource).toBe('LIVE_PROVIDER');
  });

  // ─── 3. Error Classification ──────────────────────────────────────────────────

  it('T6 — categorizeError: accurately distinguishes error codes and avoids confusing UX', () => {
    const provider = new GeminiVeoVideoProvider();

    // PAID_PROVIDER_DISABLED
    expect(provider.categorizeError(new PaidProviderDisabledError())).toBe('PAID_PROVIDER_DISABLED');
    expect(provider.categorizeError(new Error('Paid video generation API is disabled by policy (FREE_ONLY mode)'))).toBe('PAID_PROVIDER_DISABLED');

    // QUOTA_EXCEEDED
    expect(provider.categorizeError(new Error('RESOURCE_EXHAUSTED: 429 quota exceeded'))).toBe('QUOTA_EXCEEDED');
    expect(provider.categorizeError(new Error('Quota limit reached for model'))).toBe('QUOTA_EXCEEDED');
    expect(provider.categorizeError(new Error('Billing not enabled for project'))).toBe('QUOTA_EXCEEDED');

    // RATE_LIMITED
    expect(provider.categorizeError(new Error('Rate limit exceeded: too many requests'))).toBe('RATE_LIMITED');

    // AUTH_ERROR
    expect(provider.categorizeError(new Error('401 Unauthorized API key not valid'))).toBe('AUTH_ERROR');
    expect(provider.categorizeError(new Error('403 Forbidden permission denied'))).toBe('AUTH_ERROR');

    // PROVIDER_UNAVAILABLE
    expect(provider.categorizeError(new Error('503 Service Unavailable ECONNREFUSED'))).toBe('PROVIDER_UNAVAILABLE');
    expect(provider.categorizeError(new Error('Network error ENOTFOUND'))).toBe('PROVIDER_UNAVAILABLE');

    // TIMEOUT
    expect(provider.categorizeError(new Error('Operation timed out'))).toBe('TIMEOUT');
  });

  // ─── 4. Free-First Router & Cost Decision Matrix ──────────────────────────────

  it('T7 — FreeFirstVideoRouter.classifyPrompt: classifies prompts accurately without LLM latency', () => {
    expect(FreeFirstVideoRouter.classifyPrompt('Minimal title card with clean typography')).toBe('TITLE');
    expect(FreeFirstVideoRouter.classifyPrompt('Outro card with subscribe call to action')).toBe('OUTRO');
    expect(FreeFirstVideoRouter.classifyPrompt('Animated bar chart showing quarterly growth data viz')).toBe('DATA_CHART');
    expect(FreeFirstVideoRouter.classifyPrompt('Infographic callout showing 10x faster statistic')).toBe('INFOGRAPHIC');
    expect(FreeFirstVideoRouter.classifyPrompt('Explainer video showing step 1 and step 2 workflow tutorial')).toBe('EXPLAINER');
    expect(FreeFirstVideoRouter.classifyPrompt('UI demo window with button and browser dashboard mockup')).toBe('UI_DEMO');
    expect(FreeFirstVideoRouter.classifyPrompt('Motion graphic with kinetic particles and abstract rotating shapes')).toBe('MOTION_GRAPHIC');
    expect(FreeFirstVideoRouter.classifyPrompt('Cinematic drone shot of an actor walking through a dramatic forest')).toBe('CINEMATIC');
  });

  it('T8 — FreeFirstVideoRouter.planRoute: deterministic local tasks route to FREE_LOCAL engines with $0 cost', () => {
    const planTitle = FreeFirstVideoRouter.planRoute({
      prompt: 'Minimal title card: AI Animation Studio',
      costMode: 'FREE_ONLY',
    });

    expect(planTitle.route).toBe('LOCAL_RENDER');
    expect(planTitle.engineId).toBe('html-motion');
    expect(planTitle.costClass).toBe('FREE_LOCAL');
    expect(planTitle.estimatedPaidCostUsd).toBe(0);
    expect(planTitle.manualActionsRequired).toBe(0);

    const planMotion = FreeFirstVideoRouter.planRoute({
      prompt: 'Motion graphic kinetic shapes particle accent',
      costMode: 'FREE_ONLY',
    });

    expect(planMotion.route).toBe('LOCAL_RENDER');
    expect(planMotion.engineId).toBe('hyperframes');
    expect(planMotion.costClass).toBe('FREE_LOCAL');
    expect(planMotion.estimatedPaidCostUsd).toBe(0);
  });

  it('T9 — FreeFirstVideoRouter.planRoute: cinematic prompts in FREE_ONLY route to GOOGLE_FLOW_HANDOFF', () => {
    const planCinematic = FreeFirstVideoRouter.planRoute({
      prompt: 'Cinematic wide angle photorealistic film scene of a young engineer',
      costMode: 'FREE_ONLY',
    });

    expect(planCinematic.route).toBe('GOOGLE_FLOW_HANDOFF');
    expect(planCinematic.engineId).toBe('google-flow');
    expect(planCinematic.costClass).toBe('FREE_EXTERNAL');
    expect(planCinematic.paidApiBlocked).toBe(true);
    expect(planCinematic.estimatedPaidCostUsd).toBe(0);
    expect(planCinematic.manualActionsRequired).toBe(1);
    expect(planCinematic.rationale).toContain('FREE_ONLY mode');
  });

  it('T10 — FreeFirstVideoRouter.createFlowClipHandoff: generates operator-ready package without network automation', async () => {
    const handoff = await FreeFirstVideoRouter.createFlowClipHandoff('A mysterious cloaked traveler stands in the rain', {
      projectId: 'proj_test',
      outputBaseDir: path.join(TEST_DIR, 'flow-handoff-test'),
      aspectRatio: '16:9',
      durationSeconds: 4,
    });

    expect(fs.existsSync(handoff.promptPath)).toBe(true);
    expect(fs.existsSync(handoff.instructionsPath)).toBe(true);
    expect(fs.existsSync(handoff.manifestPath)).toBe(true);

    const instructions = fs.readFileSync(handoff.instructionsPath, 'utf8');
    expect(instructions).toContain('Google Flow Operator Handoff Package');
    expect(instructions).toContain('A mysterious cloaked traveler stands in the rain');

    const manifest = JSON.parse(fs.readFileSync(handoff.manifestPath, 'utf8'));
    expect(manifest.route).toBe('GOOGLE_FLOW_HANDOFF');
    expect(manifest.estimatedPaidCostUsd).toBe(0);
  });

  // ─── 5. Template Manifest & Registry ──────────────────────────────────────────

  it('T11 — TemplateRegistry: contains all 7 starter categories and compiles working HTML', () => {
    const registry = TemplateRegistry.getInstance();
    const categories = ['TITLE', 'OUTRO', 'DATA_CHART', 'INFOGRAPHIC', 'EXPLAINER', 'UI_DEMO', 'MOTION_GRAPHIC'] as const;

    for (const cat of categories) {
      const template = registry.findBestTemplate(cat);
      expect(template).toBeDefined();
      expect(template?.costClass).toBe('FREE_LOCAL');
      expect(template?.category).toBe(cat);

      const html = template?.compileHtml({ title: 'Test Title', headline: 'Test Headline' });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('__hyperframesSeek');
    }
  });

  // ─── 6. ClipService Free Mode & Zero-Cost Dry-Run ─────────────────────────────

  it('T12 — ClipService: dryRun returns route plan with zero network calls and $0 cost', async () => {
    const svc = new ClipService({
      outputBaseDir: CLIPS_DIR,
      costMode: 'FREE_ONLY',
    });

    const result = await svc.generateClip({
      prompt: 'Clean minimal title card for AI Animation Studio',
      dryRun: true,
    });

    expect(result.status).toBe('READY');
    expect(result.routePlan?.route).toBe('LOCAL_RENDER');
    expect(result.routePlan?.costClass).toBe('FREE_LOCAL');
    expect(result.routePlan?.estimatedPaidCostUsd).toBe(0);
    expect(result.routePlan?.manualActionsRequired).toBe(0);
    expect(result.physicalPath).toBe('');
  });

  it('T13 — ClipService: dryRun on cinematic prompt outputs Flow handoff route in FREE_ONLY mode', async () => {
    const svc = new ClipService({
      outputBaseDir: CLIPS_DIR,
      costMode: 'FREE_ONLY',
    });

    const result = await svc.generateClip({
      prompt: 'Cinematic photorealistic character scene in neon rain',
      dryRun: true,
    });

    expect(result.status).toBe('READY');
    expect(result.routePlan?.route).toBe('GOOGLE_FLOW_HANDOFF');
    expect(result.routePlan?.paidApiBlocked).toBe(true);
    expect(result.routePlan?.estimatedPaidCostUsd).toBe(0);
    expect(result.routePlan?.manualActionsRequired).toBe(1);
  });

  it('T14 — ClipService: generative prompt in FREE_ONLY creates Flow handoff package without calling paid Veo', async () => {
    const svc = new ClipService({
      outputBaseDir: CLIPS_DIR,
      costMode: 'FREE_ONLY',
      enableQA: false,
    });

    const result = await svc.generateClip({
      prompt: 'Cinematic hyper-realistic portrait of an astronaut',
    });

    expect(result.status).toBe('PAID_PROVIDER_DISABLED');
    expect(result.errorCode).toBe('PAID_PROVIDER_DISABLED');
    expect(result.provider).toBe('google-flow');
    expect(result.flowHandoff).toBeDefined();
    expect(fs.existsSync(result.flowHandoff!.instructionsPath)).toBe(true);
    expect(result.failureReason).toContain('FREE_ONLY mode');
  });

  it('T15 — Engine Capabilities: both HtmlMotion and HyperFrames conform to FREE_LOCAL', () => {
    const htmlAdapter = new HtmlMotionEngineAdapter();
    expect(htmlAdapter.capabilities.costClass).toBe('FREE_LOCAL');
    expect(htmlAdapter.capabilities.renderTarget).toBe('headless-browser');

    const hfAdapter = new HyperFramesEngineAdapter();
    expect(hfAdapter.capabilities.costClass).toBe('FREE_LOCAL');
    expect(hfAdapter.capabilities.renderTarget).toBe('headless-browser');
  });
});
