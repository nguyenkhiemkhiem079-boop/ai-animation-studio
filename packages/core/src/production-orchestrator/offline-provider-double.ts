import { z } from 'zod';
import {
  LLMProvider,
  LLMProviderMetadata,
  LLMTextRequest,
  LLMTextResult,
  LLMStructuredRequest,
  LLMStructuredResult,
  LLMHealthReport,
} from '../llm/llm-provider.js';
import { ProviderTask, ProviderResult } from '../providers/index.js';
import { VisualQAOutput } from '../llm/prompts/visual-qa.js';
import { StoryAnalysisExtraction } from '../llm/prompts/story-analysis.js';

/**
 * Deterministic offline test double for CI and deterministic gate execution.
 * Explicitly declares itself as offline test double so evidence remains truthful.
 */
export class DeterministicOfflineLLMDouble implements LLMProvider {
  public readonly metadata: LLMProviderMetadata = {
    id: 'offline-deterministic-double',
    name: 'Deterministic Offline Test Double',
    version: '1.0.0',
    capabilities: ['llm', 'qa'],
    isLocal: true,
    providerTrust: 'OFFLINE_TEST_DOUBLE',
    costEstimateUsdPerInvocation: 0.0,
    averageLatencyMs: 5,
    supportedRoles: ['FAST', 'REASONING', 'STRUCTURED', 'QA', 'VISION_QA'],
    modelMapping: {
      FAST: 'offline-test-model',
      REASONING: 'offline-test-model',
      STRUCTURED: 'offline-test-model',
      QA: 'offline-test-model',
      VISION_QA: 'offline-test-model-vision',
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
    supportsImages: true,
    supportsMultimodalStructuredOutput: true,
  };

  public isConfigured(): boolean {
    return true;
  }

  public getLastModelUsed(): string {
    return 'offline-test-model-vision';
  }

  public getLastUsage() {
    return {
      inputTokens: 150,
      outputTokens: 75,
      totalTokens: 225,
      latencyMs: 5,
      retryCount: 0,
      costStatus: 'MOCK_COST' as const,
      actualCostUsd: 0.0,
    };
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
      details: 'Deterministic Offline Double active for CI & offline regression testing',
      message: 'Deterministic Offline Double ready',
      selectedModel: 'offline-test-model',
    };
  }

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

  public async generateText(request: LLMTextRequest): Promise<LLMTextResult> {
    return {
      text: `Deterministic offline text for ${request.taskType}`,
      model: 'offline-test-model',
      providerId: this.metadata.id,
      usage: this.getLastUsage(),
    };
  }

  public async generateStructured<T>(request: LLMStructuredRequest<T>): Promise<LLMStructuredResult<T>> {
    let result: any;

    if (
      request.taskType === 'CONTINUITY_QA' ||
      request.modelRole === 'VISION_QA' ||
      request.schemaName === 'VisualQAOutput'
    ) {
      const visualQAResult: VisualQAOutput = {
        identityConsistencyScore: 0.95,
        spatialPerspectiveScore: 0.95,
        visualDefectScore: 0.95,
        overallVisualContinuityScore: 0.95,
        passed: true,
        defects: [],
        retakeRecommendations: [],
      };
      result = visualQAResult;
    } else if (
      request.taskType === 'STORY_ANALYSIS' ||
      request.schemaName === 'StoryAnalysisExtraction'
    ) {
      const storyExtraction: StoryAnalysisExtraction = {
        summary: 'Minh bước vào căn phòng tối nhìn thấy bướm trắng quanh ngọn nến.',
        characters: [
          { suggestedName: 'Minh', traits: ['curious'], dialogueSample: undefined },
        ],
        locations: [
          { suggestedName: 'Dark Room', description: 'Dark room with a lit candle', zones: [] },
        ],
        props: [
          { suggestedName: 'Candle', visualDescription: 'Lit candle with flame' },
        ],
        scenes: [
          {
            sceneNumber: 1,
            heading: 'INT. DARK ROOM - NIGHT',
            timeOfDay: 'night',
            locationName: 'Dark Room',
            charactersPresent: ['Minh'],
            beats: [
              { summary: 'Minh enters dark room', involvedCharacters: ['Minh'] },
              { summary: 'White butterfly circles the candle', involvedCharacters: ['Minh'] },
            ],
            dialogueLines: [],
            narrationLines: ['Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.'],
          },
        ],
      };
      result = storyExtraction;
    } else {
      result = {} as T;
    }

    const validated = request.responseSchema ? request.responseSchema.parse(result) : result;

    return {
      data: validated,
      rawText: JSON.stringify(validated),
      model: this.getLastModelUsed(),
      providerId: this.metadata.id,
      usage: this.getLastUsage(),
    };
  }
}
