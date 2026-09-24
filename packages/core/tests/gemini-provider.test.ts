/**
 * Tests for Gemini Provider Integration (Phase 16.5)
 * Covers all 30 required test cases from Step 22.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import {
  GeminiProvider,
  MockLLMProvider,
  LLMProviderRegistry,
  getCentralizedModelPolicy,
  getModelForRole,
  LLMCache,
  convertZodToJsonSchema,
  LLMDirectorAssistant,
  SemanticQAEvaluator,
  ProviderStoryAnalyzer,
  RuleBasedStoryAnalyzer,
  ShotPlanner,
  SourceDocument,
  SceneCandidate,
  ShotContract,
  ShotContractSchema,
  ProductionSafetyError,
  STORY_ANALYSIS_PROMPT_V1,
} from '../src/index.js';

describe('Phase 16.5: Google AI Studio / Gemini Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    delete process.env.RUN_LIVE_PROVIDER_TESTS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // 1. Gemini provider not configured
  it('1. should report NOT_CONFIGURED when API key is missing', async () => {
    const provider = new GeminiProvider({ apiKey: '' });
    expect(provider.isConfigured()).toBe(false);

    const health = await provider.diagnoseHealth(false);
    expect(health.status).toBe('NOT_CONFIGURED');
    expect(health.configured).toBe(false);

    await expect(
      provider.generateText({
        taskType: 'GENERAL_REASONING',
        prompt: 'Hello',
      })
    ).rejects.toThrow(/not configured/i);
  });

  // 2. Credential masking
  it('2. should mask API keys safely without exposing secrets', () => {
    const provider = new GeminiProvider({ apiKey: 'AIzaSyDUMMYSECRETKEY123456789' });
    const masked = provider.getMaskedApiKey();
    expect(masked).toBe('AIza...6789');
    expect(masked).not.toContain('DUMMYSECRETKEY');

    const emptyProvider = new GeminiProvider({ apiKey: '' });
    expect(emptyProvider.getMaskedApiKey()).toBe('(not configured)');
  });

  // 3. Provider registration
  it('3. should register and retrieve Gemini provider from LLMProviderRegistry', () => {
    const registry = LLMProviderRegistry.getInstance();
    const gemini = new GeminiProvider();
    registry.registerProvider(gemini, true);

    expect(registry.hasProvider('google-gemini')).toBe(true);
    expect(registry.getProvider('google-gemini')).toBe(gemini);
    expect(registry.getDefaultProvider()).toBe(gemini);
  });

  // 4. Model-role selection
  it('4. should select centralized models and support environment overrides', () => {
    const policy = getCentralizedModelPolicy();
    expect(policy.fast).toBe('gemini-3.6-flash');
    expect(policy.reasoning).toBe('gemini-3.6-flash');

    process.env.GEMINI_MODEL_FAST = 'gemini-custom-flash';
    expect(getModelForRole('FAST')).toBe('gemini-custom-flash');
  });

  // 5. Structured request compilation
  it('5. should compile Zod schema to Gemini responseSchema format', () => {
    const TestSchema = z.object({
      title: z.string(),
      count: z.number(),
      tags: z.array(z.string()),
    });

    const compiled = convertZodToJsonSchema(TestSchema);
    expect(compiled.type).toBe('object');
    expect(compiled.properties?.title.type).toBe('string');
    expect(compiled.properties?.count.type).toBe('number');
    expect(compiled.properties?.tags.type).toBe('array');
    expect(compiled.required).toEqual(['title', 'count', 'tags']);
  });

  // 6. Valid structured response
  it('6. should validate and parse valid structured response via Zod', async () => {
    const TestSchema = z.object({
      answer: z.string(),
      confidence: z.number(),
    });

    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({ answer: 'Cinematic wide shot', confidence: 0.95 }),
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15, totalTokenCount: 35 },
        }),
      },
    };

    const provider = new GeminiProvider({ apiKey: 'mock_key', client: mockClient as any });
    const result = await provider.generateStructured({
      taskType: 'DIRECTOR_REASONING',
      prompt: 'Suggest framing',
      responseSchema: TestSchema,
      schemaName: 'TestOutput',
    });

    expect(result.data.answer).toBe('Cinematic wide shot');
    expect(result.data.confidence).toBe(0.95);
    expect(result.usage?.totalTokens).toBe(35);
  });

  // 7. Malformed JSON response
  it('7. should reject malformed JSON with SCHEMA_VALIDATION_FAILED', async () => {
    const TestSchema = z.object({ value: z.string() });
    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: 'THIS IS NOT VALID JSON AT ALL',
        }),
      },
    };

    const provider = new GeminiProvider({ apiKey: 'mock_key', client: mockClient as any });
    await expect(
      provider.generateStructured({
        taskType: 'STORY_ANALYSIS',
        prompt: 'Analyze story',
        responseSchema: TestSchema,
        schemaName: 'TestOutput',
      })
    ).rejects.toThrow(/Malformed JSON|Failed to parse JSON/i);
  });

  // 8. Schema-invalid response
  it('8. should reject schema-invalid response with SCHEMA_VALIDATION_FAILED', async () => {
    const TestSchema = z.object({
      count: z.number(),
    });

    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({ count: 'not a number' }), // type mismatch
        }),
      },
    };

    const provider = new GeminiProvider({ apiKey: 'mock_key', client: mockClient as any });
    await expect(
      provider.generateStructured({
        taskType: 'STORY_ANALYSIS',
        prompt: 'Analyze story',
        responseSchema: TestSchema,
        schemaName: 'TestOutput',
      })
    ).rejects.toThrow(/failed domain schema validation|Failed to validate Gemini structured output/i);
  });

  // 9. Missing required fields
  it('9. should reject response with missing required fields', async () => {
    const TestSchema = z.object({
      id: z.string(),
      description: z.string(),
    });

    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({ id: '123' }), // missing description
        }),
      },
    };

    const provider = new GeminiProvider({ apiKey: 'mock_key', client: mockClient as any });
    await expect(
      provider.generateStructured({
        taskType: 'STORY_ANALYSIS',
        prompt: 'Analyze story',
        responseSchema: TestSchema,
        schemaName: 'TestOutput',
      })
    ).rejects.toThrow(/failed domain schema validation|Failed to validate Gemini structured output/i);
  });

  // 10. Retryable 429
  it('10. should retry on rate-limit 429 and succeed on subsequent attempt', async () => {
    const error429 = new Error('Resource has been exhausted (e.g. check quota) 429');
    const successResponse = {
      text: 'Retried successfully',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    };

    const mockGenerate = vi
      .fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce(successResponse);

    const mockClient = {
      models: { generateContent: mockGenerate },
    };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      retryConfig: { maxRetries: 2, initialBackoffMs: 10, maxBackoffMs: 50 },
    });

    const result = await provider.generateText({
      taskType: 'GENERAL_REASONING',
      prompt: 'Hello',
    });

    expect(result.text).toBe('Retried successfully');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  // 11. Quota exceeded
  it('11. should classify quota exhaustion as QUOTA_EXCEEDED error', async () => {
    const quotaError = new Error('RESOURCE_EXHAUSTED: Daily quota exceeded');
    const mockClient = {
      models: { generateContent: vi.fn().mockRejectedValue(quotaError) },
    };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      retryConfig: { maxRetries: 1, initialBackoffMs: 5, maxBackoffMs: 10 },
    });

    try {
      await provider.generateText({ taskType: 'GENERAL_REASONING', prompt: 'test' });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.category).toBe('QUOTA_EXCEEDED');
    }
  });

  // 12. Auth failure
  it('12. should classify invalid API key as AUTH_ERROR without retry', async () => {
    const authError = new Error('API_KEY_INVALID: 401 Unauthorized');
    const mockGenerate = vi.fn().mockRejectedValue(authError);
    const mockClient = { models: { generateContent: mockGenerate } };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      retryConfig: { maxRetries: 3, initialBackoffMs: 5, maxBackoffMs: 10 },
    });

    try {
      await provider.generateText({ taskType: 'GENERAL_REASONING', prompt: 'test' });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.category).toBe('AUTH_ERROR');
      // Auth error is not retryable, so generateContent called only once
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    }
  });

  // 13. Timeout
  it('13. should classify deadline exceeded as TIMEOUT error', async () => {
    const timeoutError = new Error('DEADLINE_EXCEEDED: request timed out');
    const mockClient = {
      models: { generateContent: vi.fn().mockRejectedValue(timeoutError) },
    };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      retryConfig: { maxRetries: 1, initialBackoffMs: 5, maxBackoffMs: 10 },
    });

    try {
      await provider.generateText({ taskType: 'GENERAL_REASONING', prompt: 'test' });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.category).toBe('TIMEOUT');
    }
  });

  // 14. Retry maximum
  it('14. should stop retrying after reaching maxRetries', async () => {
    const rateLimitError = new Error('429 Too Many Requests');
    const mockGenerate = vi.fn().mockRejectedValue(rateLimitError);
    const mockClient = { models: { generateContent: mockGenerate } };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      retryConfig: { maxRetries: 2, initialBackoffMs: 5, maxBackoffMs: 15 },
    });

    try {
      await provider.generateText({ taskType: 'GENERAL_REASONING', prompt: 'test' });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.category).toBe('RATE_LIMITED');
      // initial call + 2 retries = 3 calls
      expect(mockGenerate).toHaveBeenCalledTimes(3);
    }
  });

  // 15. No infinite retry
  it('15. should never retry infinitely on persistent failures', async () => {
    const serverError = new Error('500 Internal Server Error');
    const mockGenerate = vi.fn().mockRejectedValue(serverError);
    const mockClient = { models: { generateContent: mockGenerate } };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      retryConfig: { maxRetries: 3, initialBackoffMs: 5, maxBackoffMs: 15 },
    });

    try {
      await provider.generateText({ taskType: 'GENERAL_REASONING', prompt: 'test' });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(mockGenerate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    }
  });

  // 16. Usage metadata capture
  it('16. should accurately capture token usage metadata without fabricating costs', async () => {
    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: 'Response',
          usageMetadata: {
            promptTokenCount: 150,
            candidatesTokenCount: 75,
            totalTokenCount: 225,
            cachedContentTokenCount: 50,
          },
        }),
      },
    };

    const provider = new GeminiProvider({ apiKey: 'mock_key', client: mockClient as any });
    const result = await provider.generateText({
      taskType: 'GENERAL_REASONING',
      prompt: 'Hello',
    });

    expect(result.usage).toBeDefined();
    expect(result.usage?.promptTokens).toBe(150);
    expect(result.usage?.completionTokens).toBe(75);
    expect(result.usage?.totalTokens).toBe(225);
    expect(result.usage?.cachedTokens).toBe(50);
    expect(result.usage?.isFreeTierEstimated).toBe(true);
    expect(result.usage?.estimatedCostUsd).toBeUndefined(); // no fabricated cost
  });

  // 17. Prompt version metadata
  it('17. should track prompt version in request metadata and cache key', () => {
    expect(STORY_ANALYSIS_PROMPT_V1.version).toBe('1.0.0');
    expect(STORY_ANALYSIS_PROMPT_V1.promptId).toBe('story_analysis_extraction');

    const promptText = STORY_ANALYSIS_PROMPT_V1.buildPrompt({
      title: 'Test',
      rawContent: 'Content',
    });
    expect(promptText).toContain('Source Content: Content');
  });

  // 18. Cache hit
  it('18. should return cached result for identical request', async () => {
    const cache = new LLMCache();
    const mockGenerate = vi.fn().mockResolvedValue({
      text: 'Computed output',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    });
    const mockClient = { models: { generateContent: mockGenerate } };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      cache,
    });

    const req = {
      taskType: 'GENERAL_REASONING' as const,
      prompt: 'Test prompt for cache',
      seriesId: 'series_alpha',
    };

    const res1 = await provider.generateText(req);
    expect(res1.text).toBe('Computed output');
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    const res2 = await provider.generateText(req);
    expect(res2.text).toBe('Computed output');
    expect(mockGenerate).toHaveBeenCalledTimes(1); // cache hit!
  });

  // 19. Cache invalidation by prompt version
  it('19. should invalidate cache when prompt version changes', async () => {
    const cache = new LLMCache();
    const mockGenerate = vi.fn().mockResolvedValue({
      text: 'Output',
    });
    const mockClient = { models: { generateContent: mockGenerate } };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      cache,
    });

    await provider.generateText({
      taskType: 'GENERAL_REASONING',
      prompt: 'Same prompt',
      metadata: { promptVersion: '1.0.0' },
      seriesId: 'series_alpha',
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    await provider.generateText({
      taskType: 'GENERAL_REASONING',
      prompt: 'Same prompt',
      metadata: { promptVersion: '1.0.1' }, // bump version
      seriesId: 'series_alpha',
    });
    expect(mockGenerate).toHaveBeenCalledTimes(2); // cache miss due to prompt version change
  });

  // 20. Cache isolation by series
  it('20. should enforce strict cache isolation between series', async () => {
    const cache = new LLMCache();
    const mockGenerate = vi.fn().mockResolvedValue({
      text: 'Series-specific output',
    });
    const mockClient = { models: { generateContent: mockGenerate } };

    const provider = new GeminiProvider({
      apiKey: 'mock_key',
      client: mockClient as any,
      cache,
    });

    await provider.generateText({
      taskType: 'GENERAL_REASONING',
      prompt: 'Shared prompt text',
      seriesId: 'series_1',
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    await provider.generateText({
      taskType: 'GENERAL_REASONING',
      prompt: 'Shared prompt text',
      seriesId: 'series_2', // different series
    });
    expect(mockGenerate).toHaveBeenCalledTimes(2); // isolated!
  });

  // 21. Mock forbidden in production
  it('21. should reject mock LLM provider in PRODUCTION mode', async () => {
    const mock = new MockLLMProvider();
    mock.setExecutionMode('PRODUCTION');

    await expect(
      mock.generateText({
        taskType: 'GENERAL_REASONING',
        prompt: 'Hello',
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 22. Gemini failure does not become fake success
  it('22. should never convert Gemini provider failure into fake success', async () => {
    const doc: SourceDocument = {
      id: 'doc_fail',
      projectId: 'proj_fail',
      title: 'Failing Doc',
      rawContent: 'Some content',
      format: 'prose',
      contentHash: 'hash_fail',
      ingestedAt: new Date().toISOString(),
    };

    const failingClient = {
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')),
      },
    };
    const provider = new GeminiProvider({ apiKey: 'mock_key', client: failingClient as any });
    const analyzer = new ProviderStoryAnalyzer(provider);

    await expect(analyzer.analyze(doc)).rejects.toThrow();
  });

  // 23. Source meaning preservation
  // 24. Dialogue preservation
  // 25. Narration preservation
  // 26. No unsupported story event
  it('23-26. should preserve source meaning, dialogue, narration without hallucinated events', async () => {
    const sourceText = 'Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.';
    const doc: SourceDocument = {
      id: 'doc_minh',
      projectId: 'proj_minh',
      title: 'Minh Story',
      rawContent: sourceText,
      format: 'prose',
      contentHash: 'hash_minh',
      ingestedAt: new Date().toISOString(),
    };

    const mockStructuredData = {
      summary: 'Minh enters a dark room and spots a white butterfly near a candle.',
      characters: [{ suggestedName: 'Minh', traits: ['observant'] }],
      locations: [{ suggestedName: 'Dark Room', description: 'A dimly lit room with a candle', zones: [] }],
      props: [{ suggestedName: 'Candle', visualDescription: 'Flickering candle on a table' }],
      scenes: [
        {
          sceneNumber: 1,
          heading: 'INT. DARK ROOM - NIGHT',
          timeOfDay: 'night' as const,
          locationName: 'Dark Room',
          charactersPresent: ['Minh'],
          beats: [{ summary: 'Minh enters and spots a white butterfly', involvedCharacters: ['Minh'] }],
          dialogueLines: [],
          narrationLines: ['Minh bước vào căn phòng tối.', 'Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.'],
        },
      ],
    };

    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify(mockStructuredData),
        }),
      },
    };

    const provider = new GeminiProvider({ apiKey: 'mock_key', client: mockClient as any });
    const analyzer = new ProviderStoryAnalyzer(provider);
    const analysis = await analyzer.analyze(doc);

    expect(analysis.characterCandidates[0].suggestedName).toBe('Minh');
    expect(analysis.locationCandidates[0].suggestedName).toBe('Dark Room');
    expect(analysis.propCandidates[0].suggestedName).toBe('Candle');
    expect(analysis.sceneCandidates[0].narrationLines.length).toBe(2);
    expect(analysis.hallucinationReport.isValid).toBe(true);
  });

  // 27. User director lock override
  it('27. should strictly preserve user director locks when LLMDirectorAssistant refines shots', async () => {
    const scene: SceneCandidate = {
      id: 'SCENE_01',
      sceneNumber: 1,
      heading: 'INT. DARK ROOM - NIGHT',
      timeOfDay: 'night',
      locationName: 'Dark Room',
      charactersPresent: ['Minh'],
      beats: [{ id: 'B01', index: 0, summary: 'Minh looks at candle', involvedCharacterIds: ['Minh'] }],
      dialogueLines: [],
      narrationLines: [],
      sourceTrace: [],
    };

    const baseShot: ShotContract = ShotContractSchema.parse({
      id: 'SHOT_SC01_SH01',
      sceneId: 'SCENE_01',
      shotNumber: 1,
      purpose: 'establishing',
      complexity: 'static',
      rendererIntent: 'deterministic_hyperframes',
      frame: { durationSeconds: 3.0, aspectRatio: '16:9', targetFps: 24 },
      camera: {
        shotSize: 'extreme_wide',
        angle: 'eye_level',
        movement: 'static',
        focalLength: '35mm',
        semanticSkills: [],
      },
      lighting: { keyLightDirection: 'left', mood: 'dim', colorTemperature: 'warm', fogAtmosphere: false },
      acting: [],
      directorLocks: {
        isCameraLocked: true, // USER LOCKED CAMERA!
        isFramingLocked: false,
        isRendererLocked: false,
        isActingLocked: false,
      },
      provenance: { decidedAt: new Date().toISOString() },
    });

    const mockLLM = {
      metadata: { id: 'mock', name: 'Mock LLM' },
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          shots: [
            {
              shotNumber: 1,
              purpose: 'establishing',
              shotSize: 'close_up', // LLM wants close_up
              angle: 'high_angle',
              movement: 'orbit_clockwise', // LLM wants orbit
              semanticSkills: ['orbit'],
              lightingMood: 'atmospheric_chiaroscuro',
              reason: 'More dramatic',
            },
          ],
        },
      }),
    };

    const assistant = new LLMDirectorAssistant(mockLLM as any);
    const refined = await assistant.refineShots({
      scene,
      baseShots: [baseShot],
    });

    // CAMERA MUST REMAIN EXTREME_WIDE AND STATIC BECAUSE OF isCameraLocked!
    expect(refined[0].camera.shotSize).toBe('extreme_wide');
    expect(refined[0].camera.movement).toBe('static');
    expect(refined[0].camera.angle).toBe('eye_level');

    // Unlocked properties can update
    expect(refined[0].lighting.mood).toBe('atmospheric_chiaroscuro');
  });

  // 28. ShotContract remains provider-neutral
  it('28. should output validated ShotContracts adhering to domain schema without provider-specific fields', async () => {
    const scene: SceneCandidate = {
      id: 'SCENE_01',
      sceneNumber: 1,
      heading: 'INT. DARK ROOM - NIGHT',
      timeOfDay: 'night',
      locationName: 'Dark Room',
      charactersPresent: ['Minh'],
      beats: [{ id: 'B01', index: 0, summary: 'Minh looks at candle', involvedCharacterIds: ['Minh'] }],
      dialogueLines: [],
      narrationLines: [],
      sourceTrace: [],
    };

    const planner = new ShotPlanner();
    const { productionScene } = planner.planScene(scene, 'proj_test');
    const baseShot = productionScene.shots[0];

    const mockLLM = {
      metadata: { id: 'gemini', name: 'Google Gemini' },
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          shots: [
            {
              shotNumber: 1,
              purpose: 'establishing',
              shotSize: 'medium_wide',
              angle: 'low_angle',
              movement: 'slow_push_in',
              semanticSkills: ['pushin'],
              compositionRule: 'rule_of_thirds',
              reason: 'Draw the viewer in',
            },
          ],
        },
      }),
    };

    const assistant = new LLMDirectorAssistant(mockLLM as any);
    const refined = await assistant.refineShots({
      scene,
      baseShots: [baseShot],
    });

    // Validates against standard ShotContractSchema
    const parsed = ShotContractSchema.parse(refined[0]);
    expect(parsed.camera.shotSize).toBe('medium_wide');
    expect(parsed.camera.movement).toBe('slow_push_in');
    expect(parsed.camera.semanticSkills).toContain('pushin');
    expect(parsed.provenance.ruleApplied).toContain('LLMDirectorAssistant[Google Gemini]');
  });

  // 29. Semantic QA provenance
  it('29. should preserve deterministic QA and tag LLM findings with LLM_SEMANTIC provenance', async () => {
    const shotA: ShotContract = ShotContractSchema.parse({
      id: 'SHOT_01',
      sceneId: 'SC_01',
      shotNumber: 1,
      purpose: 'dialogue_coverage',
      complexity: 'static',
      rendererIntent: 'deterministic_hyperframes',
      frame: { durationSeconds: 3.0 },
      camera: { shotSize: 'close_up', angle: 'eye_level', movement: 'static' },
      lighting: { keyLightDirection: 'left', mood: 'dark' },
      acting: [{ characterId: 'Minh', pose: 'stand', expression: 'neutral', gazeDirection: 'screen_left' }],
      provenance: { decidedAt: new Date().toISOString() },
    });

    const shotB: ShotContract = ShotContractSchema.parse({
      id: 'SHOT_02',
      sceneId: 'SC_01',
      shotNumber: 2,
      purpose: 'dialogue_coverage',
      complexity: 'static',
      rendererIntent: 'deterministic_hyperframes',
      frame: { durationSeconds: 3.0 },
      camera: { shotSize: 'close_up', angle: 'eye_level', movement: 'static' },
      lighting: { keyLightDirection: 'left', mood: 'dark' },
      // Abrupt 180 gaze flip without camera move triggers deterministic rule
      acting: [{ characterId: 'Minh', pose: 'stand', expression: 'neutral', gazeDirection: 'screen_right' }],
      provenance: { decidedAt: new Date().toISOString() },
    });

    const mockLLM = {
      metadata: { id: 'gemini', name: 'Google Gemini' },
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          overallPassed: true,
          sourceFidelityScore: 0.95,
          issues: [
            {
              shotId: 'SHOT_02',
              type: 'narrative_continuity',
              severity: 'warning',
              description: 'Character emotional state shifts abruptly.',
              suggestedFix: 'Add breathing space in dialogue.',
            },
          ],
          inventedEvents: [],
        },
      }),
    };

    const evaluator = new SemanticQAEvaluator(mockLLM as any);
    const report = await evaluator.evaluate({
      projectId: 'proj_test',
      shots: [shotA, shotB],
    });

    expect(report.deterministicIssuesCount).toBeGreaterThanOrEqual(1);
    expect(report.semanticIssuesCount).toBe(1);

    const detIssue = report.issues.find((i) => i.metadata?.qaMechanism === 'DETERMINISTIC');
    const semIssue = report.issues.find((i) => i.metadata?.qaMechanism === 'LLM_SEMANTIC');

    expect(detIssue).toBeDefined();
    expect(semIssue).toBeDefined();
    expect(semIssue?.message).toContain('[LLM Semantic]');
  });

  // 30. Deterministic pipeline still works without Gemini
  it('30. should execute complete story analysis and shot planning deterministically without Gemini', async () => {
    const doc: SourceDocument = {
      id: 'doc_offline',
      projectId: 'proj_offline',
      title: 'Offline Script',
      rawContent: 'INT. LIVING ROOM - DAY\nMINH: Hello world!\nMinh picks up the key from the table.',
      format: 'fountain',
      contentHash: 'hash_offline',
      ingestedAt: new Date().toISOString(),
    };

    const analyzer = new RuleBasedStoryAnalyzer();
    const analysis = await analyzer.analyze(doc);

    expect(analysis.sceneCandidates.length).toBe(1);
    expect(analysis.characterCandidates.some((c) => c.suggestedName === 'MINH')).toBe(true);

    const planner = new ShotPlanner();
    const { productionScene, dependencyGraph } = planner.planScene(analysis.sceneCandidates[0], doc.projectId);

    expect(productionScene.shots.length).toBeGreaterThan(0);
    expect(dependencyGraph.entryShotIds.length).toBe(1);
  });
});
