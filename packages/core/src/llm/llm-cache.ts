import * as crypto from 'node:crypto';
import { LLMStructuredRequest, LLMTextRequest } from './llm-provider.js';

export interface LLMCacheEntry<T = unknown> {
  key: string;
  data: T;
  seriesId: string;
  projectId?: string;
  promptVersion?: string;
  schemaVersion?: string;
  cachedAt: string;
}

export class LLMCache {
  private cache = new Map<string, LLMCacheEntry>();

  /**
   * Computes a deterministic SHA-256 cache key adhering to series isolation and prompt versioning.
   */
  public computeKey(
    req: LLMTextRequest | LLMStructuredRequest,
    providerId: string,
    model: string
  ): string {
    const seriesId = req.seriesId || 'default_series';
    const promptVersion =
      (req as any).promptVersion ??
      (req.metadata?.promptVersion as string) ??
      'v1';
    const schemaVersion =
      (req as any).schemaVersion ??
      (req.metadata?.schemaVersion as string) ??
      'v1';

    const payload = {
      providerId,
      model,
      taskType: req.taskType,
      seriesId,
      projectId: req.projectId,
      systemInstruction: req.systemInstruction ?? '',
      messages: req.messages ?? (req as any).prompt ?? '',
      prompt: (req as any).prompt ?? '',
      temperature: req.temperature ?? 0.0,
      promptVersion,
      schemaVersion,
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return `${seriesId}:${req.taskType}:${hash}`;
  }

  public get<T>(key: string, expectedSeriesId?: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Strict series isolation check
    if (expectedSeriesId && entry.seriesId !== expectedSeriesId) {
      return undefined;
    }

    return entry.data as T;
  }

  public set<T>(
    key: string,
    data: T,
    options: {
      seriesId: string;
      projectId?: string;
      promptVersion?: string;
      schemaVersion?: string;
    }
  ): void {
    this.cache.set(key, {
      key,
      data,
      seriesId: options.seriesId,
      projectId: options.projectId,
      promptVersion: options.promptVersion,
      schemaVersion: options.schemaVersion,
      cachedAt: new Date().toISOString(),
    });
  }

  public invalidateByPromptVersion(promptVersion: string): number {
    let evicted = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.promptVersion === promptVersion) {
        this.cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  public invalidateBySeries(seriesId: string): number {
    let evicted = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.seriesId === seriesId) {
        this.cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
