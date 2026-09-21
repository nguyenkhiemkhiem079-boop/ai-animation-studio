import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene, ShotContract } from '../domain/director.js';
import {
  ProductionPlan,
  GenerationJob,
  GenerationResult,
  ReferenceBinding,
} from '../domain/production.js';
import {
  VideoGenerationOutput,
  ContinuationPacket,
} from '../domain/generative-video.js';
import { JobOrchestrator } from '../production/job-orchestrator.js';
import { RenderCache } from '../production/render-cache.js';
import { BudgetController } from '../production/budget-controller.js';
import { ProviderBenchmarkTracker } from '../production/benchmark-tracker.js';
import { ProviderRegistry } from '../providers/index.js';
import { MockVideoProvider } from './mock-video-provider.js';
import { ContinuationEngine } from './continuation-engine.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { ValidationError } from '../errors/index.js';

export interface GenerativeVideoStepSummary {
  totalGenerativeShots: number;
  completedShots: number;
  cachedShots: number;
  totalCostUsd: number;
  totalDurationMs: number;
}

export class GenerativeVideoPipelineStep implements PipelineStep {
  public readonly id = 'generative_video_step';
  public readonly name = 'Generative Video Production & Chaining';
  public readonly description =
    'Executes generative video shots using registered video providers, orchestrates continuation chaining between sequential shots, and registers output assets.';
  public readonly saveCheckpointAfter = true;

  constructor(
    private orchestrator?: JobOrchestrator,
    private providerRegistry?: ProviderRegistry,
    private assetRegistry?: IAssetRegistry,
    private budgetController?: BudgetController,
    private continuationEngine: ContinuationEngine = new ContinuationEngine()
  ) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;
    const projectId = (state.projectId as string) || 'default_project';
    const seriesId = (state.seriesId as string) || 'default_series';

    // 1. Retrieve planned production scenes from state
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    if (!productionScenes || !Array.isArray(productionScenes)) {
      throw new ValidationError(
        'Cannot run GenerativeVideoPipelineStep: "productionScenes" missing from pipeline state. Run Director step first.'
      );
    }

    // 2. Retrieve production plan from state
    const productionPlan = state.productionPlan as ProductionPlan | undefined;
    if (!productionPlan) {
      throw new ValidationError(
        'Cannot run GenerativeVideoPipelineStep: "productionPlan" missing from pipeline state. Run ProductionPlanningPipelineStep first.'
      );
    }

    // 3. Ensure providers and orchestrator are available
    const registry = this.providerRegistry ?? new ProviderRegistry();
    if (!registry.has('mock-video-provider')) {
      registry.register(new MockVideoProvider());
    }

    const budgetController = this.budgetController ?? new BudgetController();
    const renderCache = new RenderCache();
    const benchmarkTracker = new ProviderBenchmarkTracker();
    const orchestrator =
      this.orchestrator ??
      new JobOrchestrator(registry, renderCache, budgetController, benchmarkTracker);

    // Map shots by ID for quick lookup
    const shotMap = new Map<string, ShotContract>();
    for (const scene of productionScenes) {
      for (const shot of scene.shots) {
        shotMap.set(shot.id, shot);
      }
    }

    // Filter strategies for shots that require generative or hybrid rendering
    const generativeStrategies = productionPlan.strategies.filter(
      (s) =>
        s.executionRoute === 'generative_full_video' ||
        s.executionRoute === 'generative_image_to_video' ||
        s.executionRoute === 'hybrid'
    );

    logger.info(
      `Starting Generative Video execution for ${generativeStrategies.length} shot(s) in project "${projectId}"...`
    );

    const generativeOutputs: Record<string, VideoGenerationOutput> = {};
    const continuationPackets: Record<string, ContinuationPacket> = {};
    let completedShots = 0;
    let cachedShots = 0;
    let totalCostUsd = 0.0;
    let totalDurationMs = 0;

    // Track terminal outputs for continuation chaining across consecutive shots
    let precedingShot: ShotContract | undefined;
    let precedingOutput: VideoGenerationOutput | undefined;

    for (const strategy of generativeStrategies) {
      const shot = shotMap.get(strategy.shotId);
      if (!shot) continue;

      // 4. Continuation Chaining: If sequential in scene, chain terminal frame from preceding shot
      if (precedingShot && precedingShot.sceneId === shot.sceneId) {
        const continuationPacket = this.continuationEngine.buildContinuationPacket(
          precedingShot,
          shot,
          precedingOutput
        );
        continuationPackets[shot.id] = continuationPacket;

        // Bind START_FRAME into strategy required assets
        const existingStart = strategy.requiredInputAssets.findIndex(
          (a) => a.role === 'START_FRAME'
        );
        if (existingStart !== -1) {
          strategy.requiredInputAssets.splice(existingStart, 1);
        }
        strategy.requiredInputAssets.push({
          role: 'START_FRAME',
          assetId: continuationPacket.terminalFrameAssetId,
          weight: 1.0,
          slot: 'continuation_seed',
          antiBleedRules: continuationPacket.antiBleedDirectives,
        });

        logger.info(
          `Chained Shot "${shot.id}" to preceding Shot "${precedingShot.id}" with terminal frame "${continuationPacket.terminalFrameAssetId}" (${continuationPacket.cutType}).`
        );
      }

      // 5. Create Generation Job
      const job: GenerationJob = {
        jobId: `job_gen_${shot.id}_${Date.now()}`,
        projectId,
        seriesId,
        shotId: shot.id,
        status: 'pending',
        strategy,
        retryCount: 0,
        maxRetries: 2,
        actualCostUsd: 0.0,
        durationMs: 0,
        createdAt: new Date().toISOString(),
      };

      // 6. Dispatch Job
      const result: GenerationResult = await orchestrator.dispatchJob(job, shot);

      if (result.status === 'completed' || result.status === 'cached') {
        completedShots++;
        if (result.wasCached) cachedShots++;
        totalCostUsd += result.actualCostUsd;
        totalDurationMs += result.durationMs;

        const outputAssetId = result.outputAssetId ?? `ASSET_GEN_VIDEO_${shot.id}`;
        const terminalFrameAssetId = `FRAME_TERMINAL_${shot.id}`;

        const videoOutput: VideoGenerationOutput = {
          assetId: outputAssetId,
          shotId: shot.id,
          providerId: result.providerId,
          videoUri: `.studio/videos/${projectId}/${shot.id}_gen.mp4`,
          terminalFrameAssetId,
          terminalFrameUri: `.studio/videos/${projectId}/${shot.id}_terminal.png`,
          resolution: { width: 1920, height: 1080 },
          durationSeconds: shot.frame.durationSeconds,
          fps: shot.frame.targetFps,
          seed: 42000,
          actualCostUsd: result.actualCostUsd,
          durationMs: result.durationMs,
          metadata: {
            wasCached: result.wasCached,
            route: strategy.executionRoute,
          },
          generatedAt: new Date().toISOString(),
        };

        generativeOutputs[shot.id] = videoOutput;
        precedingShot = shot;
        precedingOutput = videoOutput;

        // Register in AssetRegistry if present
        if (this.assetRegistry) {
          await this.assetRegistry.register({
            id: outputAssetId,
            name: `Video Clip ${shot.id}`,
            seriesId,
            type: 'video_clip',
            status: 'candidate',
            contentHash: `hash_${outputAssetId}`,
            storageUri: videoOutput.videoUri,
            mimeType: 'video/mp4',
            sizeBytes: 1024 * 1024,
            entityId: shot.id,
            version: 1,
            metadata: {
              shotId: shot.id,
              actualCostUsd: result.actualCostUsd,
              providerId: result.providerId,
              terminalFrameAssetId,
            },
            tags: ['generative_video', strategy.executionRoute],
          });
        }
      } else {
        logger.error(`Generation job failed for shot "${shot.id}": ${result.error}`);
        // Reset preceding shot chain on failure to prevent cascading broken links
        precedingShot = undefined;
        precedingOutput = undefined;
      }
    }

    const summary: GenerativeVideoStepSummary = {
      totalGenerativeShots: generativeStrategies.length,
      completedShots,
      cachedShots,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      totalDurationMs,
    };

    logger.info(
      `Generative Video step complete. Completed: ${summary.completedShots}/${summary.totalGenerativeShots} (${summary.cachedShots} cached). Cost: $${summary.totalCostUsd}`
    );

    return {
      generativeVideoOutputs: generativeOutputs,
      continuationPackets,
      generativeVideoStepSummary: summary,
    };
  }
}
