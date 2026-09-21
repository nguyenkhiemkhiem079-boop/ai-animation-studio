/**
 * Provider abstraction, capability registry, and mock provider for AI Animation Studio.
 */

import { ProviderError } from '../errors/index.js';

export type ProviderCapability =
  | 'llm'
  | 'image_gen'
  | 'video_gen'
  | 'audio_gen'
  | 'deterministic_anim'
  | 'qa';

export interface ProviderMetadata {
  id: string;
  name: string;
  version: string;
  capabilities: ProviderCapability[];
  isLocal: boolean;
  costEstimateUsdPerInvocation: number;
  averageLatencyMs: number;
}

export interface ProviderTask<TInput = unknown> {
  taskType: string;
  input: TInput;
  projectId?: string;
  shotId?: string;
}

export interface ProviderResult<TOutput = unknown> {
  output: TOutput;
  actualCostUsd: number;
  durationMs: number;
  providerId: string;
}

export type ProviderHealthStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'TEST_ONLY';

export interface ProviderHealthReport {
  providerId: string;
  name: string;
  status: ProviderHealthStatus;
  isLocal: boolean;
  capabilities: ProviderCapability[];
  details?: string;
}

export interface IProvider {
  readonly metadata: ProviderMetadata;
  healthCheck(): Promise<boolean>;
  diagnoseHealth?(): Promise<ProviderHealthReport>;
  execute<TInput = unknown, TOutput = unknown>(task: ProviderTask<TInput>): Promise<ProviderResult<TOutput>>;
}

/**
 * Registry for discovering, ranking, and routing provider requests.
 */
export class ProviderRegistry {
  private providers = new Map<string, IProvider>();

  public register(provider: IProvider): void {
    this.providers.set(provider.metadata.id, provider);
  }

  public unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  public get(providerId: string): IProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(`Provider "${providerId}" not found in registry`, providerId);
    }
    return provider;
  }

  public has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  public list(): IProvider[] {
    return Array.from(this.providers.values());
  }

  public findByCapability(capability: ProviderCapability): IProvider[] {
    return this.list().filter((p) => p.metadata.capabilities.includes(capability));
  }

  /**
   * Selects best provider according to production strategy:
   * Prioritize local / deterministic first, then cheapest / lowest latency.
   */
  public selectBest(capability: ProviderCapability, preferences: { preferLocal?: boolean; maxCostUsd?: number } = {}): IProvider {
    const candidates = this.findByCapability(capability);
    if (candidates.length === 0) {
      throw new ProviderError(`No provider available with capability "${capability}"`, 'none');
    }

    // Sort by local preference, then cost, then latency
    candidates.sort((a, b) => {
      if (preferences.preferLocal) {
        if (a.metadata.isLocal && !b.metadata.isLocal) return -1;
        if (!a.metadata.isLocal && b.metadata.isLocal) return 1;
      }
      if (a.metadata.costEstimateUsdPerInvocation !== b.metadata.costEstimateUsdPerInvocation) {
        return a.metadata.costEstimateUsdPerInvocation - b.metadata.costEstimateUsdPerInvocation;
      }
      return a.metadata.averageLatencyMs - b.metadata.averageLatencyMs;
    });

    if (preferences.maxCostUsd !== undefined && candidates[0].metadata.costEstimateUsdPerInvocation > preferences.maxCostUsd) {
      throw new ProviderError(
        `Cheapest provider "${candidates[0].metadata.id}" costs $${candidates[0].metadata.costEstimateUsdPerInvocation}, exceeding max budget of $${preferences.maxCostUsd}`,
        candidates[0].metadata.id
      );
    }

    return candidates[0];
  }

  public async diagnoseAll(): Promise<ProviderHealthReport[]> {
    const reports: ProviderHealthReport[] = [];
    for (const provider of this.providers.values()) {
      if (typeof provider.diagnoseHealth === 'function') {
        reports.push(await provider.diagnoseHealth());
      } else {
        const isMock = provider.metadata.id.includes('mock') || (provider.metadata as any).isMock;
        let isHealthy = false;
        try {
          isHealthy = await provider.healthCheck();
        } catch {
          isHealthy = false;
        }

        let status: ProviderHealthStatus;
        if (isMock) {
          status = 'TEST_ONLY';
        } else if (isHealthy) {
          status = 'AVAILABLE';
        } else {
          status = 'NOT_CONFIGURED';
        }

        reports.push({
          providerId: provider.metadata.id,
          name: provider.metadata.name,
          status,
          isLocal: provider.metadata.isLocal,
          capabilities: provider.metadata.capabilities,
        });
      }
    }
    return reports;
  }
}

/**
 * Deterministic mock provider for tests and local development.
 */
export class MockProvider implements IProvider {
  public readonly metadata: ProviderMetadata;
  private mockHandlers = new Map<string, (input: any) => any>();

  constructor(options: {
    id?: string;
    name?: string;
    capabilities?: ProviderCapability[];
    cost?: number;
    latencyMs?: number;
  } = {}) {
    this.metadata = {
      id: options.id ?? 'mock-provider',
      name: options.name ?? 'Mock Test Provider',
      version: '1.0.0',
      capabilities: options.capabilities ?? ['llm', 'image_gen', 'video_gen', 'deterministic_anim', 'qa'],
      isLocal: true,
      costEstimateUsdPerInvocation: options.cost ?? 0.0,
      averageLatencyMs: options.latencyMs ?? 5,
    };
  }

  public setHandler<TInput, TOutput>(taskType: string, handler: (input: TInput) => TOutput): void {
    this.mockHandlers.set(taskType, handler);
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async execute<TInput = unknown, TOutput = unknown>(task: ProviderTask<TInput>): Promise<ProviderResult<TOutput>> {
    const start = Date.now();
    const handler = this.mockHandlers.get(task.taskType);
    let output: any;

    if (handler) {
      output = handler(task.input);
    } else {
      // Default deterministic echo
      output = {
        mockProcessed: true,
        taskType: task.taskType,
        receivedInput: task.input,
      };
    }

    return {
      output: output as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - start,
      providerId: this.metadata.id,
    };
  }
}

export const defaultProviderRegistry = new ProviderRegistry();
