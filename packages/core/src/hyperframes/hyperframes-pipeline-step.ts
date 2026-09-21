import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene, ShotContract } from '../domain/director.js';
import { ProductionPlan } from '../domain/production.js';
import { HyperFramesRenderResult } from '../domain/hyperframes.js';
import { HyperFramesAdapter } from './hyperframes-adapter.js';
import { ShotEnvironmentReferencePacket } from '../world/location-reference-resolver.js';
import { ValidationError } from '../errors/index.js';

export interface HyperFramesExecutionSummary {
  totalDeterministicShots: number;
  totalCompositionsCompiled: number;
  totalCostUsd: number;
  totalEstimatedSavingsUsd: number;
}

export class HyperFramesExecutionPipelineStep implements PipelineStep {
  public readonly id = 'hyperframes_deterministic_execution';
  public readonly name = 'HyperFrames Deterministic Animation Execution';
  public readonly description =
    'Compiles and renders all deterministic shots into HyperFrames compositions with zero generative video cost.';
  public readonly saveCheckpointAfter = true;

  constructor(private adapter?: HyperFramesAdapter) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, storage, logger } = context;

    // 1. Retrieve production scenes and production plan
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    const productionPlan = state.productionPlan as ProductionPlan | undefined;

    if (!productionScenes || !Array.isArray(productionScenes)) {
      throw new ValidationError(
        'Cannot run HyperFramesExecutionPipelineStep: "productionScenes" missing from pipeline state. Run Director step first.'
      );
    }

    // 2. Initialize adapter with storage if not injected
    const adapter = this.adapter ?? new HyperFramesAdapter(undefined, storage);

    // 3. Find all deterministic shots
    const allShots: ShotContract[] = [];
    for (const scene of productionScenes) {
      allShots.push(...scene.shots);
    }

    const deterministicShotIds = new Set<string>();
    if (productionPlan) {
      for (const strat of productionPlan.strategies) {
        if (strat.isDeterministic) {
          deterministicShotIds.add(strat.shotId);
        }
      }
    } else {
      // If plan not present, evaluate directly by complexity
      for (const shot of allShots) {
        if (
          shot.complexity === 'static' ||
          shot.complexity === 'simple_transform' ||
          shot.complexity === 'multi_layer_parallax' ||
          shot.complexity === 'rigged_character_action'
        ) {
          deterministicShotIds.add(shot.id);
        }
      }
    }

    const envPackets = (state.environmentReferencePackets as Record<string, ShotEnvironmentReferencePacket>) ?? {};

    logger.info(
      `Executing HyperFrames deterministic compilation for ${deterministicShotIds.size} shot(s)...`
    );

    const renderedCompositions: Record<string, HyperFramesRenderResult> = {};

    for (const shot of allShots) {
      if (deterministicShotIds.has(shot.id)) {
        const envPacket = envPackets[shot.id];
        const res = await adapter.execute({
          taskType: 'deterministic_anim',
          input: { shot, envPacket },
        });

        const output = res.output as any;
        renderedCompositions[shot.id] = output.renderResult;
        logger.info(
          `Rendered HyperFrames composition for shot "${shot.id}" (asset: ${output.assetId}, 0.00 USD)`
        );
      }
    }

    const summary: HyperFramesExecutionSummary = {
      totalDeterministicShots: deterministicShotIds.size,
      totalCompositionsCompiled: Object.keys(renderedCompositions).length,
      totalCostUsd: 0.0,
      totalEstimatedSavingsUsd: Number((deterministicShotIds.size * 0.25).toFixed(2)),
    };

    logger.info(
      `HyperFrames execution complete. Rendered ${summary.totalCompositionsCompiled} composition(s). Saved ~$${summary.totalEstimatedSavingsUsd} USD vs generative video.`
    );

    return {
      renderedHyperFramesCompositions: renderedCompositions,
      hyperFramesExecutionSummary: summary,
    };
  }
}
