import {
  LLMProvider,
  LLMProviderMetadata,
  LLMTextRequest,
  LLMTextResult,
  LLMStructuredRequest,
  LLMStructuredResult,
  LLMTaskType,
  LLMHealthReport,
} from './llm-provider.js';
import { ProviderTask, ProviderResult } from '../providers/index.js';
import { StudioExecutionMode, ProductionSafetyError } from '../domain/execution-mode.js';

export class MockLLMProvider implements LLMProvider {
  public readonly metadata: LLMProviderMetadata;
  private structuredHandlers = new Map<string, (req: LLMStructuredRequest<any>) => any>();
  private textHandlers = new Map<string, (req: LLMTextRequest) => string>();
  private executionMode: StudioExecutionMode = 'LOCAL';
  public invocationCount = 0;

  constructor(options: { id?: string; name?: string } = {}) {
    this.metadata = {
      id: options.id ?? 'mock-llm-provider',
      name: options.name ?? 'Mock LLM Provider',
      version: '1.0.0',
      capabilities: ['llm', 'qa'],
      isLocal: true,
      costEstimateUsdPerInvocation: 0.0,
      averageLatencyMs: 5,
      supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
      modelMapping: {
        FAST: 'mock-fast',
        REASONING: 'mock-reasoning',
        STRUCTURED: 'mock-structured',
        QA: 'mock-qa',
        VISION_QA: 'mock-vision-qa',
      },
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

  public setStructuredHandler<T>(taskType: LLMTaskType, handler: (req: LLMStructuredRequest<T>) => T): void {
    this.structuredHandlers.set(taskType, handler);
  }

  public setTextHandler(taskType: LLMTaskType, handler: (req: LLMTextRequest) => string): void {
    this.textHandlers.set(taskType, handler);
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async diagnoseHealth(): Promise<LLMHealthReport> {
    return {
      providerId: this.metadata.id,
      name: this.metadata.name,
      status: 'TEST_ONLY',
      isLocal: true,
      configured: true,
      capabilities: this.metadata.capabilities,
      details: 'Mock LLM Provider active for testing & offline simulation',
      message: 'Mock LLM Provider active',
      selectedModel: 'mock-fast',
    };
  }

  public setExecutionMode(mode: StudioExecutionMode): void {
    this.executionMode = mode;
  }

  public async generateText(request: LLMTextRequest): Promise<LLMTextResult> {
    if (this.executionMode === 'PRODUCTION') {
      throw new ProductionSafetyError('Mock LLM provider is strictly forbidden in PRODUCTION mode.');
    }
    this.invocationCount++;
    const handler = this.textHandlers.get(request.taskType);
    const text = handler ? handler(request) : `Mock generated text for ${request.taskType}`;

    return {
      text,
      model: 'mock-model',
      providerId: this.metadata.id,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        latencyMs: 5,
        retryCount: 0,
        costStatus: 'MOCK_COST',
        actualCostUsd: 0.0,
      },
    };
  }

  public async generateStructured<T>(request: LLMStructuredRequest<T>): Promise<LLMStructuredResult<T>> {
    if (this.executionMode === 'PRODUCTION') {
      throw new ProductionSafetyError('Mock LLM provider is strictly forbidden in PRODUCTION mode.');
    }
    this.invocationCount++;
    const handler = this.structuredHandlers.get(request.taskType);
    if (!handler) {
      throw new Error(`MockLLMProvider: No handler set for structured taskType "${request.taskType}"`);
    }

    const data = handler(request);
    return {
      data,
      rawText: JSON.stringify(data),
      model: 'mock-model',
      providerId: this.metadata.id,
      usage: {
        inputTokens: 15,
        outputTokens: 25,
        totalTokens: 40,
        latencyMs: 5,
        retryCount: 0,
        costStatus: 'MOCK_COST',
        actualCostUsd: 0.0,
      },
    };
  }

  public async execute<TInput = unknown, TOutput = unknown>(task: ProviderTask<TInput>): Promise<ProviderResult<TOutput>> {
    const input = task.input as any;
    if (input?.responseSchema) {
      const res = await this.generateStructured({
        taskType: (task.taskType as any) || 'GENERAL_REASONING',
        systemInstruction: input.systemInstruction,
        messages: input.messages || [{ role: 'user', content: input.prompt || JSON.stringify(input) }],
        responseSchema: input.responseSchema,
      });
      return {
        output: res.data as TOutput,
        actualCostUsd: 0.0,
        durationMs: 5,
        providerId: this.metadata.id,
      };
    }

    const res = await this.generateText({
      taskType: (task.taskType as any) || 'GENERAL_REASONING',
      systemInstruction: input?.systemInstruction,
      messages: input?.messages || [{ role: 'user', content: input?.prompt || String(input) }],
    });

    return {
      output: res.text as unknown as TOutput,
      actualCostUsd: 0.0,
      durationMs: 5,
      providerId: this.metadata.id,
    };
  }
}
