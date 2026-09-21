import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockVideoProvider,
  VeoVideoAdapter,
  SeedanceVideoAdapter,
  ComfyUIVideoAdapter,
  ContinuationEngine,
  SurgicalRetakeEngine,
  GenerativeVideoPipelineStep,
  VideoGenerationTask,
  ShotContract,
  ProductionScene,
  ProductionPlan,
  Pipeline,
  MemoryStorage,
  ProviderRegistry,
  JobOrchestrator,
  RenderCache,
  BudgetController,
  ProviderBenchmarkTracker,
  FileSystemAssetRegistry,
} from '../src/index.js';

describe('Generative Video Providers & Continuation Chaining', () => {
  const sampleShotA: ShotContract = {
    id: 'SHOT_SC01_SH01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'complex_generative_video',
    rendererIntent: 'generative_full_video',
    frame: { durationSeconds: 3.5, targetFps: 24, aspectRatio: '16:9' },
    camera: { focalLength: '35mm', shotSize: 'wide', angle: 'eye_level', movement: 'push_in' },
    lighting: { keyLightDirection: 'left', mood: 'tense', colorTemperature: 'cool', fogAtmosphere: false },
    composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
    acting: [{ characterId: 'char_kaito', pose: 'watchful', expression: 'serious', gazeDirection: 'screen_right' }],
    transition: { type: 'cut', durationSeconds: 0 },
    environmentLocationId: 'loc_citadel',
    environmentZoneId: 'corridor',
    audioCue: { sfx: [] },
    requiredAssetIds: ['ASSET_CHAR_KAITO'],
    dependsOnShotIds: [],
    directorLocks: {},
    provenance: { decidedAt: new Date().toISOString() },
  };

  const sampleShotB: ShotContract = {
    ...sampleShotA,
    id: 'SHOT_SC01_SH02',
    shotNumber: 2,
    camera: { focalLength: '85mm', shotSize: 'close_up', angle: 'eye_level', movement: 'static' },
    acting: [{ characterId: 'char_kaito', pose: 'watchful', expression: 'serious', gazeDirection: 'screen_right' }],
    dependsOnShotIds: ['SHOT_SC01_SH01'],
  };

  const sampleTask: VideoGenerationTask = {
    shotId: 'SHOT_SC01_SH01',
    projectId: 'proj_test',
    seriesId: 'series_cyber',
    promptPacket: {
      positivePrompt: 'A futuristic corridor with neon accents, cinematic 8k',
      negativePrompt: 'blurry, low quality',
      referenceBindings: [
        {
          role: 'CHARACTER_IDENTITY',
          assetId: 'CHAR_REF_kaito',
          weight: 0.9,
          antiBleedRules: ['No facial distortion'],
        },
      ],
      cameraDirective: 'Slow push in',
      lightingDirective: 'Cool blue key light from left',
      actingDirective: 'Watchful stance',
      compiledAt: new Date().toISOString(),
    },
    referenceBindings: [
      {
        role: 'CHARACTER_IDENTITY',
        assetId: 'CHAR_REF_kaito',
        weight: 0.9,
        antiBleedRules: ['No facial distortion'],
      },
    ],
    resolution: { width: 1920, height: 1080 },
    durationSeconds: 3.5,
    fps: 24,
    seed: 42000,
  };

  describe('MockVideoProvider', () => {
    it('executes video generation task deterministically', async () => {
      const provider = new MockVideoProvider({ costUsd: 0.5, latencyMs: 10 });
      const result = await provider.execute({
        taskType: 'video_gen',
        input: sampleTask,
        projectId: 'proj_test',
        shotId: 'SHOT_SC01_SH01',
      });

      expect(result.providerId).toBe('mock-video-provider');
      expect(result.actualCostUsd).toBe(0.5);
      const out = (result.output as any).videoOutput;
      expect(out.shotId).toBe('SHOT_SC01_SH01');
      expect(out.terminalFrameAssetId).toBe('FRAME_TERMINAL_SHOT_SC01_SH01');
      expect(out.videoUri).toContain('SHOT_SC01_SH01_gen.mp4');
      expect(out.seed).toBe(42000);
    });

    it('simulates failure and retries when requested', async () => {
      const provider = new MockVideoProvider();
      provider.setFailureMode(true, 1);

      // First attempt fails
      await expect(
        provider.execute({
          taskType: 'video_gen',
          input: sampleTask,
        })
      ).rejects.toThrow('simulated failure');

      // Second attempt succeeds
      const retryResult = await provider.execute({
        taskType: 'video_gen',
        input: sampleTask,
      });
      expect(retryResult.output).toBeDefined();
    });
  });

  describe('VeoVideoAdapter', () => {
    it('translates VideoGenerationTask into Veo format', async () => {
      let capturedPayload: any;
      const adapter = new VeoVideoAdapter({
        executor: async (payload) => {
          capturedPayload = payload;
          return {
            videoUri: 'custom/veo.mp4',
            terminalFrameUri: 'custom/veo_term.png',
            seed: payload.seed ?? 111,
          };
        },
      });

      const result = await adapter.execute({
        taskType: 'video_gen',
        input: {
          ...sampleTask,
          startFrameAssetId: 'FRAME_TERMINAL_PREV',
          cameraTrajectory: { movement: 'orbit', speed: 1.2, intensity: 0.8 },
        },
        projectId: 'proj_test',
        shotId: 'SHOT_SC01_SH01',
      });

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.aspect_ratio).toBe('16:9');
      expect(capturedPayload.input_image_uri).toBe('.studio/assets/FRAME_TERMINAL_PREV.png');
      expect(capturedPayload.camera_motion.type).toBe('orbit');
      expect(capturedPayload.reference_images.length).toBe(1);
      expect((result.output as any).videoOutput.videoUri).toBe('custom/veo.mp4');
    });

    it('executes in simulated mode when no executor provided', async () => {
      const adapter = new VeoVideoAdapter();
      const result = await adapter.execute({
        taskType: 'video_gen',
        input: sampleTask,
      });
      expect(result.providerId).toBe('google-veo');
      expect((result.output as any).videoOutput.videoUri).toContain('veo.mp4');
    });
  });

  describe('SeedanceVideoAdapter', () => {
    it('translates VideoGenerationTask into Seedance motion format', async () => {
      let capturedPayload: any;
      const adapter = new SeedanceVideoAdapter({
        executor: async (payload) => {
          capturedPayload = payload;
          return {
            videoUri: 'custom/seedance.mp4',
            terminalFrameUri: 'custom/seedance_term.png',
          };
        },
      });

      await adapter.execute({
        taskType: 'video_gen',
        input: {
          ...sampleTask,
          motionStrength: 0.85,
        },
      });

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.motion_strength).toBe(0.85);
      expect(capturedPayload.character_bindings.length).toBe(1);
    });
  });

  describe('ComfyUIVideoAdapter', () => {
    it('creates and executes ComfyUI workflow graph', async () => {
      let capturedWorkflow: any;
      const adapter = new ComfyUIVideoAdapter({
        dispatcher: async (workflow) => {
          capturedWorkflow = workflow;
          return {
            promptId: 'prompt_123',
            videoUri: 'custom/comfy.mp4',
            terminalFrameUri: 'custom/comfy_term.png',
          };
        },
      });

      const result = await adapter.execute({
        taskType: 'video_gen',
        input: sampleTask,
      });

      expect(capturedWorkflow).toBeDefined();
      expect(capturedWorkflow['1'].class_type).toBe('KSampler');
      expect(capturedWorkflow['4'].class_type).toBe('AnimateDiffLoaderWithContext');
      expect((result.output as any).videoOutput.videoUri).toBe('custom/comfy.mp4');
    });
  });

  describe('ContinuationEngine', () => {
    it('evaluates continuity across sequential shots and extracts terminal state', () => {
      const engine = new ContinuationEngine();
      const packet = engine.buildContinuationPacket(sampleShotA, sampleShotB);

      expect(packet.precedingShotId).toBe('SHOT_SC01_SH01');
      expect(packet.targetShotId).toBe('SHOT_SC01_SH02');
      expect(packet.terminalFrameAssetId).toBe('FRAME_TERMINAL_SHOT_SC01_SH01');
      expect(packet.cutType).toBe('match_cut'); // Same character, wide -> close-up
      expect(packet.lightingPreserved).toBe(true);
      expect(packet.subjectState?.characterId).toBe('char_kaito');
      expect(packet.antiBleedDirectives.length).toBeGreaterThan(0);
    });

    it('binds continuation packet to target task', () => {
      const engine = new ContinuationEngine();
      const packet = engine.buildContinuationPacket(sampleShotA, sampleShotB);
      const targetTask: VideoGenerationTask = {
        ...sampleTask,
        shotId: 'SHOT_SC01_SH02',
      };

      const chainedTask = engine.bindContinuation(targetTask, packet);
      expect(chainedTask.startFrameAssetId).toBe('FRAME_TERMINAL_SHOT_SC01_SH01');
      const startBinding = chainedTask.referenceBindings.find((b) => b.role === 'START_FRAME');
      expect(startBinding).toBeDefined();
      expect(startBinding?.assetId).toBe('FRAME_TERMINAL_SHOT_SC01_SH01');
      expect(chainedTask.promptPacket.negativePrompt).toContain('jump cut');
    });
  });

  describe('SurgicalRetakeEngine', () => {
    it('adjusts lighting while locking seed and preserving character references', () => {
      const engine = new SurgicalRetakeEngine();
      const retakeTask = engine.createRetakeTask(sampleTask, {
        shotId: 'SHOT_SC01_SH01',
        originalJobId: 'job_orig_01',
        retakeType: 'lighting_adjustment',
        reason: 'Increase rim light and reduce shadows',
        variableAdjustments: { lighting: 'Strong cyan rim light' },
        lockSeed: true,
        preserveReferences: true,
      });

      expect(retakeTask.seed).toBe(sampleTask.seed);
      expect(retakeTask.promptPacket.lightingDirective).toBe('Strong cyan rim light');
      expect(retakeTask.promptPacket.positivePrompt).toContain('[RETAKE: Lighting adjustment: Strong cyan rim light]');
      expect(retakeTask.retakeLineage?.retakeCount).toBe(1);
      expect(retakeTask.retakeLineage?.retakeType).toBe('lighting_adjustment');
      expect(retakeTask.referenceBindings.length).toBe(sampleTask.referenceBindings.length);
    });

    it('changes seed when seed_variation is requested', () => {
      const engine = new SurgicalRetakeEngine();
      const retakeTask = engine.createRetakeTask(sampleTask, {
        shotId: 'SHOT_SC01_SH01',
        originalJobId: 'job_orig_01',
        retakeType: 'seed_variation',
        reason: 'Try alternative camera framing variations',
        variableAdjustments: {},
        lockSeed: false,
        preserveReferences: true,
      });

      expect(retakeTask.seed).not.toBe(sampleTask.seed);
    });
  });

  describe('GenerativeVideoPipelineStep', () => {
    it('executes generative shots, chains continuation, and updates state in DAG pipeline', async () => {
      const storage = new MemoryStorage();
      const registry = new ProviderRegistry();
      const mockProvider = new MockVideoProvider({ costUsd: 0.25, latencyMs: 5 });
      registry.register(mockProvider);

      const renderCache = new RenderCache();
      const budgetController = new BudgetController({ maxBudgetUsd: 50.0 });
      const benchmarkTracker = new ProviderBenchmarkTracker();
      const orchestrator = new JobOrchestrator(registry, renderCache, budgetController, benchmarkTracker);
      const assetRegistry = new FileSystemAssetRegistry(storage);

      const step = new GenerativeVideoPipelineStep(
        orchestrator,
        registry,
        assetRegistry,
        budgetController
      );

      const pipeline = new Pipeline({
        name: 'test_generative_pipeline',
        steps: [step],
        storage,
      });

      const scenes: ProductionScene[] = [
        {
          id: 'SCENE_01',
          projectId: 'proj_pipeline_test',
          sceneNumber: 1,
          heading: 'INT. CORRIDOR - NIGHT',
          purpose: 'action',
          shots: [sampleShotA, sampleShotB],
        },
      ];

      const plan: ProductionPlan = {
        projectId: 'proj_pipeline_test',
        seriesId: 'series_cyber',
        totalShots: 2,
        deterministicShotsCount: 0,
        generativeShotsCount: 2,
        hybridShotsCount: 0,
        totalEstimatedCostUsd: 0.5,
        totalEstimatedLatencyMs: 100,
        strategies: [
          {
            shotId: sampleShotA.id,
            executionRoute: 'generative_full_video',
            primaryProviderId: 'mock-video-provider',
            estimatedCostUsd: 0.25,
            estimatedLatencyMs: 50,
            rationale: 'Generative test shot 1',
            requiredInputAssets: [],
            isDeterministic: false,
            requiresContinuation: false,
          },
          {
            shotId: sampleShotB.id,
            executionRoute: 'generative_full_video',
            primaryProviderId: 'mock-video-provider',
            estimatedCostUsd: 0.25,
            estimatedLatencyMs: 50,
            rationale: 'Generative test shot 2 (continuation)',
            requiredInputAssets: [],
            isDeterministic: false,
            requiresContinuation: true,
          },
        ],
        plannedAt: new Date().toISOString(),
      };

      const resultContext = await pipeline.execute('proj_pipeline_test', {
        projectId: 'proj_pipeline_test',
        seriesId: 'series_cyber',
        productionScenes: scenes,
        productionPlan: plan,
      });

      const resultState = resultContext.state;
      const outputs = resultState.generativeVideoOutputs as Record<string, any>;
      expect(outputs).toBeDefined();
      expect(outputs[sampleShotA.id]).toBeDefined();
      expect(outputs[sampleShotB.id]).toBeDefined();
      expect(outputs[sampleShotA.id].terminalFrameAssetId).toBe(`FRAME_TERMINAL_${sampleShotA.id}`);

      // Check continuation packet for second shot
      const continuationPackets = resultState.continuationPackets as Record<string, any>;
      expect(continuationPackets[sampleShotB.id]).toBeDefined();
      expect(continuationPackets[sampleShotB.id].terminalFrameAssetId).toBe(`FRAME_TERMINAL_${sampleShotA.id}`);

      // Check summary
      const summary = resultState.generativeVideoStepSummary as any;
      expect(summary.completedShots).toBe(2);
      expect(summary.totalCostUsd).toBe(0.5);
    });
  });
});
