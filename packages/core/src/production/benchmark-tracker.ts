import { ProviderBenchmark } from '../domain/production.js';
import { IProvider } from '../providers/index.js';

export class ProviderBenchmarkTracker {
  private benchmarks = new Map<string, ProviderBenchmark>();

  public recordResult(
    providerId: string,
    success: boolean,
    costUsd: number,
    latencyMs: number,
    qualityScore: number = 0.9
  ): ProviderBenchmark {
    const existing = this.benchmarks.get(providerId) ?? {
      providerId,
      totalInvocations: 0,
      successfulInvocations: 0,
      failedInvocations: 0,
      successRate: 1.0,
      averageCostUsd: 0.0,
      averageLatencyMs: 0,
      qualityScore: 0.9,
      lastUpdated: new Date().toISOString(),
    };

    const newTotal = existing.totalInvocations + 1;
    const newSuccess = existing.successfulInvocations + (success ? 1 : 0);
    const newFailed = existing.failedInvocations + (success ? 0 : 1);
    const newRate = newSuccess / newTotal;

    // Moving averages
    const newAvgCost = (existing.averageCostUsd * existing.totalInvocations + costUsd) / newTotal;
    const newAvgLatency = (existing.averageLatencyMs * existing.totalInvocations + latencyMs) / newTotal;
    const newQuality = (existing.qualityScore * existing.totalInvocations + qualityScore) / newTotal;

    const updated: ProviderBenchmark = {
      providerId,
      totalInvocations: newTotal,
      successfulInvocations: newSuccess,
      failedInvocations: newFailed,
      successRate: Number(newRate.toFixed(4)),
      averageCostUsd: Number(newAvgCost.toFixed(4)),
      averageLatencyMs: Math.round(newAvgLatency),
      qualityScore: Number(newQuality.toFixed(4)),
      lastUpdated: new Date().toISOString(),
    };

    this.benchmarks.set(providerId, updated);
    return updated;
  }

  public getBenchmark(providerId: string): ProviderBenchmark | undefined {
    return this.benchmarks.get(providerId);
  }

  public listBenchmarks(): ProviderBenchmark[] {
    return Array.from(this.benchmarks.values());
  }

  public getBestProvider(candidates: IProvider[]): IProvider | undefined {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    // Sort by success rate desc, then cost asc, then latency asc
    const sorted = [...candidates].sort((a, b) => {
      const benchA = this.benchmarks.get(a.metadata.id);
      const benchB = this.benchmarks.get(b.metadata.id);

      const rateA = benchA ? benchA.successRate : 1.0;
      const rateB = benchB ? benchB.successRate : 1.0;
      if (rateA !== rateB) return rateB - rateA;

      const costA = benchA ? benchA.averageCostUsd : a.metadata.costEstimateUsdPerInvocation;
      const costB = benchB ? benchB.averageCostUsd : b.metadata.costEstimateUsdPerInvocation;
      if (costA !== costB) return costA - costB;

      const latA = benchA ? benchA.averageLatencyMs : a.metadata.averageLatencyMs;
      const latB = benchB ? benchB.averageLatencyMs : b.metadata.averageLatencyMs;
      return latA - latB;
    });

    return sorted[0];
  }
}
