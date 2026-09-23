import { LLMProvider } from '../llm/llm-provider.js';
import { ProviderTrustLevel } from '../domain/production-run.js';
import { ProductionSafetyError } from '../domain/execution-mode.js';

export interface LiveProviderPreflightOptions {
  provider?: LLMProvider;
  requireLiveOptIn?: boolean;
  liveConfirmed?: boolean;
}

export interface LiveProviderPreflightResult {
  passed: boolean;
  providerTrust: ProviderTrustLevel;
  providerId?: string;
  providerName?: string;
  activeModel?: string;
  configured: boolean;
  multimodal: boolean;
  structuredOutput: boolean;
  visionQASupported: boolean;
  reasons: string[];
}

export class LiveProviderPreflight {
  /**
   * Evaluates provider readiness for genuine production acceptance.
   * Ensures provider is configured, reachable, verified trust level LIVE_EXTERNAL,
   * supports multimodal input, structured output, and VISION_QA role.
   * Never makes live network calls unless explicit live opt-in is confirmed.
   */
  public static async verify(options: LiveProviderPreflightOptions): Promise<LiveProviderPreflightResult> {
    const { provider, requireLiveOptIn = true, liveConfirmed = false } = options;
    const reasons: string[] = [];

    if (!provider) {
      return {
        passed: false,
        providerTrust: 'UNKNOWN',
        configured: false,
        multimodal: false,
        structuredOutput: false,
        visionQASupported: false,
        reasons: ['No LLM provider configured or supplied for production acceptance.'],
      };
    }

    const trust = provider.metadata.providerTrust || 'UNKNOWN';
    const isConfigured =
      typeof (provider as any).isConfigured === 'function'
        ? (provider as any).isConfigured()
        : true;
    const supportsMultimodal = Boolean(
      provider.metadata.supportsImages && provider.metadata.supportsMultimodalStructuredOutput
    );
    const supportsStructured = typeof provider.generateStructured === 'function';
    const supportsVisionQA = Boolean(provider.metadata.supportedRoles?.includes('VISION_QA'));

    // Rule 1: Trust level must be LIVE_EXTERNAL (or LOCAL_REAL)
    if (trust !== 'LIVE_EXTERNAL' && trust !== 'LOCAL_REAL') {
      reasons.push(
        `Provider trust level is "${trust}". Production acceptance requires "LIVE_EXTERNAL" (or approved real provider). OFFLINE_TEST_DOUBLE, MOCK, and UNKNOWN are rejected.`
      );
    }

    // Rule 2: Configuration / API credentials
    if (!isConfigured) {
      reasons.push(`Provider "${provider.metadata.name}" is not configured with valid API credentials.`);
    }

    // Rule 3: Multimodal image & structured output support
    if (!supportsMultimodal) {
      reasons.push(
        `Provider "${provider.metadata.name}" lacks multimodal image input / multimodal structured output support.`
      );
    }

    // Rule 4: Structured output support
    if (!supportsStructured) {
      reasons.push(`Provider "${provider.metadata.name}" does not support typed structured output generation.`);
    }

    // Rule 5: VISION_QA model role
    if (!supportsVisionQA) {
      reasons.push(`Provider "${provider.metadata.name}" does not support the required VISION_QA model role.`);
    }

    // Rule 6: Explicit live confirmation required for genuine production
    const liveOptIn = liveConfirmed || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
    if (requireLiveOptIn && !liveOptIn) {
      reasons.push(
        'Live execution opt-in not granted. Production acceptance with live provider requires RUN_LIVE_PROVIDER_TESTS=true or explicit operator confirmation.'
      );
    }

    // If all static checks pass and live opt-in is granted, perform minimal live reachability check
    let activeModel: string | undefined;
    if (reasons.length === 0 && liveOptIn) {
      try {
        const health = await provider.diagnoseHealth(true);
        if (health.status !== 'AVAILABLE') {
          reasons.push(`Provider health check failed: ${health.message || health.status}`);
        } else {
          activeModel = health.selectedModel;
        }
      } catch (err: any) {
        reasons.push(`Provider health unreachable: ${err?.message}`);
      }
    }

    return {
      passed: reasons.length === 0,
      providerTrust: trust,
      providerId: provider.metadata.id,
      providerName: provider.metadata.name,
      activeModel,
      configured: isConfigured,
      multimodal: supportsMultimodal,
      structuredOutput: supportsStructured,
      visionQASupported: supportsVisionQA,
      reasons,
    };
  }

  public static async assertVerified(options: LiveProviderPreflightOptions): Promise<LiveProviderPreflightResult> {
    const res = await this.verify(options);
    if (!res.passed) {
      throw new ProductionSafetyError(
        `Live provider preflight check failed:\n- ${res.reasons.join('\n- ')}`
      );
    }
    return res;
  }
}
