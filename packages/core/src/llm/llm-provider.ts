import { z } from 'zod';
import { IProvider, ProviderHealthReport, ProviderMetadata } from '../providers/index.js';

export type LLMTaskType =
  | 'STORY_ANALYSIS'
  | 'SCENE_EXTRACTION'
  | 'DIRECTOR_REASONING'
  | 'SHOT_ASSIST'
  | 'PROMPT_COMPILE'
  | 'CONTINUITY_QA'
  | 'GENERAL_REASONING';

export type LLMErrorCategory =
  | 'AUTH_ERROR'
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'SAFETY_BLOCK'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export type CostStatus =
  | 'REAL_PROVIDER_COST'
  | 'ESTIMATED_PROVIDER_COST'
  | 'FREE_TIER'
  | 'LOCAL_COST'
  | 'MOCK_COST'
  | 'UNKNOWN';

export interface LLMUsageMetadata {
  inputTokens?: number;
  promptTokens?: number;
  outputTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  isFreeTierEstimated?: boolean;
  estimatedCostUsd?: number;
  latencyMs: number;
  retryCount: number;
  costStatus: CostStatus;
  actualCostUsd?: number;
}

export interface LLMMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export type LLMModelRole = 'FAST' | 'REASONING' | 'STRUCTURED' | 'QA';

export interface LLMTextRequest {
  taskType: LLMTaskType;
  systemInstruction?: string;
  messages?: LLMMessage[];
  prompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  modelRole?: LLMModelRole;
  modelId?: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  projectId?: string;
  seriesId?: string;
}

export interface LLMTextResult {
  text: string;
  model: string;
  providerId: string;
  usage: LLMUsageMetadata;
  traceId?: string;
  wasCached?: boolean;
}

export interface LLMStructuredRequest<T = unknown> {
  taskType: LLMTaskType;
  systemInstruction?: string;
  messages?: LLMMessage[];
  prompt?: string;
  responseSchema: z.ZodType<T, any, any> | any;
  schemaName?: string;
  temperature?: number;
  maxOutputTokens?: number;
  modelRole?: LLMModelRole;
  modelId?: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  projectId?: string;
  seriesId?: string;
  promptVersion?: string;
  schemaVersion?: string;
}

export interface LLMStructuredResult<T = unknown> {
  data: T;
  rawText: string;
  model: string;
  providerId: string;
  usage: LLMUsageMetadata;
  traceId?: string;
  wasCached?: boolean;
}

export interface LLMProviderMetadata extends ProviderMetadata {
  supportedRoles: LLMModelRole[];
  modelMapping: Record<LLMModelRole, string>;
  supportedTasks: LLMTaskType[];
}

export interface LLMHealthReport extends ProviderHealthReport {
  configured: boolean;
  message?: string;
  selectedModel?: string;
  latencyMs?: number;
}

export interface LLMProvider extends IProvider {
  readonly metadata: LLMProviderMetadata;
  healthCheck(): Promise<boolean>;
  diagnoseHealth(live?: boolean): Promise<LLMHealthReport>;
  generateText(request: LLMTextRequest): Promise<LLMTextResult>;
  generateStructured<T>(request: LLMStructuredRequest<T>): Promise<LLMStructuredResult<T>>;
}

/**
 * Singleton registry for discovering and routing to LLM providers.
 */
export class LLMProviderRegistry {
  private static instance: LLMProviderRegistry;
  private providers = new Map<string, LLMProvider>();
  private defaultProviderId?: string;

  public static getInstance(): LLMProviderRegistry {
    if (!LLMProviderRegistry.instance) {
      LLMProviderRegistry.instance = new LLMProviderRegistry();
    }
    return LLMProviderRegistry.instance;
  }

  public registerProvider(provider: LLMProvider, setAsDefault: boolean = false): void {
    this.providers.set(provider.metadata.id, provider);
    if (setAsDefault || !this.defaultProviderId) {
      this.defaultProviderId = provider.metadata.id;
    }
  }

  public getProvider(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  public getDefaultProvider(): LLMProvider | undefined {
    if (!this.defaultProviderId) return undefined;
    return this.providers.get(this.defaultProviderId);
  }

  public hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  public listProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  public clear(): void {
    this.providers.clear();
    this.defaultProviderId = undefined;
  }
}
