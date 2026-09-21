import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene, ShotContract } from '../domain/director.js';
import { ProductionPlan } from '../domain/production.js';
import { ProductionRouter } from './production-router.js';
import { PromptCompiler } from './prompt-compiler.js';
import { ProviderBenchmarkTracker } from './benchmark-tracker.js';
import { BudgetController } from './budget-controller.js';
import { ProviderRegistry } from '../providers/index.js';
import { ValidationError } from '../errors/index.js';

export interface ProductionStepSummary {
  totalShots: number;
  deterministicShotsCount: number;
  generativeShotsCount: number;
  hybridShotsCount: number;
  totalEstimatedCostUsd: number;
  totalEstimatedLatencyMs: number;
}

export class ProductionPlanningPipelineStep implements PipelineStep {
  public readonly id = 'production_planning_router';
  public readonly name = 'Production Planning & Routing';
  public readonly description =
    'Evaluates all planned shots, enforces Deterministic Animation First, assigns execution routes, and compiles production plan.';
  public readonly saveCheckpointAfter = true;

  constructor(
    private router?: ProductionRouter,
    private budgetController?: BudgetController
  ) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;
    const projectId = (state.projectId as string) || 'default_project';
    const seriesId = (state.seriesId as string) || 'default_series';

    // 1. Retrieve planned production scenes from Director step
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    if (!productionScenes || !Array.isArray(productionScenes)) {
      throw new ValidationError(
        'Cannot run ProductionPlanningPipelineStep: "productionScenes" missing from pipeline state. Run Director step first.'
      );
    }

    // 2. Initialize router if not injected
    let router = this.router;
    if (!router) {
      const providerRegistry = new ProviderRegistry();
      const promptCompiler = new PromptCompiler();
      const benchmarkTracker = new ProviderBenchmarkTracker();
      router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker, this.budgetController);
    }

    const allShots: ShotContract[] = [];
    for (const scene of productionScenes) {
      allShots.push(...scene.shots);
    }

    logger.info(
      `Starting Production Planning for ${allShots.length} shot(s) across ${productionScenes.length} scene(s)...`
    );

    // 3. Plan production across all shots
    const executionMode = (state.executionMode as any) || 'MOCK';
    const productionPlan: ProductionPlan = router.planProduction(projectId, seriesId, allShots, {
      executionMode,
    });

    // 4. Budget check if controller present
    let budgetStatus;
    if (this.budgetController) {
      budgetStatus = this.budgetController.getStatus();
      if (!this.budgetController.canAfford(productionPlan.totalEstimatedCostUsd)) {
        logger.warn(
          `Production plan estimated cost $${productionPlan.totalEstimatedCostUsd} exceeds budget cap ($${budgetStatus.maxBudgetUsd})!`
        );
      }
    }

    const summary: ProductionStepSummary = {
      totalShots: productionPlan.totalShots,
      deterministicShotsCount: productionPlan.deterministicShotsCount,
      generativeShotsCount: productionPlan.generativeShotsCount,
      hybridShotsCount: productionPlan.hybridShotsCount,
      totalEstimatedCostUsd: productionPlan.totalEstimatedCostUsd,
      totalEstimatedLatencyMs: productionPlan.totalEstimatedLatencyMs,
    };

    logger.info(
      `Production Planning complete. Deterministic: ${summary.deterministicShotsCount}, Generative: ${summary.generativeShotsCount}, Hybrid: ${summary.hybridShotsCount}, Est. Cost: $${summary.totalEstimatedCostUsd}`
    );

    return {
      productionPlan,
      budgetStatus,
      productionStepSummary: summary,
    };
  }
}
