import {
  GenerationJob,
  GenerationResult,
  GenerationJobStatus,
} from '../domain/production.js';
import { ShotContract } from '../domain/director.js';
import { ProviderRegistry, IProvider, ProviderTask } from '../providers/index.js';
import { RenderCache } from './render-cache.js';
import { BudgetController } from './budget-controller.js';
import { ProviderBenchmarkTracker } from './benchmark-tracker.js';
import { StudioError } from '../errors/index.js';

export class JobOrchestrator {
  constructor(
    private providerRegistry: ProviderRegistry,
    private renderCache: RenderCache,
    private budgetController: BudgetController,
    private benchmarkTracker: ProviderBenchmarkTracker
  ) {}

  public async dispatchJob(
    job: GenerationJob,
    shot: ShotContract
  ): Promise<GenerationResult> {
    job.status = 'running';

    // 1. Check Render Cache for deterministic deduplication
    const inputAssetIds = job.strategy.requiredInputAssets.map((a) => a.assetId);
    const cacheKey = this.renderCache.computeCacheKey(
      shot,
      job.strategy.promptPacket,
      inputAssetIds
    );

    const cached = this.renderCache.get(cacheKey);
    if (cached) {
      job.status = 'cached';
      job.outputAssetId = cached.outputAssetId;
      job.completedAt = new Date().toISOString();
      return {
        ...cached,
        jobId: job.jobId,
        wasCached: true,
        actualCostUsd: 0.0,
        durationMs: 0,
      };
    }

    // 2. Check Budget Controller
    if (!this.budgetController.canAfford(job.strategy.estimatedCostUsd)) {
      job.status = 'failed';
      job.error = `Budget cap exceeded: estimated cost $${job.strategy.estimatedCostUsd} cannot be afforded.`;
      throw new StudioError(job.error, 'BUDGET_CAP_EXCEEDED');
    }

    // 3. Attempt Execution with Primary Provider + Retries
    const primaryId = job.strategy.primaryProviderId;
    let result: GenerationResult | undefined;

    result = await this.executeWithRetries(job, primaryId);

    // 4. Fallback Execution if Primary Failed
    if (!result && job.strategy.fallbackProviderId) {
      const fallbackId = job.strategy.fallbackProviderId;
      result = await this.executeWithRetries(job, fallbackId);
    }

    if (!result) {
      job.status = 'failed';
      const errorMsg = job.error ?? 'All provider execution attempts failed.';
      return {
        jobId: job.jobId,
        shotId: job.shotId,
        status: 'failed',
        providerId: primaryId,
        wasCached: false,
        actualCostUsd: 0.0,
        durationMs: 0,
        error: errorMsg,
      };
    }

    // 5. Commit to Cache & Budget on Success
    this.budgetController.recordExpense(result.actualCostUsd);
    this.renderCache.set(cacheKey, result);

    job.status = 'completed';
    job.outputAssetId = result.outputAssetId;
    job.actualCostUsd = result.actualCostUsd;
    job.durationMs = result.durationMs;
    job.completedAt = new Date().toISOString();

    return result;
  }

  private async executeWithRetries(
    job: GenerationJob,
    providerId: string
  ): Promise<GenerationResult | undefined> {
    if (!this.providerRegistry.has(providerId)) {
      // Deterministic local mock fallback if provider not in registry
      const isLocal = providerId.includes('local');
      if (isLocal) {
        return {
          jobId: job.jobId,
          shotId: job.shotId,
          status: 'completed',
          providerId,
          outputAssetId: `ASSET_LOCAL_ANIM_${job.shotId}`,
          wasCached: false,
          actualCostUsd: 0.0,
          durationMs: 15,
        };
      }
      return undefined;
    }

    const provider = this.providerRegistry.get(providerId);
    const maxRetries = job.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        job.retryCount = attempt;
        const task: ProviderTask = {
          taskType: job.strategy.isDeterministic ? 'deterministic_anim' : 'video_gen',
          input: {
            strategy: job.strategy,
            promptPacket: job.strategy.promptPacket,
          },
          projectId: job.projectId,
          shotId: job.shotId,
        };

        const providerRes = await provider.execute(task);
        const durationMs = Date.now() - startTime;
        const actualCostUsd = providerRes.actualCostUsd ?? provider.metadata.costEstimateUsdPerInvocation;

        this.benchmarkTracker.recordResult(providerId, true, actualCostUsd, durationMs);

        return {
          jobId: job.jobId,
          shotId: job.shotId,
          status: 'completed',
          providerId,
          outputAssetId: (providerRes.output as any)?.assetId ?? `ASSET_GEN_${job.shotId}`,
          wasCached: false,
          actualCostUsd,
          durationMs,
        };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        this.benchmarkTracker.recordResult(providerId, false, 0.0, durationMs);
        job.error = err?.message ?? String(err);
      }
    }

    return undefined;
  }
}
