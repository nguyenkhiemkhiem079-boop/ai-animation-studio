import * as crypto from 'node:crypto';
import {
  ProviderExecutionEvidence,
  ProviderExecutionEvidenceSchema,
  ProviderErrorCategory,
  ProviderTrustLevel,
} from '../domain/production-run.js';

export interface ProviderExecutionInput {
  runId: string;
  shotId?: string;
  providerId: string;
  providerName: string;
  providerRole: string;
  actualModel: string;
  providerTrust?: ProviderTrustLevel;
  requestStartedAt: string;
  requestCompletedAt: string;
  latencyMs: number;
  retryCount?: number;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  errorCategory?: ProviderErrorCategory | null;
  errorMessage?: string;
  rawInput: unknown;
  rawOutput?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
  actualCostUsd?: number | null;
}

export class ProviderEvidenceRecorder {
  /**
   * Sanitizes any text or object to ensure NO credentials or secrets leak.
   */
  public static sanitize(value: unknown): string {
    if (value === undefined || value === null) return '';
    let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

    // Redact API Keys, Bearer tokens, passwords, cookies
    text = text.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
    text = text.replace(/sk-[0-9A-Za-z-_]{32,}/g, '[REDACTED_API_KEY]');
    text = text.replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');
    text = text.replace(/"(key|apiKey|password|secret|token)":\s*"[^"]+"/gi, '"$1": "[REDACTED]"');

    return text;
  }

  /**
   * Computes a deterministic SHA-256 hash of a string or object.
   */
  public static computeSha256(value: unknown): string {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Creates a sanitized, schema-validated ProviderExecutionEvidence record.
   */
  public static record(input: ProviderExecutionInput): ProviderExecutionEvidence {
    const sanitizedInput = this.sanitize(input.rawInput);
    const inputHash = this.computeSha256(sanitizedInput);

    let outputHash: string | null = null;
    if (input.rawOutput !== undefined && input.rawOutput !== null) {
      const sanitizedOutput = this.sanitize(input.rawOutput);
      outputHash = this.computeSha256(sanitizedOutput);
    }

    const evidenceId = `ev_prov_${input.runId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Strict truthful usage: Never fabricate missing usage
    const usage = input.usage
      ? {
          inputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          totalTokens: input.usage.totalTokens,
        }
      : null;

    const record: ProviderExecutionEvidence = {
      evidenceId,
      runId: input.runId,
      shotId: input.shotId,
      providerId: input.providerId,
      providerName: input.providerName,
      providerRole: input.providerRole,
      actualModel: input.actualModel,
      providerTrust: input.providerTrust ?? 'UNKNOWN',
      requestStartedAt: input.requestStartedAt,
      requestCompletedAt: input.requestCompletedAt,
      latencyMs: input.latencyMs,
      retryCount: input.retryCount ?? 0,
      status: input.status,
      errorCategory: input.errorCategory ?? null,
      errorMessage: input.errorMessage ? this.sanitize(input.errorMessage) : undefined,
      inputHash,
      outputHash,
      usage,
      actualCostUsd: input.actualCostUsd ?? null,
      recordedAt: new Date().toISOString(),
    };

    return ProviderExecutionEvidenceSchema.parse(record);
  }
}
