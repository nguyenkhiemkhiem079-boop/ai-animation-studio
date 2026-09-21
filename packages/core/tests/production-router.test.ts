import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShotContract,
  ProductionScene,
  ProductionRouter,
  PromptCompiler,
  BudgetController,
  RenderCache,
  ProviderBenchmarkTracker,
  JobOrchestrator,
  ProductionPlanningPipelineStep,
  ProviderRegistry,
  MockProvider,
  GenerationJob,
  Pipeline,
  MemoryStorage,
} from '../src/index.js';

describe('Production Router & Asset Generation (Phase 6)', () => {
  let providerRegistry: ProviderRegistry;
  let promptCompiler: PromptCompiler;
  let benchmarkTracker: ProviderBenchmarkTracker;
  let budgetController: BudgetController;
  let renderCache: RenderCache;
  let router: ProductionRouter;
  let orchestrator: JobOrchestrator;

  const sampleDeterministicShot: ShotContract = {
    id: 'SHOT_DET_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'simple_transform',
    rendererIntent: 'deterministic_hyperframes',
    frame: { durationSeconds: 3.0, targetFps: 24, aspectRatio: '16:9' },
    camera: {
      focalLength: '24mm',
      shotSize: 'wide',
      angle: 'eye_level',
      movement: 'push_in',
      semanticSkills: ['pushin'],
    },
    lighting: {
      keyLightDirection: 'left',
      mood: 'somber',
      colorTemperature: 'cool',
      fogAtmosphere: false,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: { foreground: [], midground: [], background: [] },
    },
    acting: [],
    transition: { type: 'cut', durationSeconds: 0 },
    environmentLocationId: 'loc_cyber_city',
    environmentZoneId: 'alley',
    audioCue: { sfx: [] },
    requiredAssetIds: ['ASSET_BG_ALLEY'],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: false,
      isFramingLocked: false,
      isRendererLocked: false,
      isActingLocked: false,
    },
    provenance: { decidedAt: new Date().toISOString() },
  };

  const sampleGenerativeShot: ShotContract = {
    id: 'SHOT_GEN_01',
    sceneId: 'SCENE_01',
    shotNumber: 2,
    purpose: 'action',
    complexity: 'complex_generative_video',
    rendererIntent: 'generative_full_video',
    frame: { durationSeconds: 5.0, targetFps: 24, aspectRatio: '16:9' },
    camera: {
      focalLength: '50mm',
      shotSize: 'medium',
      angle: 'low_angle',
      movement: 'orbit_clockwise',
      semanticSkills: ['orbit'],
    },
    lighting: {
      keyLightDirection: 'right',
      mood: 'intense_storm',
      colorTemperature: 'cool',
      fogAtmosphere: true,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: { foreground: [], midground: [], background: [] },
    },
    acting: [
      {
        characterId: 'char_kaito',
        pose: 'combat_ready',
        expression: 'fierce',
        gazeDirection: 'screen_left',
        actionPrompt: 'runs through pouring rain and leaps across rooftop',
      },
    ],
    transition: { type: 'cut', durationSeconds: 0 },
    environmentLocationId: 'loc_cyber_city',
    environmentZoneId: 'rooftop',
    audioCue: { sfx: ['heavy_rain', 'thunder'] },
    requiredAssetIds: ['ASSET_CHAR_KAITO', 'ASSET_LOC_ROOFTOP'],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: false,
      isFramingLocked: false,
      isRendererLocked: false,
      isActingLocked: false,
    },
    provenance: { decidedAt: new Date().toISOString() },
  };

  beforeEach(() => {
    providerRegistry = new ProviderRegistry();
    promptCompiler = new PromptCompiler();
    benchmarkTracker = new ProviderBenchmarkTracker();
    budgetController = new BudgetController({ maxBudgetUsd: 50.0, warningThresholdPercent: 80 });
    renderCache = new RenderCache();

    // Register test providers
    const mockHyperFrames = new MockProvider({
      id: 'hyperframes-local',
      name: 'HyperFrames Local Renderer',
      capabilities: ['deterministic_anim'],
      cost: 0.0,
      latencyMs: 15,
    });
    mockHyperFrames.setHandler('deterministic_anim', (input: any) => ({
      assetId: `ASSET_ANIM_${input.strategy.shotId}`,
      compositionType: 'hyperframes_2d',
    }));

    const mockVeo = new MockProvider({
      id: 'veo-video-worker',
      name: 'Veo Video Generator',
      capabilities: ['video_gen'],
      cost: 0.25,
      latencyMs: 2500,
    });
    mockVeo.setHandler('video_gen', (input: any) => ({
      assetId: `ASSET_VIDEO_${input.strategy.shotId}`,
      format: 'mp4',
    }));

    const mockSeedance = new MockProvider({
      id: 'seedance-video-worker',
      name: 'Seedance Video Generator',
      capabilities: ['video_gen'],
      cost: 0.35,
      latencyMs: 3000,
    });
    mockSeedance.setHandler('video_gen', (input: any) => ({
      assetId: `ASSET_SEEDANCE_${input.strategy.shotId}`,
      format: 'mp4',
    }));

    providerRegistry.register(mockHyperFrames);
    providerRegistry.register(mockVeo);
    providerRegistry.register(mockSeedance);

    router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker, budgetController);
    orchestrator = new JobOrchestrator(providerRegistry, renderCache, budgetController, benchmarkTracker);
  });

  describe('ProductionRouter (Deterministic Animation First)', () => {
    it('routes camera move over static plate to deterministic HyperFrames ($0 cost)', () => {
      const strategy = router.routeShot(sampleDeterministicShot);

      expect(strategy.executionRoute).toBe('deterministic_hyperframes');
      expect(strategy.isDeterministic).toBe(true);
      expect(strategy.estimatedCostUsd).toBe(0.0);
      expect(strategy.primaryProviderId).toBe('hyperframes-local');
      expect(strategy.rationale).toContain('HyperFrames');
    });

    it('routes complex 3D camera and dynamic action to generative video', () => {
      const strategy = router.routeShot(sampleGenerativeShot);

      expect(strategy.executionRoute).toBe('generative_full_video');
      expect(strategy.isDeterministic).toBe(false);
      expect(strategy.estimatedCostUsd).toBeGreaterThan(0);
      expect(strategy.primaryProviderId).toBe('veo-video-worker');
      expect(strategy.fallbackProviderId).toBe('seedance-video-worker');
      expect(strategy.rationale).toContain('Generative Video');
    });

    it('routes shot with preceding dependency to image-to-video continuation', () => {
      const continuationShot: ShotContract = {
        ...sampleDeterministicShot,
        id: 'SHOT_CONT_02',
        dependsOnShotIds: ['SHOT_DET_01'],
        acting: [
          {
            characterId: 'char_kaito',
            pose: 'standing',
            expression: 'neutral',
            gazeDirection: 'screen_right',
          },
        ],
      };

      const strategy = router.routeShot(continuationShot);

      expect(strategy.executionRoute).toBe('generative_image_to_video');
      expect(strategy.requiresContinuation).toBe(true);
      expect(strategy.requiredInputAssets.some((a) => a.role === 'START_FRAME')).toBe(true);
    });

    it('strictly honors director lock on renderer intent', () => {
      const lockedShot: ShotContract = {
        ...sampleDeterministicShot,
        rendererIntent: 'generative_image_to_video',
        directorLocks: {
          ...sampleDeterministicShot.directorLocks,
          isRendererLocked: true,
        },
      };

      const strategy = router.routeShot(lockedShot);
      expect(strategy.executionRoute).toBe('generative_image_to_video');
      expect(strategy.rationale).toContain('Renderer intent explicitly locked');
    });

    it('plans production for a sequence of shots and computes overall statistics', () => {
      const plan = router.planProduction('PROJ_TEST', 'SERIES_01', [
        sampleDeterministicShot,
        sampleGenerativeShot,
      ]);

      expect(plan.totalShots).toBe(2);
      expect(plan.deterministicShotsCount).toBe(1);
      expect(plan.generativeShotsCount).toBe(1);
      expect(plan.totalEstimatedCostUsd).toBe(0.25);
      expect(plan.strategies).toHaveLength(2);
    });
  });

  describe('PromptCompiler (Reference Binding & Anti-Bleed)', () => {
    it('synthesizes positive and negative prompt with anti-bleed rules', () => {
      promptCompiler.registerCharacterDescription('char_kaito', 'Young hacker with neon blue jacket and cybernetic eye');
      promptCompiler.registerLocationDescription('loc_cyber_city', 'Rain-slicked cyberpunk alley at night');

      const referenceBindings = [
        {
          role: 'CHARACTER_IDENTITY' as const,
          assetId: 'CHAR_KAITO_CANON',
          weight: 0.9,
          slot: 'actor_kaito',
          antiBleedRules: ['Do not alter blue jacket color', 'Preserve cybernetic eye placement'],
        },
      ];

      const packet = promptCompiler.compile(sampleGenerativeShot, referenceBindings);

      expect(packet.positivePrompt).toContain('Young hacker with neon blue jacket');
      expect(packet.positivePrompt).toContain('Rain-slicked cyberpunk alley');
      expect(packet.positivePrompt).toContain('orbit clockwise');
      expect(packet.negativePrompt).toContain('Do not alter blue jacket color');
      expect(packet.negativePrompt).toContain('bad anatomy');
      expect(packet.referenceBindings).toHaveLength(1);
    });
  });

  describe('BudgetController', () => {
    it('tracks expenditure and warns when reaching threshold', () => {
      const controller = new BudgetController({ maxBudgetUsd: 10.0, warningThresholdPercent: 80 });

      expect(controller.getStatus().remainingBudgetUsd).toBe(10.0);
      expect(controller.canAfford(5.0)).toBe(true);

      controller.recordExpense(8.5);
      const status = controller.getStatus();
      expect(status.spentBudgetUsd).toBe(8.5);
      expect(status.remainingBudgetUsd).toBe(1.5);
      expect(status.utilizationPercent).toBe(85.0);
      expect(status.isWarning).toBe(true);
      expect(status.isHardCapReached).toBe(false);
    });

    it('rejects expenditure exceeding hard cap', () => {
      const controller = new BudgetController({ maxBudgetUsd: 5.0, enforceHardCap: true });
      controller.recordExpense(4.0);

      expect(controller.canAfford(2.0)).toBe(false);
      expect(() => controller.recordExpense(2.0)).toThrow(/Budget exceeded/);
    });
  });

  describe('RenderCache', () => {
    it('produces deterministic hash and reuses cached results', () => {
      const key1 = renderCache.computeCacheKey(sampleDeterministicShot);
      const key2 = renderCache.computeCacheKey(sampleDeterministicShot);
      expect(key1).toBe(key2);

      const differentShot: ShotContract = {
        ...sampleDeterministicShot,
        camera: { ...sampleDeterministicShot.camera, shotSize: 'close_up' },
      };
      const keyDiff = renderCache.computeCacheKey(differentShot);
      expect(keyDiff).not.toBe(key1);

      renderCache.set(key1, {
        jobId: 'JOB_01',
        shotId: sampleDeterministicShot.id,
        status: 'completed',
        outputAssetId: 'ASSET_CACHED_01',
        providerId: 'hyperframes-local',
        wasCached: false,
        actualCostUsd: 0.0,
        durationMs: 10,
      });

      expect(renderCache.has(key1)).toBe(true);
      expect(renderCache.get(key1)?.outputAssetId).toBe('ASSET_CACHED_01');
    });
  });

  describe('ProviderBenchmarkTracker', () => {
    it('records results, updates moving averages, and ranks best provider', () => {
      benchmarkTracker.recordResult('veo-video-worker', true, 0.25, 2000, 0.95);
      benchmarkTracker.recordResult('veo-video-worker', true, 0.25, 1800, 0.97);

      const bench = benchmarkTracker.getBenchmark('veo-video-worker');
      expect(bench).toBeDefined();
      expect(bench?.totalInvocations).toBe(2);
      expect(bench?.successRate).toBe(1.0);
      expect(bench?.averageLatencyMs).toBe(1900);

      // Add a slower/failed provider
      benchmarkTracker.recordResult('seedance-video-worker', false, 0.35, 4000, 0.6);

      const providers = providerRegistry.findByCapability('video_gen');
      const best = benchmarkTracker.getBestProvider(providers);
      expect(best?.metadata.id).toBe('veo-video-worker');
    });
  });

  describe('JobOrchestrator (Execution, Retries, Fallbacks, Cache)', () => {
    it('executes job through primary provider and updates budget and benchmark', async () => {
      const strategy = router.routeShot(sampleDeterministicShot);
      const job: GenerationJob = {
        jobId: 'JOB_TEST_01',
        projectId: 'PROJ_01',
        seriesId: 'SERIES_01',
        shotId: sampleDeterministicShot.id,
        status: 'pending',
        strategy,
        retryCount: 0,
        maxRetries: 2,
        actualCostUsd: 0.0,
        durationMs: 0,
        createdAt: new Date().toISOString(),
      };

      const result = await orchestrator.dispatchJob(job, sampleDeterministicShot);

      expect(result.status).toBe('completed');
      expect(result.outputAssetId).toBeDefined();
      expect(result.wasCached).toBe(false);
      expect(job.status).toBe('completed');

      // Second execution of the exact same shot must hit the render cache!
      const job2: GenerationJob = {
        ...job,
        jobId: 'JOB_TEST_02',
        status: 'pending',
      };

      const cachedResult = await orchestrator.dispatchJob(job2, sampleDeterministicShot);
      expect(cachedResult.status).toBe('completed');
      expect(cachedResult.wasCached).toBe(true);
      expect(cachedResult.actualCostUsd).toBe(0.0);
      expect(job2.status).toBe('cached');
    });

    it('falls back to secondary provider if primary fails', async () => {
      const failingPrimary = new MockProvider({
        id: 'failing-primary-worker',
        name: 'Failing Video Worker',
        capabilities: ['video_gen'],
        cost: 0.2,
      });
      failingPrimary.setHandler('video_gen', () => {
        throw new Error('500 Internal Model Error');
      });
      providerRegistry.register(failingPrimary);

      const strategy = router.routeShot(sampleGenerativeShot);
      strategy.primaryProviderId = 'failing-primary-worker';
      strategy.fallbackProviderId = 'veo-video-worker';

      const job: GenerationJob = {
        jobId: 'JOB_FALLBACK_01',
        projectId: 'PROJ_01',
        seriesId: 'SERIES_01',
        shotId: sampleGenerativeShot.id,
        status: 'pending',
        strategy,
        retryCount: 0,
        maxRetries: 1,
        actualCostUsd: 0.0,
        durationMs: 0,
        createdAt: new Date().toISOString(),
      };

      const result = await orchestrator.dispatchJob(job, sampleGenerativeShot);

      expect(result.status).toBe('completed');
      expect(result.providerId).toBe('veo-video-worker');
      expect(job.status).toBe('completed');
    });
  });

  describe('ProductionPlanningPipelineStep (DAG Integration)', () => {
    it('runs within DAG pipeline and plans production for all scenes', async () => {
      const storage = new MemoryStorage();

      const scenes: ProductionScene[] = [
        {
          id: 'SCENE_01',
          projectId: 'PROJ_PIPE_01',
          sceneNumber: 1,
          heading: 'INT. HANGAR - DAY',
          purpose: 'establishing',
          shots: [sampleDeterministicShot, sampleGenerativeShot],
          coverageSummary: { totalShots: 2, estimatedDurationSeconds: 8.0, complexityScore: 3 },
          actingDirectives: [],
          directorNotes: 'Test scene',
        },
      ];

      const step = new ProductionPlanningPipelineStep(router, budgetController);
      const pipeline = new Pipeline({
        name: 'Production Pipeline Test',
        steps: [step],
        storage,
      });

      const result = await pipeline.execute('PROJ_PIPE_01', {
        seriesId: 'SERIES_PIPE_01',
        productionScenes: scenes,
      });

      expect(result.completedStepIds).toContain('production_planning_router');
      expect(result.state.productionPlan).toBeDefined();

      const plan = result.state.productionPlan as any;
      expect(plan.totalShots).toBe(2);
      expect(plan.deterministicShotsCount).toBe(1);
      expect(plan.generativeShotsCount).toBe(1);
      expect(result.state.productionStepSummary).toBeDefined();
    });
  });
});

