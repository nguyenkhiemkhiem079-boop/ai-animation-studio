import * as crypto from 'node:crypto';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import {
  LLMProvider,
  LLMProviderMetadata,
  LLMTextRequest,
  LLMTextResult,
  LLMStructuredRequest,
  LLMStructuredResult,
  LLMErrorCategory,
  LLMUsageMetadata,
  LLMHealthReport,
} from './llm-provider.js';
import { ModelPolicy } from './model-policy.js';
import { LLMCache } from './llm-cache.js';
import { convertZodToJsonSchema } from './schema-converter.js';
import { ProviderTask, ProviderResult } from '../providers/index.js';
import { ProviderError } from '../errors/index.js';
import { StudioExecutionMode, ProductionSafetyError } from '../domain/execution-mode.js';

export interface GeminiProviderConfig {
  apiKey?: string;
  modelPolicy?: ModelPolicy;
  cache?: LLMCache;
  executionMode?: StudioExecutionMode;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  retryConfig?: {
    maxRetries?: number;
    initialBackoffMs?: number;
    maxBackoffMs?: number;
  };
  client?: GoogleGenAI; // for dependency injection in unit tests
}

export class GeminiProvider implements LLMProvider {
  public readonly metadata: LLMProviderMetadata;
  private apiKey?: string;
  private client?: GoogleGenAI;
  private modelPolicy: ModelPolicy;
  private cache: LLMCache;
  private executionMode: StudioExecutionMode;
  private maxRetries: number;
  private initialBackoffMs: number;
  private maxBackoffMs: number;
  private lastSuccessfulRequestAt?: string;
  private lastFailureMessage?: string;
  private lastErrorCategory?: LLMErrorCategory;
  private lastUsage?: LLMUsageMetadata;
  private lastModelUsed?: string;

  public getLastUsage(): LLMUsageMetadata | undefined {
    return this.lastUsage;
  }

  public getLastModelUsed(): string | undefined {
    return this.lastModelUsed;
  }

  constructor(config: GeminiProviderConfig = {}) {
    if (!config.apiKey && !process.env.GEMINI_API_KEY && typeof (process as any).loadEnvFile === 'function') {
      try {
        (process as any).loadEnvFile();
      } catch {
        // ignore
      }
    }
    this.apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
    this.modelPolicy = config.modelPolicy ?? new ModelPolicy();
    this.cache = config.cache ?? new LLMCache();
    this.executionMode = config.executionMode ?? 'LOCAL';
    this.maxRetries = config.retryConfig?.maxRetries ?? config.maxRetries ?? 3;
    this.initialBackoffMs = config.retryConfig?.initialBackoffMs ?? config.initialBackoffMs ?? 500;
    this.maxBackoffMs = config.retryConfig?.maxBackoffMs ?? config.maxBackoffMs ?? 4000;

    if (config.client) {
      this.client = config.client;
    } else if (this.apiKey && this.apiKey.trim().length > 0) {
      try {
        this.client = new GoogleGenAI({ apiKey: this.apiKey.trim() });
      } catch {
        // Deferred initialization or invalid format
      }
    }

    this.metadata = {
      id: 'google-gemini',
      name: 'Google Gemini (Google AI Studio)',
      version: '2.0.0',
      capabilities: ['llm', 'qa'],
      isLocal: false,
      costEstimateUsdPerInvocation: 0.0, // Free-tier-first
      averageLatencyMs: 800,
      supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA'],
      modelMapping: this.modelPolicy.getAllMappings(),
      supportedTasks: [
        'STORY_ANALYSIS',
        'SCENE_EXTRACTION',
        'DIRECTOR_REASONING',
        'SHOT_ASSIST',
        'PROMPT_COMPILE',
        'CONTINUITY_QA',
        'GENERAL_REASONING',
      ],
    };
  }

  /**
   * Masks sensitive credentials for logs and reports (e.g. AIza...xxxx).
   */
  public getMaskedApiKey(): string {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return '(not configured)';
    }
    const trimmed = this.apiKey.trim();
    if (trimmed.length <= 8) {
      return '***';
    }
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.client);
  }

  public async healthCheck(): Promise<boolean> {
    return this.isConfigured();
  }

  /**
   * Diagnostic health inspection without consuming paid tokens unless live check requested.
   */
  public async diagnoseHealth(live = false): Promise<LLMHealthReport> {
    if (!this.isConfigured()) {
      return {
        providerId: this.metadata.id,
        name: this.metadata.name,
        status: 'NOT_CONFIGURED',
        isLocal: false,
        configured: false,
        capabilities: this.metadata.capabilities,
        details: `GEMINI_API_KEY is not configured in environment. Key: ${this.getMaskedApiKey()}`,
        message: `GEMINI_API_KEY is not configured in environment. Key: ${this.getMaskedApiKey()}`,
        selectedModel: this.modelPolicy.getModelForRole('FAST'),
      };
    }

    if (!live) {
      return {
        providerId: this.metadata.id,
        name: this.metadata.name,
        status: 'AVAILABLE',
        isLocal: false,
        configured: true,
        capabilities: this.metadata.capabilities,
        details: `Gemini API Client initialized. Key: ${this.getMaskedApiKey()}, Models: ${JSON.stringify(this.modelPolicy.getAllMappings())}`,
        message: `Gemini API Client initialized. Key: ${this.getMaskedApiKey()}`,
        selectedModel: this.modelPolicy.getModelForRole('FAST'),
      };
    }

    // Live Check with minimal request
    const startTime = Date.now();
    try {
      const liveResult = await this.client!.models.generateContent({
        model: this.modelPolicy.getModelForRole('FAST'),
        contents: 'ping',
        config: {
          maxOutputTokens: 5,
        },
      });

      const latencyMs = Date.now() - startTime;
      this.lastSuccessfulRequestAt = new Date().toISOString();
      return {
        providerId: this.metadata.id,
        name: this.metadata.name,
        status: 'AVAILABLE',
        isLocal: false,
        configured: true,
        capabilities: this.metadata.capabilities,
        details: `Live connection verified. Response: "${liveResult.text?.trim() ?? 'ok'}", Key: ${this.getMaskedApiKey()}`,
        message: `Live connection verified in ${latencyMs}ms`,
        selectedModel: this.modelPolicy.getModelForRole('FAST'),
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const category = this.classifyError(err);
      this.lastFailureMessage = err?.message;
      this.lastErrorCategory = category;

      const status = category === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'UNAVAILABLE';
      return {
        providerId: this.metadata.id,
        name: this.metadata.name,
        status,
        isLocal: false,
        configured: true,
        capabilities: this.metadata.capabilities,
        details: `Live check failed (${category}): ${err?.message}`,
        message: `Live check failed (${category}): ${err?.message}`,
        selectedModel: this.modelPolicy.getModelForRole('FAST'),
        latencyMs,
      };
    }
  }

  public classifyError(err: any): LLMErrorCategory {
    if (!err) return 'UNKNOWN';
    const msg = (err?.message || '').toLowerCase();
    const status = err?.status || err?.statusCode || err?.code;

    if (
      status === 401 ||
      status === 403 ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('api_key') ||
      msg.includes('unauthorized') ||
      msg.includes('permission denied')
    ) {
      return 'AUTH_ERROR';
    }
    if (status === 429 || msg.includes('429') || msg.includes('rate limit')) {
      return 'RATE_LIMITED';
    }
    if (msg.includes('quota') || msg.includes('resource_exhausted')) {
      return 'QUOTA_EXCEEDED';
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline_exceeded') || msg.includes('etimedout')) {
      return 'TIMEOUT';
    }
    if (msg.includes('safety') || msg.includes('blocked') || msg.includes('harmful')) {
      return 'SAFETY_BLOCK';
    }
    if (msg.includes('zod') || msg.includes('validation') || msg.includes('json') || msg.includes('schema')) {
      return 'SCHEMA_VALIDATION_FAILED';
    }
    if (msg.includes('invalid argument') || msg.includes('bad request') || status === 400) {
      return 'INVALID_REQUEST';
    }
    if (status >= 500 || msg.includes('500') || msg.includes('internal') || msg.includes('service unavailable')) {
      return 'SERVER_ERROR';
    }
    if (msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('network')) {
      return 'NETWORK_ERROR';
    }

    return 'UNKNOWN';
  }

  /**
   * Generates free-form text using the Gemini API.
   */
  public async generateText(request: LLMTextRequest): Promise<LLMTextResult> {
    const traceId = request.traceId ?? `trace_${crypto.randomUUID()}`;
    const model = this.modelPolicy.resolveModel(request.modelRole, request.modelId);

    // 1. Check local cache
    const cacheKey = this.cache.computeKey(request, this.metadata.id, model);
    const cached = this.cache.get<LLMTextResult>(cacheKey, request.seriesId);
    if (cached) {
      return {
        ...cached,
        traceId,
        wasCached: true,
      };
    }

    // 2. Enforce execution mode safety
    this.assertExecutionReadiness(request.taskType);

    // 3. Assemble messages
    const msgs = request.messages && request.messages.length > 0
      ? request.messages
      : [{ role: 'user' as const, content: request.prompt || '' }];
    const contents = msgs.map((m) => `${m.role === 'model' ? 'Model' : 'User'}: ${m.content}`).join('\n\n');

    let attempt = 0;
    let lastErr: any;

    while (attempt <= this.maxRetries) {
      const startTime = Date.now();
      try {
        const response = await this.client!.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: request.systemInstruction,
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: request.maxOutputTokens ?? 2048,
          },
        });

        const durationMs = Date.now() - startTime;
        const text = response.text ?? '';
        const usage = this.extractUsageMetadata(response, durationMs, attempt);
        this.lastUsage = usage;
        this.lastModelUsed = model;

        const result: LLMTextResult = {
          text,
          model,
          providerId: this.metadata.id,
          usage,
          traceId,
          wasCached: false,
        };

        // Cache valid result
        this.cache.set(cacheKey, result, {
          seriesId: request.seriesId || 'default_series',
          projectId: request.projectId,
        });

        this.lastSuccessfulRequestAt = new Date().toISOString();
        return result;
      } catch (err: any) {
        lastErr = err;
        const category = this.classifyError(err);
        this.lastErrorCategory = category;
        this.lastFailureMessage = err?.message;

        if (this.isRetryable(category) && attempt < this.maxRetries) {
          const delay = this.computeBackoffMs(attempt);
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
          continue;
        }

        const providerError = new ProviderError(
          `Gemini generateText failed (${category}): ${err?.message}`,
          this.metadata.id,
          { category }
        );
        (providerError as any).category = category;
        throw providerError;
      }
    }

    const lastCat = this.lastErrorCategory || 'UNKNOWN';
    const providerError = new ProviderError(
      `Gemini generateText exhausted retries: ${lastErr?.message}`,
      this.metadata.id,
      { category: lastCat }
    );
    (providerError as any).category = lastCat;
    throw providerError;
  }

  /**
   * Generates structured JSON output strictly validated against a domain Zod schema.
   */
  public async generateStructured<T>(
    request: LLMStructuredRequest<T>
  ): Promise<LLMStructuredResult<T>> {
    const traceId = request.traceId ?? `trace_${crypto.randomUUID()}`;
    const model = this.modelPolicy.resolveModel(
      request.modelRole ?? 'STRUCTURED',
      request.modelId
    );

    // 1. Check local cache
    const cacheKey = this.cache.computeKey(request, this.metadata.id, model);
    const cached = this.cache.get<LLMStructuredResult<T>>(cacheKey, request.seriesId);
    if (cached) {
      return {
        ...cached,
        traceId,
        wasCached: true,
      };
    }

    // 2. Enforce execution mode safety
    this.assertExecutionReadiness(request.taskType);

    // 3. Prepare responseSchema
    const openApiSchema = convertZodToJsonSchema(request.responseSchema);
    const msgs = request.messages && request.messages.length > 0
      ? request.messages
      : [{ role: 'user' as const, content: request.prompt || '' }];
    const contents = msgs
      .map((m) => `${m.role === 'model' ? 'Model' : 'User'}: ${m.content}`)
      .join('\n\n');

    let attempt = 0;
    let lastErr: any;

    while (attempt <= this.maxRetries) {
      const startTime = Date.now();
      try {
        const response = await this.client!.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: request.systemInstruction,
            temperature: request.temperature ?? 0.1,
            maxOutputTokens: request.maxOutputTokens ?? 4096,
            responseMimeType: 'application/json',
            responseSchema: openApiSchema as any,
          },
        });

        const durationMs = Date.now() - startTime;
        const rawText = response.text ?? '';
        const usage = this.extractUsageMetadata(response, durationMs, attempt);
        this.lastUsage = usage;
        this.lastModelUsed = model;

        // 4. Parse JSON
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawText);
        } catch (jsonErr: any) {
          throw new ProviderError(
            `Malformed JSON returned by Gemini: ${jsonErr?.message}`,
            this.metadata.id
          );
        }

        // 5. Strict Domain Zod Validation
        let validatedData: T;
        if (request.responseSchema instanceof z.ZodType) {
          const zodResult = request.responseSchema.safeParse(parsedJson);
          if (!zodResult.success) {
            throw new ProviderError(
              `Gemini structured output failed domain schema validation: ${zodResult.error.message}`,
              this.metadata.id
            );
          }
          validatedData = zodResult.data as T;
        } else {
          validatedData = parsedJson as T;
        }

        const result: LLMStructuredResult<T> = {
          data: validatedData,
          rawText,
          model,
          providerId: this.metadata.id,
          usage,
          traceId,
          wasCached: false,
        };

        // Commit to series-isolated cache
        this.cache.set(cacheKey, result, {
          seriesId: request.seriesId || 'default_series',
          projectId: request.projectId,
          promptVersion: request.promptVersion,
          schemaVersion: request.schemaVersion,
        });

        this.lastSuccessfulRequestAt = new Date().toISOString();
        return result;
      } catch (err: any) {
        lastErr = err;
        const category = this.classifyError(err);
        this.lastErrorCategory = category;
        this.lastFailureMessage = err?.message;

        // Never blindly retry schema validation or safety errors with same prompt
        if (category === 'SCHEMA_VALIDATION_FAILED' || category === 'SAFETY_BLOCK' || category === 'INVALID_REQUEST') {
          throw err;
        }

        if (this.isRetryable(category) && attempt < this.maxRetries) {
          const delay = this.computeBackoffMs(attempt);
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
          continue;
        }

        const providerError = new ProviderError(
          `Gemini generateStructured failed (${category}): ${err?.message}`,
          this.metadata.id,
          { category }
        );
        (providerError as any).category = category;
        throw providerError;
      }
    }

    const lastCat = this.lastErrorCategory || 'UNKNOWN';
    const providerError = new ProviderError(
      `Gemini generateStructured exhausted retries: ${lastErr?.message}`,
      this.metadata.id,
      { category: lastCat }
    );
    (providerError as any).category = lastCat;
    throw providerError;
  }

  /**
   * Generic IProvider execute adapter method for registry integration.
   */
  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const input = task.input as any;

    if (input?.responseSchema) {
      const res = await this.generateStructured({
        taskType: (task.taskType as any) || 'GENERAL_REASONING',
        systemInstruction: input.systemInstruction,
        messages: input.messages || [{ role: 'user', content: input.prompt || JSON.stringify(input) }],
        responseSchema: input.responseSchema,
        projectId: task.projectId,
        seriesId: input.seriesId,
        temperature: input.temperature,
      });

      return {
        output: res.data as TOutput,
        actualCostUsd: res.usage.actualCostUsd ?? 0.0,
        durationMs: res.usage.latencyMs,
        providerId: this.metadata.id,
      };
    }

    const res = await this.generateText({
      taskType: (task.taskType as any) || 'GENERAL_REASONING',
      systemInstruction: input.systemInstruction,
      messages: input.messages || [{ role: 'user', content: input.prompt || String(input) }],
      projectId: task.projectId,
      seriesId: input.seriesId,
      temperature: input.temperature,
    });

    return {
      output: res.text as unknown as TOutput,
      actualCostUsd: res.usage.actualCostUsd ?? 0.0,
      durationMs: res.usage.latencyMs,
      providerId: this.metadata.id,
    };
  }

  private assertExecutionReadiness(taskType: string): void {
    if (!this.isConfigured()) {
      if (this.executionMode === 'PRODUCTION') {
        throw new ProductionSafetyError(
          `Gemini API requested for task "${taskType}" in PRODUCTION mode, but GEMINI_API_KEY is not configured.`
        );
      }
      throw new ProviderError(
        `Gemini Provider is not configured (missing GEMINI_API_KEY).`,
        this.metadata.id
      );
    }
  }

  private extractUsageMetadata(response: any, latencyMs: number, retryCount: number): LLMUsageMetadata {
    const usage = response?.usageMetadata;
    return {
      inputTokens: usage?.promptTokenCount,
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      completionTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      cachedTokens: usage?.cachedContentTokenCount,
      isFreeTierEstimated: true,
      latencyMs,
      retryCount,
      costStatus: 'FREE_TIER',
      actualCostUsd: 0.0,
    };
  }

  private isRetryable(category: LLMErrorCategory): boolean {
    return category === 'RATE_LIMITED' || category === 'SERVER_ERROR' || category === 'NETWORK_ERROR' || category === 'TIMEOUT';
  }

  private computeBackoffMs(attempt: number): number {
    const exp = Math.min(this.maxBackoffMs, this.initialBackoffMs * Math.pow(2, attempt));
    const jitter = Math.random() * 200;
    return exp + jitter;
  }
}
