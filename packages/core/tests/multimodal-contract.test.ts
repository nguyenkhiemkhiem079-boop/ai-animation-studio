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

  const redVideo = path.join(testDir, 'contract_test_video_red.mp4');
  const blueVideo = path.join(testDir, 'contract_test_video_blue.mp4');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    // VIDEO A: rendered frames visibly RED
    execSync(`"${ffmpeg}" -y -f lavfi -i color=c=red:size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${redVideo}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // VIDEO B: rendered frames visibly BLUE
    execSync(`"${ffmpeg}" -y -f lavfi -i color=c=blue:size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${blueVideo}"`, {
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
      videoPath: redVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'turnaround_front',
          base64Data: redPngBase64,
          mimeType: 'image/png',
          status: 'approved_canon',
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
    expect(imageParts.length).toBeGreaterThan(3);

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
      videoPath: redVideo,
      characterProfiles: [redCharacter],
    });

    expect(report.evaluationMechanism).toBe('LOCAL_MEDIA_METADATA');
    expect(report.identityConsistencyScore).toBeNull();
    expect(report.coverage?.identityVisual).toBe('NOT_EVALUATED');
  });

  it('Step 22: Controlled fixture differentiation (constant RED reference against RED vs BLUE physical video)', async () => {
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();

    // Simulated multimodal vision provider that actually inspects canonical reference and extracted frame image bytes
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
        const refParts = parts.filter((p) => p.role?.includes('canonical_reference'));
        const frameParts = parts.filter((p) => p.role?.includes('extracted_frame_'));

        expect(refParts.length).toBeGreaterThan(0);
        expect(frameParts.length).toBeGreaterThan(0);

        const refBuf = Buffer.from(refParts[0].dataBase64, 'base64');
        const frameBuf = Buffer.from(frameParts[0].dataBase64, 'base64');

        expect(refBuf.length).toBeGreaterThan(0);
        expect(frameBuf.length).toBeGreaterThan(0);

        // Decode pixel colors using ffmpeg stdin pipe inspection
        const framePpm = execSync(`"${ffmpeg}" -y -i pipe:0 -vframes 1 -f image2pipe -vcodec rawvideo -pix_fmt rgb24 -`, {
          input: frameBuf,
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        const refPpm = execSync(`"${ffmpeg}" -y -i pipe:0 -vframes 1 -f image2pipe -vcodec rawvideo -pix_fmt rgb24 -`, {
          input: refBuf,
          stdio: ['pipe', 'pipe', 'ignore'],
        });

        // Canonical reference check: red channel dominates
        const refIsRed = refPpm[0] > 150 && refPpm[2] < 100;
        expect(refIsRed).toBe(true); // Canonical reference is strictly RED in both runs

        // Extracted frame check: inspect actual frame pixel bytes
        const frameIsRed = framePpm[0] > 150 && framePpm[2] < 100;
        const frameIsBlue = framePpm[2] > 150 && framePpm[0] < 100;

        if (frameIsRed) {
          // Frame matches canonical red reference
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
            model: 'sim-model-vision',
            providerId: 'sim-vision',
            usage: { latencyMs: 15, retryCount: 0, costStatus: 'LOCAL_COST' },
          };
        } else if (frameIsBlue) {
          // Frame is BLUE: identity drift defect against RED reference
          return {
            data: {
              identityConsistencyScore: 0.35,
              spatialPerspectiveScore: 0.90,
              visualDefectScore: 0.55,
              overallVisualContinuityScore: 0.48,
              passed: false,
              defects: [
                {
                  defectId: 'def_identity_drift_blue',
                  frameIndex: 0,
                  timestampSeconds: 0.5,
                  region: 'face',
                  issueType: 'character_identity_drift',
                  severity: 'critical',
                  confidence: 0.99,
                  description: 'Character identity drift: rendered frame is visibly blue, contradicting canonical red identity anchor.',
                  suggestedFix: 'Retake shot with canonical red character turnaround.',
                },
              ],
              retakeRecommendations: [
                {
                  recommendationId: 'rec_drift_blue',
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
        } else {
          throw new Error(`Unexpected frame colors: R=${framePpm[0]}, G=${framePpm[1]}, B=${framePpm[2]}`);
        }
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
    };

    const evaluator = new VisualSemanticQAEvaluator(visionSimulator);

    // RUN A: Canonical RED reference + RED rendered physical video => PASS
    const reportA = await evaluator.evaluateShotVideo({
      projectId: 'proj_controlled',
      shot: testShot,
      videoPath: redVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'turnaround_front',
          base64Data: redPngBase64,
          mimeType: 'image/png',
          status: 'approved_canon',
        },
      ],
    });

    expect(reportA.passed).toBe(true);
    expect(reportA.identityConsistencyScore).toBe(0.95);
    expect(reportA.status).toBe('PASS');
    expect(reportA.coverage?.identityVisual).toBe('VERIFIED');

    // RUN B: Canonical RED reference + BLUE rendered physical video => FAIL (character_identity_drift)
    const reportB = await evaluator.evaluateShotVideo({
      projectId: 'proj_controlled',
      shot: testShot,
      videoPath: blueVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'turnaround_front',
          base64Data: redPngBase64, // Unchanged canonical RED reference!
          mimeType: 'image/png',
          status: 'approved_canon',
        },
      ],
    });

    expect(reportB.passed).toBe(false);
    expect(reportB.identityConsistencyScore).toBe(0.35);
    expect(reportB.status).toBe('FAIL');
    expect(reportB.defects.some((d) => d.issueType === 'character_identity_drift')).toBe(true);
  });

  it('multimodal provider failure in PRODUCTION does not silently become pass', async () => {
    const failingProvider: LLMProvider = {
      metadata: {
        id: 'failing-provider',
        name: 'Failing Provider',
        version: '1.0.0',
        capabilities: ['llm', 'qa'],
        supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
        modelMapping: {
          FAST: 'fail-model',
          REASONING: 'fail-model',
          STRUCTURED: 'fail-model',
          QA: 'fail-model',
          VISION_QA: 'fail-model',
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
        providerId: 'failing-provider',
        name: 'Failing Provider',
        status: 'AVAILABLE',
        isLocal: false,
        configured: true,
        capabilities: ['llm', 'qa'],
      }),
      generateText: async (): Promise<LLMTextResult> => {
        throw new Error('429 ResourceExhausted: rate limit exceeded');
      },
      generateStructured: async (): Promise<LLMStructuredResult<any>> => {
        throw new Error('429 ResourceExhausted: rate limit exceeded');
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
    };

    const evaluator = new VisualSemanticQAEvaluator(failingProvider);

    // In PRODUCTION mode: Must fail closed with providerFailure metadata and NOT become PASS
    const reportProd = await evaluator.evaluateShotVideo({
      projectId: 'proj_prod_failure',
      shot: testShot,
      videoPath: redVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'turnaround_front',
          base64Data: redPngBase64,
          mimeType: 'image/png',
          status: 'approved_canon',
        },
      ],
      executionMode: 'PRODUCTION',
    });

    expect(reportProd.passed).toBe(false);
    expect(reportProd.status).toBe('FAIL');
    expect(reportProd.coverage?.identityVisual).toBe('NOT_EVALUATED');
    expect(reportProd.metadata?.providerFailure).toBe(true);
    expect(reportProd.metadata?.providerFailureReason).toBe('QUOTA_EXCEEDED');

    // In LOCAL mode: Can truthfully downgrade to LOCAL_MEDIA_METADATA
    const reportLocal = await evaluator.evaluateShotVideo({
      projectId: 'proj_local_failure',
      shot: testShot,
      videoPath: redVideo,
      characterProfiles: [redCharacter],
      executionMode: 'LOCAL',
    });

    expect(reportLocal.evaluationMechanism).toBe('LOCAL_MEDIA_METADATA');
    expect(reportLocal.identityConsistencyScore).toBeNull();
  });

  it('provider failure cases (AUTH_ERROR, TIMEOUT, malformed structured response) in PRODUCTION fail closed with safe categorization', async () => {
    const makeProvider = (errorMsg: string): LLMProvider => ({
      metadata: {
        id: 'error-provider',
        name: 'Error Provider',
        version: '1.0.0',
        capabilities: ['llm', 'qa'],
        supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
        modelMapping: { FAST: 'm', REASONING: 'm', STRUCTURED: 'm', QA: 'm', VISION_QA: 'm' },
        supportedTasks: ['CONTINUITY_QA'],
        isLocal: false,
        costEstimateUsdPerInvocation: 0,
        averageLatencyMs: 10,
        supportsImages: true,
        supportsMultimodalStructuredOutput: true,
      },
      healthCheck: async () => true,
      diagnoseHealth: async () => ({
        providerId: 'error-provider',
        name: 'Error Provider',
        status: 'AVAILABLE',
        isLocal: false,
        configured: true,
        capabilities: ['llm', 'qa'],
      }),
      generateText: async () => { throw new Error(errorMsg); },
      generateStructured: async () => { throw new Error(errorMsg); },
      execute: async () => { throw new Error('Not implemented'); },
    });

    // 1. AUTH_ERROR
    const authEvaluator = new VisualSemanticQAEvaluator(makeProvider('401 Unauthorized: Invalid API key'));
    const authReport = await authEvaluator.evaluateShotVideo({
      projectId: 'proj_auth_fail',
      shot: testShot,
      videoPath: redVideo,
      executionMode: 'PRODUCTION',
    });
    expect(authReport.passed).toBe(false);
    expect(authReport.status).toBe('FAIL');
    expect(authReport.coverage?.identityVisual).toBe('NOT_EVALUATED');
    expect(authReport.metadata?.providerFailureReason).toBe('AUTH_ERROR');

    // 2. TIMEOUT
    const timeoutEvaluator = new VisualSemanticQAEvaluator(makeProvider('ETIMEDOUT: Connection timed out'));
    const timeoutReport = await timeoutEvaluator.evaluateShotVideo({
      projectId: 'proj_timeout_fail',
      shot: testShot,
      videoPath: redVideo,
      executionMode: 'PRODUCTION',
    });
    expect(timeoutReport.passed).toBe(false);
    expect(timeoutReport.status).toBe('FAIL');
    expect(timeoutReport.coverage?.identityVisual).toBe('NOT_EVALUATED');
    expect(timeoutReport.metadata?.providerFailureReason).toBe('TIMEOUT');

    // 3. Malformed structured response / schema failure
    const schemaEvaluator = new VisualSemanticQAEvaluator(makeProvider('Invalid schema: ZodError failed to parse output'));
    const schemaReport = await schemaEvaluator.evaluateShotVideo({
      projectId: 'proj_schema_fail',
      shot: testShot,
      videoPath: redVideo,
      executionMode: 'PRODUCTION',
    });
    expect(schemaReport.passed).toBe(false);
    expect(schemaReport.status).toBe('FAIL');
    expect(schemaReport.coverage?.identityVisual).toBe('NOT_EVALUATED');
    expect(schemaReport.metadata?.providerFailureReason).toBe('INVALID_REQUEST');
  });

  it('candidate (unapproved) character reference cannot satisfy canonical identity verification', async () => {
    const spyProvider: LLMProvider = {
      metadata: {
        id: 'spy-provider',
        name: 'Spy Provider',
        version: '1.0.0',
        capabilities: ['llm', 'qa'],
        supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
        modelMapping: {
          FAST: 'model',
          REASONING: 'model',
          STRUCTURED: 'model',
          QA: 'model',
          VISION_QA: 'model-vision',
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
        providerId: 'spy-provider',
        name: 'Spy Provider',
        status: 'AVAILABLE',
        isLocal: false,
        configured: true,
        capabilities: ['llm', 'qa'],
      }),
      generateText: async (): Promise<LLMTextResult> => {
        throw new Error('Not implemented');
      },
      generateStructured: async <T>(): Promise<LLMStructuredResult<T>> => {
        return {
          data: {
            identityConsistencyScore: 0.95,
            spatialPerspectiveScore: 0.90,
            visualDefectScore: 0.90,
            overallVisualContinuityScore: 0.92,
            passed: true,
            defects: [],
            retakeRecommendations: [],
          } as unknown as T,
          rawText: '{}',
          model: 'model-vision',
          providerId: 'spy-provider',
          usage: { latencyMs: 10, retryCount: 0, costStatus: 'FREE_TIER' },
        };
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
    };

    const evaluator = new VisualSemanticQAEvaluator(spyProvider);

    // Reference has status: 'candidate' (NOT approved_canon)
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_candidate_ref',
      shot: testShot,
      videoPath: redVideo,
      characterProfiles: [redCharacter],
      referenceImages: [
        {
          entityId: 'char_red_operative',
          role: 'turnaround_front',
          base64Data: redPngBase64,
          mimeType: 'image/png',
          status: 'candidate', // Unapproved!
        },
      ],
      executionMode: 'PRODUCTION',
    });

    expect(report.missingIdentityAnchors).toContain('char_red_operative');
    expect(report.coverage?.identityVisual).toBe('NOT_EVALUATED');
    expect(report.identityConsistencyScore).toBeNull();
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
