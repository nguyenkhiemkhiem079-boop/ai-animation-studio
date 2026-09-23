import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LiveAuthorizationPolicy,
  GeminiProvider,
  LiveProviderPreflight,
  ProductionSafetyError,
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
} from '../src/index.js';

describe('Phase 19.18 — Live-Safety & Live Authorization Gate', () => {
  const originalEnv = process.env.RUN_LIVE_PROVIDER_TESTS;
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.RUN_LIVE_PROVIDER_TESTS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.RUN_LIVE_PROVIDER_TESTS = originalEnv;
    } else {
      delete process.env.RUN_LIVE_PROVIDER_TESTS;
    }
    if (originalKey !== undefined) {
      process.env.GEMINI_API_KEY = originalKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it('Requirement 1: evaluates false when RUN_LIVE_PROVIDER_TESTS is unset or false', () => {
    expect(LiveAuthorizationPolicy.isLiveAuthorized()).toBe(false);

    process.env.RUN_LIVE_PROVIDER_TESTS = 'false';
    expect(LiveAuthorizationPolicy.isLiveAuthorized()).toBe(false);

    process.env.RUN_LIVE_PROVIDER_TESTS = '0';
    expect(LiveAuthorizationPolicy.isLiveAuthorized()).toBe(false);
  });

  it('Requirement 2: evaluates true only when explicit flag is true or RUN_LIVE_PROVIDER_TESTS=true', () => {
    expect(LiveAuthorizationPolicy.isLiveAuthorized({ explicitLiveFlag: true })).toBe(true);

    process.env.RUN_LIVE_PROVIDER_TESTS = 'true';
    expect(LiveAuthorizationPolicy.isLiveAuthorized()).toBe(true);
  });

  it('Requirement 3: assertLiveAuthorized throws ProductionSafetyError with LIVE PROVIDER DISABLED message', () => {
    expect(() => {
      LiveAuthorizationPolicy.assertLiveAuthorized('Story analysis');
    }).toThrow(ProductionSafetyError);

    try {
      LiveAuthorizationPolicy.assertLiveAuthorized('Story analysis');
    } catch (err: any) {
      expect(err.message).toContain('LIVE PROVIDER DISABLED');
      expect(err.message).toContain('--live');
      expect(err.message).toContain('RUN_LIVE_PROVIDER_TESTS=true');
    }
  });

  it('Requirement 4: GeminiProvider with valid API key blocks generateText fail-closed when live opt-in is absent', async () => {
    const provider = new GeminiProvider({
      apiKey: 'AIzaSyFakeKeyForLiveSafetyUnitTesting12345678',
      allowLiveCalls: false,
    });

    expect(provider.isConfigured()).toBe(true);

    await expect(
      provider.generateText({
        taskType: 'STORY_ANALYSIS',
        prompt: 'Analyze this narrative beat',
      })
    ).rejects.toThrow(ProductionSafetyError);

    await expect(
      provider.generateText({
        taskType: 'STORY_ANALYSIS',
        prompt: 'Analyze this narrative beat',
      })
    ).rejects.toThrow(/LIVE PROVIDER DISABLED/);
  });

  it('Requirement 5: GeminiProvider.diagnoseHealth(true) skips live network call when unauthorized', async () => {
    const provider = new GeminiProvider({
      apiKey: 'AIzaSyFakeKeyForLiveSafetyUnitTesting12345678',
      allowLiveCalls: false,
    });

    const report = await provider.diagnoseHealth(true);
    expect(report.status).toBe('AVAILABLE');
    expect(report.configured).toBe(true);
    expect(report.message).toContain('Configured offline. Live connection requires explicit opt-in');
    expect(report.details).toContain('LIVE PROVIDER DISABLED');
  });

  it('Requirement 6: LiveProviderPreflight rejects live execution when opt-in is not granted', async () => {
    const provider = new GeminiProvider({
      apiKey: 'AIzaSyFakeKeyForLiveSafetyUnitTesting12345678',
    });

    const result = await LiveProviderPreflight.verify({
      provider,
      requireLiveOptIn: true,
      liveConfirmed: false,
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('Live execution opt-in not granted'))).toBe(true);
  });
});
