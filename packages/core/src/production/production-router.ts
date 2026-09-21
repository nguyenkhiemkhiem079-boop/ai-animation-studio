import { ShotContract, RendererIntent } from '../domain/director.js';
import {
  ProductionStrategy,
  ProductionPlan,
  ReferenceBinding,
  ReferenceRole,
} from '../domain/production.js';
import { ProviderRegistry, IProvider } from '../providers/index.js';
import { PromptCompiler } from './prompt-compiler.js';
import { ProviderBenchmarkTracker } from './benchmark-tracker.js';
import { BudgetController } from './budget-controller.js';
import { StudioExecutionMode, ProductionSafetyError } from '../domain/execution-mode.js';

export interface RouteOptions {
  availableAssetIds?: string[];
  forceGenerative?: boolean;
  preferLocal?: boolean;
  preferFlowAssisted?: boolean;
  executionMode?: StudioExecutionMode;
}

export class ProductionRouter {
  constructor(
    private providerRegistry: ProviderRegistry,
    private promptCompiler: PromptCompiler,
    private benchmarkTracker: ProviderBenchmarkTracker,
    private budgetController?: BudgetController
  ) {}

  public routeShot(shot: ShotContract, options: RouteOptions = {}): ProductionStrategy {
    let executionRoute: RendererIntent;
    let rationale: string;

    // 1. Honor Director Locks if renderer is locked
    if (shot.directorLocks?.isRendererLocked && shot.rendererIntent) {
      executionRoute = shot.rendererIntent;
      rationale = `Renderer intent explicitly locked by director to "${shot.rendererIntent}".`;
    } else if (options.forceGenerative) {
      executionRoute = 'generative_full_video';
      rationale = 'Generative video forced via route options.';
    } else if (options.executionMode === 'LOCAL') {
      executionRoute = 'deterministic_hyperframes';
      rationale = 'Routed to HyperFrames deterministic renderer in LOCAL execution mode.';
    } else {
      // 2. Evaluates Shot Characteristics (Deterministic Animation First)
      const isComplexCamera =
        shot.camera.movement.includes('orbit') ||
        shot.camera.movement.includes('dynamic') ||
        shot.camera.movement.includes('spiral');

      const isComplexAction =
        shot.complexity === 'complex_generative_video' ||
        shot.acting.some((a) => a.actionPrompt && (a.actionPrompt.includes('run') || a.actionPrompt.includes('fight') || a.actionPrompt.includes('jump')));

      if (shot.complexity === 'complex_generative_video' || (isComplexCamera && isComplexAction)) {
        executionRoute = 'generative_full_video';
        rationale = 'Routed to Generative Video due to complex 3D camera trajectory and organic character movement.';
      } else if (shot.complexity === 'rigged_character_action') {
        executionRoute = 'deterministic_rigged_2d';
        rationale = 'Routed to Rigged 2D Character Animation for discrete, reusable actor poses.';
      } else if (shot.dependsOnShotIds.length > 0 && shot.acting.length > 0) {
        executionRoute = 'generative_image_to_video';
        rationale = 'Routed to Image-to-Video (I2V) continuation using preceding shot terminal frame as seed.';
      } else if (
        shot.complexity === 'static' ||
        shot.complexity === 'simple_transform' ||
        shot.complexity === 'multi_layer_parallax' ||
        ['push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'static', 'truck_left', 'truck_right'].includes(shot.camera.movement)
      ) {
        executionRoute = 'deterministic_hyperframes';
        rationale = `Routed to HyperFrames: camera motion "${shot.camera.movement}" and multi-plane depth can be executed deterministically with zero generative video cost.`;
      } else {
        executionRoute = 'hybrid';
        rationale = 'Routed to Hybrid execution: static generated background plate with deterministic camera choreography.';
      }
    }

    const isDeterministic =
      executionRoute === 'deterministic_hyperframes' ||
      executionRoute === 'deterministic_rigged_2d';

    const requiresContinuation = executionRoute === 'generative_image_to_video';

    // 3. Provider Selection
    let primaryProviderId: string;
    let fallbackProviderId: string | undefined;
    let estimatedCostUsd = 0.0;
    let estimatedLatencyMs = 50;
    let integrationMode: 'ASSISTED' | 'AUTOMATED' | 'DETERMINISTIC' = isDeterministic ? 'DETERMINISTIC' : 'AUTOMATED';
    let userActionRequired = false;

    if (options.preferFlowAssisted) {
      primaryProviderId = 'google-flow-assisted';
      fallbackProviderId = 'hyperframes-local';
      estimatedCostUsd = 0.0;
      estimatedLatencyMs = 60000;
      integrationMode = 'ASSISTED';
      userActionRequired = true;
      rationale = 'Routed to Google Flow Assisted production: external creative workspace with human handoff.';
    } else if (isDeterministic) {
      primaryProviderId = 'hyperframes-local';
      fallbackProviderId = 'svg-canvas-local';
      estimatedCostUsd = 0.0;
      estimatedLatencyMs = 50;
      integrationMode = 'DETERMINISTIC';
    } else {
      let videoProviders = this.providerRegistry.findByCapability('video_gen');

      // Safeguard: In PRODUCTION mode, never automatically select mock providers
      if (options.executionMode === 'PRODUCTION') {
        videoProviders = videoProviders.filter(
          (p) => !p.metadata.id.includes('mock') && !(p.metadata as any).isMock
        );
        if (videoProviders.length === 0) {
          throw new ProductionSafetyError(
            `Cannot route shot "${shot.id}" to generative video in PRODUCTION mode: No real video generation provider configured.`
          );
        }
      }

      const bestVideo = this.benchmarkTracker.getBestProvider(videoProviders) ?? videoProviders[0];

      if (bestVideo) {
        primaryProviderId = bestVideo.metadata.id;
        const benchmark = this.benchmarkTracker.getBenchmark(bestVideo.metadata.id);
        estimatedCostUsd = benchmark?.averageCostUsd ?? bestVideo.metadata.costEstimateUsdPerInvocation;
        estimatedLatencyMs = benchmark?.averageLatencyMs ?? bestVideo.metadata.averageLatencyMs;

        const otherProviders = videoProviders.filter((p) => p.metadata.id !== bestVideo.metadata.id);
        if (otherProviders.length > 0) {
          fallbackProviderId = otherProviders[0].metadata.id;
        }
      } else {
        if (options.executionMode === 'PRODUCTION') {
          throw new ProductionSafetyError(
            `Cannot route shot "${shot.id}" in PRODUCTION mode: No valid production video provider found.`
          );
        }
        primaryProviderId = 'generic-video-worker';
        estimatedCostUsd = 0.5;
        estimatedLatencyMs = 15000;
      }
    }

    // 4. Build Reference Bindings
    const referenceBindings: ReferenceBinding[] = [];
    if (requiresContinuation && shot.dependsOnShotIds.length > 0) {
      referenceBindings.push({
        role: 'START_FRAME',
        assetId: `FRAME_TERMINAL_${shot.dependsOnShotIds[0]}`,
        weight: 1.0,
        slot: 'initial_frame',
        antiBleedRules: ['Do not change initial subject position or background lighting at t=0'],
      });
    }

    for (const act of shot.acting) {
      referenceBindings.push({
        role: 'CHARACTER_IDENTITY',
        assetId: `CHAR_REF_${act.characterId}`,
        weight: 0.9,
        slot: `actor_${act.characterId}`,
        antiBleedRules: [
          'Do not bleed facial features into background scenery',
          'Do not distort character facial proportions',
        ],
      });
    }

    if (shot.environmentLocationId) {
      referenceBindings.push({
        role: 'ENVIRONMENT',
        assetId: `LOC_REF_${shot.environmentLocationId}`,
        weight: 0.85,
        slot: 'background_set',
        antiBleedRules: ['Do not bleed environment geometry into character silhouettes'],
      });
    }

    // 5. Compile Prompt Packet
    const promptPacket = this.promptCompiler.compile(shot, referenceBindings);

    return {
      shotId: shot.id,
      executionRoute,
      primaryProviderId,
      fallbackProviderId,
      estimatedCostUsd,
      estimatedLatencyMs,
      rationale,
      requiredInputAssets: referenceBindings,
      promptPacket,
      isDeterministic,
      requiresContinuation,
      integrationMode,
      userActionRequired,
    };
  }

  public planProduction(
    projectId: string,
    seriesId: string,
    shots: ShotContract[],
    options: RouteOptions = {}
  ): ProductionPlan {
    const strategies = shots.map((shot) => this.routeShot(shot, options));

    let deterministicCount = 0;
    let generativeCount = 0;
    let hybridCount = 0;
    let totalEstimatedCost = 0.0;
    let totalEstimatedLatency = 0;

    for (const strat of strategies) {
      if (strat.isDeterministic) {
        deterministicCount++;
      } else if (strat.executionRoute === 'hybrid') {
        hybridCount++;
      } else {
        generativeCount++;
      }
      totalEstimatedCost += strat.estimatedCostUsd;
      totalEstimatedLatency += strat.estimatedLatencyMs;
    }

    return {
      projectId,
      seriesId,
      totalShots: shots.length,
      deterministicShotsCount: deterministicCount,
      generativeShotsCount: generativeCount,
      hybridShotsCount: hybridCount,
      totalEstimatedCostUsd: Number(totalEstimatedCost.toFixed(4)),
      totalEstimatedLatencyMs: totalEstimatedLatency,
      strategies,
      plannedAt: new Date().toISOString(),
    };
  }
}
