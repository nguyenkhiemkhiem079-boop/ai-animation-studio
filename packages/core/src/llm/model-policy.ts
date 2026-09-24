import { LLMModelRole } from './llm-provider.js';

export interface ModelPolicyConfig {
  fastModel?: string;
  reasoningModel?: string;
  structuredModel?: string;
  qaModel?: string;
  visionQaModel?: string;
}

export class ModelPolicy {
  public static readonly DEFAULT_MODELS: Record<LLMModelRole, string> = {
    FAST: 'gemini-3.6-flash',
    REASONING: 'gemini-3.6-flash',
    STRUCTURED: 'gemini-3.6-flash',
    QA: 'gemini-3.6-flash',
    VISION_QA: 'gemini-3.6-flash',
  };

  private modelMapping: Record<LLMModelRole, string>;

  constructor(config: ModelPolicyConfig = {}) {
    this.modelMapping = {
      FAST:
        config.fastModel ??
        process.env.GEMINI_MODEL_FAST ??
        ModelPolicy.DEFAULT_MODELS.FAST,
      REASONING:
        config.reasoningModel ??
        process.env.GEMINI_MODEL_REASONING ??
        ModelPolicy.DEFAULT_MODELS.REASONING,
      STRUCTURED:
        config.structuredModel ??
        process.env.GEMINI_MODEL_STRUCTURED ??
        ModelPolicy.DEFAULT_MODELS.STRUCTURED,
      QA:
        config.qaModel ??
        process.env.GEMINI_MODEL_QA ??
        ModelPolicy.DEFAULT_MODELS.QA,
      VISION_QA:
        config.visionQaModel ??
        process.env.GEMINI_MODEL_VISION_QA ??
        config.qaModel ??
        process.env.GEMINI_MODEL_QA ??
        ModelPolicy.DEFAULT_MODELS.VISION_QA,
    };
  }

  public getModelForRole(role: LLMModelRole): string {
    return this.modelMapping[role] ?? ModelPolicy.DEFAULT_MODELS[role];
  }

  public resolveModel(role?: LLMModelRole, explicitModelId?: string): string {
    if (explicitModelId) {
      return explicitModelId;
    }
    return this.getModelForRole(role ?? 'FAST');
  }

  public getAllMappings(): Record<LLMModelRole, string> {
    return { ...this.modelMapping };
  }
}

export function getCentralizedModelPolicy(): {
  fast: string;
  reasoning: string;
  structured: string;
  qa: string;
  visionQa: string;
} {
  const policy = new ModelPolicy();
  return {
    fast: policy.getModelForRole('FAST'),
    reasoning: policy.getModelForRole('REASONING'),
    structured: policy.getModelForRole('STRUCTURED'),
    qa: policy.getModelForRole('QA'),
    visionQa: policy.getModelForRole('VISION_QA'),
  };
}

export function getModelForRole(role: LLMModelRole): string {
  const policy = new ModelPolicy();
  return policy.getModelForRole(role);
}
