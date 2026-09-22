import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  VisualSemanticQAEvaluator,
  ShotContract,
  CharacterDNA,
  MediaToolchainDoctor,
  LLMProvider,
  LLMStructuredRequest,
  LLMStructuredResult,
  LLMTextRequest,
  LLMTextResult,
  LLMHealthReport,
  GeminiProvider,
  VisualQAOutput,
} from '../src/index.js';

describe('Phase 17.1 — Multimodal Provider Contract & Vision Gating', () => {
  const testDir = path.resolve('.studio', 'tests', 'multimodal-contract');
  const testVideo = path.join(testDir, 'contract_test_video.mp4');

  // Harmless base64 images for controlled fixture tests
  // 1x1 Red PNG
  const redPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // 1x1 Blue PNG
  const bluePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwGAqoxEwQAAAABJRU5ErkJggg==';

  const testShot: ShotContract = {
    id: 'SHOT_CONTRACT_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'static',
    rendererIntent: 'deterministic_hyperframes',
    frame: {
      durationSeconds: 1.0,
      aspectRatio: '16:9',
      targetFps: 24,
    },
    camera: {
      shotSize: 'medium',
      angle: 'eye_level',
      movement: 'static',
      focalLength: '50mm',
      semanticSkills: [],
    },
    acting: [
      {
        characterId: 'char_red_operative',
        pose: 'standing',
        expression: 'neutral',
        actionPrompt: 'Operative standing',
        gazeDirection: 'screen_right',
      },
    ],
    lighting: {
      mood: 'standard',
      colorTemperature: 'neutral',
      keyLightDirection: 'left',
      fogAtmosphere: false,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: { foreground: [], midground: [], background: [] },
    },
    transition: {
      type: 'cut',
      durationSeconds: 0,
    },
    audioCue: { sfx: [] },
    requiredAssetIds: [],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: true,
      isFramingLocked: true,
      isRendererLocked: true,
      isActingLocked: true,
    },
    provenance: {
      decidedAt: new Date().toISOString(),
    },
  };

  const redCharacter: CharacterDNA = {
    id: 'char_red_operative',
    seriesId: 'series_contract',
    name: 'Red Operative',
    aliases: ['Red'],
    description: 'Operative with vibrant crimson hair and red tactical armor.',
    visualAnchorPrompt: 'Crimson hair, tactical red jacket.',
    traits: ['Vibrant', 'Focused'],
    currentVersion: 1,
    versions: [],
    outfits: [{ id: 'outfit_red', name: 'Red Tactical', description: 'Red tactical gear', referenceAssetIds: [] }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    execSync(`"${ffmpeg}" -y -f lavfi -i testsrc=size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${testVideo}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('Step 23: Provider spy asserts image parts actually reach the provider with non-empty base64 bytes', async () => {
    let capturedRequest: LLMStructuredRequest<VisualQAOutput> | undefined;

    const spyProvider: LLMProvider = {
      metadata: {
        id: 'spy-multimodal-provider',
        name: 'Spy Multimodal Provider',
        version: '1.0.0',
        capabilities: ['llm', 'qa'],
        supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
        modelMapping: {
          FAST: 'test-model',
          REASONING: 'test-model',
          STRUCTURED: 'test-model',
          QA: 'test-model',
          VISION_QA: 'test-model-vision',
        },
        supportedTasks: ['CONTINUITY_QA'],
        isLocal: false,
        costEstimateUsdPerInvocation: 0,
        averageLatencyMs: 10,
        supportsImages: true,
        supportsMultimodalStructuredOutput: true,
      },
      healthCheck: async () => true,
      diagnoseHealth: async (): Promise<LLMHealthReport> => ({
        providerId: 'spy-multimodal-provider',
        name: 'Spy Multimodal Provider',
        status: 'AVAILABLE',
        isLocal: false,
        configured: true,
        capabilities: ['llm', 'qa'],
      }),
      generateText: async (req: LLMTextRequest): Promise<LLMTextResult> => {
        throw new Error('Not implemented');
      },
      generateStructured: async <T>(req: LLMStructuredRequest<T>): Promise<LLMStructuredResult<T>> => {
        capturedRequest = req as any;
        return {
          data: {
            identityConsistencyScore: 0.95,
            spatialPerspectiveScore: 0.92,
            visualDefectScore: 0.96,
            overallVisualContinuityScore: 0.94,
            passed: true,
            defects: [],
            retakeRecommendations: [],
          } as unknown as T,
          rawText: '{}',
          model: 'test-model-vision',
          providerId: 'spy-multimodal-provider',
          usage: { latencyMs: 25, retryCount: 0, costStatus: 'FREE_TIER' },
        };
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
    };

    const evaluator = new VisualSemanticQAEvaluator(spyProvider);
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_contract',
      shot: testShot,
      videoPath: testVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'turnaround_front',
          base64Data: redPngBase64,
          mimeType: 'image/png',
        },
      ],
      frameCount: 3,
    });

    expect(report.passed).toBe(true);
    expect(report.evaluationMechanism).toBe('MULTIMODAL_PROVIDER');
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.modelRole).toBe('VISION_QA');

    const msg = capturedRequest?.messages?.[0];
    expect(msg).toBeDefined();
    expect(Array.isArray(msg?.content)).toBe(true);

    const parts = msg?.content as any[];
    const textParts = parts.filter((p) => p.type === 'text');
    const imageParts = parts.filter((p) => p.type === 'image');

    expect(textParts.length).toBeGreaterThanOrEqual(1);
    // 1 canonical reference image + 3 extracted video frames = 4 image parts
    expect(imageParts.length).toBe(4);

    for (const img of imageParts) {
      expect(img.dataBase64).toBeDefined();
      expect(img.dataBase64.length).toBeGreaterThan(0);
      expect(['image/jpeg', 'image/png']).toContain(img.mimeType);
    }
  });

  it('Step 4 & 5: Text-only provider is not called multimodal and results in LOCAL_MEDIA_METADATA', async () => {
    const textOnlyProvider: LLMProvider = {
      metadata: {
        id: 'text-only-provider',
        name: 'Text Only Provider',
        version: '1.0.0',
        capabilities: ['llm', 'qa'],
        supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
        modelMapping: {
          FAST: 'text-model',
          REASONING: 'text-model',
          STRUCTURED: 'text-model',
          QA: 'text-model',
          VISION_QA: 'text-model',
        },
        supportedTasks: ['CONTINUITY_QA'],
        isLocal: false,
        costEstimateUsdPerInvocation: 0,
        averageLatencyMs: 10,
        supportsImages: false, // Text only!
        supportsMultimodalStructuredOutput: false,
      },
      healthCheck: async () => true,
      diagnoseHealth: async (): Promise<LLMHealthReport> => ({
        providerId: 'text-only-provider',
        name: 'Text Only Provider',
        status: 'AVAILABLE',
        isLocal: false,
        configured: true,
        capabilities: ['llm', 'qa'],
      }),
      generateText: async (): Promise<LLMTextResult> => {
        throw new Error('Not implemented');
      },
      generateStructured: async <T>(): Promise<LLMStructuredResult<T>> => {
        throw new Error('Should not be called for multimodal vision evaluation');
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
    };

    const evaluator = new VisualSemanticQAEvaluator(textOnlyProvider);
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_contract',
      shot: testShot,
      videoPath: testVideo,
      characterProfiles: [redCharacter],
    });

    expect(report.evaluationMechanism).toBe('LOCAL_MEDIA_METADATA');
    expect(report.identityConsistencyScore).toBeNull();
    expect(report.coverage?.identityVisual).toBe('NOT_EVALUATED');
  });

  it('Step 22: Controlled fixture differentiation (matching vs mismatched identity frames)', async () => {
    // Mock multimodal LLM that examines whether the reference matches the frame color
    const visionSimulator: LLMProvider = {
      metadata: {
        id: 'sim-vision',
        name: 'Simulated Vision Provider',
        version: '1.0.0',
        capabilities: ['llm', 'qa'],
        supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
        modelMapping: {
          FAST: 'sim-model',
          REASONING: 'sim-model',
          STRUCTURED: 'sim-model',
          QA: 'sim-model',
          VISION_QA: 'sim-model-vision',
        },
        supportedTasks: ['CONTINUITY_QA'],
        isLocal: true,
        costEstimateUsdPerInvocation: 0,
        averageLatencyMs: 5,
        supportsImages: true,
        supportsMultimodalStructuredOutput: true,
      },
      healthCheck: async () => true,
      diagnoseHealth: async (): Promise<LLMHealthReport> => ({
        providerId: 'sim-vision',
        name: 'Simulated Vision Provider',
        status: 'AVAILABLE',
        isLocal: true,
        configured: true,
        capabilities: ['llm', 'qa'],
      }),
      generateText: async (): Promise<LLMTextResult> => {
        throw new Error('Not implemented');
      },
      generateStructured: async <T>(req: LLMStructuredRequest<T>): Promise<LLMStructuredResult<T>> => {
        const parts = (req.messages?.[0]?.content as any[]) ?? [];
        const refImg = parts.find((p) => p.role?.includes('canonical_reference'));
        const isRed = refImg?.dataBase64 === redPngBase64;

        if (isRed) {
          // Matching identity
          return {
            data: {
              identityConsistencyScore: 0.94,
              spatialPerspectiveScore: 0.90,
              visualDefectScore: 0.95,
              overallVisualContinuityScore: 0.93,
              passed: true,
              defects: [],
              retakeRecommendations: [],
            } as unknown as T,
            rawText: '{}',
            model: 'sim-model-vision',
            providerId: 'sim-vision',
            usage: { latencyMs: 15, retryCount: 0, costStatus: 'LOCAL_COST' },
          };
        } else {
          // Mismatched identity (blue hair instead of red)
          return {
            data: {
              identityConsistencyScore: 0.42,
              spatialPerspectiveScore: 0.90,
              visualDefectScore: 0.60,
              overallVisualContinuityScore: 0.52,
              passed: false,
              defects: [
                {
                  defectId: 'def_drift_blue',
                  frameIndex: 0,
                  timestampSeconds: 0.5,
                  region: 'face',
                  issueType: 'character_identity_drift',
                  severity: 'critical',
                  confidence: 0.98,
                  description: 'Severe character hair and palette drift: observed blue instead of canonical red.',
                  suggestedFix: 'Retake shot with canonical red character turnaround.',
                },
              ],
              retakeRecommendations: [
                {
                  recommendationId: 'rec_retake_blue',
                  shotId: 'SHOT_CONTRACT_01',
                  strategy: 'surgical_retake',
                  priority: 'high',
                  rationale: 'Severe character identity drift requires immediate retake.',
                },
              ],
            } as unknown as T,
            rawText: '{}',
            model: 'sim-model-vision',
            providerId: 'sim-vision',
            usage: { latencyMs: 15, retryCount: 0, costStatus: 'LOCAL_COST' },
          };
        }
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
    };

    const evaluator = new VisualSemanticQAEvaluator(visionSimulator);

    // Run A: Matching reference
    const reportMatch = await evaluator.evaluateShotVideo({
      projectId: 'proj_controlled',
      shot: testShot,
      videoPath: testVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'front',
          base64Data: redPngBase64,
          mimeType: 'image/png',
        },
      ],
    });
    expect(reportMatch.passed).toBe(true);
    expect(reportMatch.identityConsistencyScore).toBe(0.94);
    expect(reportMatch.status).toBe('PASS');

    // Run B: Mismatched reference (blue)
    const reportMismatch = await evaluator.evaluateShotVideo({
      projectId: 'proj_controlled',
      shot: testShot,
      videoPath: testVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'front',
          base64Data: bluePngBase64,
          mimeType: 'image/png',
        },
      ],
    });
    expect(reportMismatch.passed).toBe(false);
    expect(reportMismatch.identityConsistencyScore).toBe(0.42);
    expect(reportMismatch.status).toBe('FAIL');
    expect(reportMismatch.defects.some((d) => d.issueType === 'character_identity_drift')).toBe(true);
  });

  it('Step 2: GeminiProvider translates multimodal messages into GoogleGenAI contents with inlineData', () => {
    const gemini = new GeminiProvider({ apiKey: 'AIzaFakeTestKeyForUnitTestingOnly12345678' });
    const converted = gemini.convertMessagesToGeminiContents([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Audit this frame' },
          { type: 'image', mimeType: 'image/jpeg', dataBase64: 'fakeBase64Bytes' },
        ],
      },
    ]);

    expect(Array.isArray(converted)).toBe(true);
    expect(converted[0].role).toBe('user');
    expect(converted[0].parts).toHaveLength(2);
    expect(converted[0].parts[0]).toEqual({ text: 'Audit this frame' });
    expect(converted[0].parts[1]).toEqual({
      inlineData: {
        mimeType: 'image/jpeg',
        data: 'fakeBase64Bytes',
      },
    });
  });
});
