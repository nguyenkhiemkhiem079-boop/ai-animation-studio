/**
 * VeoOperationStore
 *
 * Persists Veo long-running operation IDs to disk so that a crashed Studio process
 * can resume polling without re-submitting a generation (and incurring duplicate costs).
 *
 * Schema: one JSON file per generation operation.
 * Path:   .studio/veo-operations/<projectId>/<operationId>.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { z } from 'zod';

// ─── Zod Schema ──────────────────────────────────────────────────────────────

export const VeoOperationStatusSchema = z.enum([
  'SUBMITTED',     // operation submitted, not yet done
  'POLLING',       // actively polling
  'DONE',          // completed (video available)
  'FAILED',        // terminal failure
  'CANCELLED',     // cancelled by user
]);
export type VeoOperationStatus = z.infer<typeof VeoOperationStatusSchema>;

export const VeoOperationRecordSchema = z.object({
  /** The operation name returned by the Gemini API (e.g. "operations/...") */
  operationName: z.string(),
  /** Stable identifier used by Studio internals (independent of API format) */
  clipId: z.string(),
  projectId: z.string(),
  /** SHA-256 of the prompt text — used to detect duplicate submission attempts */
  promptHash: z.string(),
  model: z.string(),
  aspectRatio: z.string().default('16:9'),
  resolution: z.string().default('720p'),
  durationSeconds: z.number().optional(),
  numberOfVideos: z.number().default(1),
  status: VeoOperationStatusSchema,
  submittedAt: z.string(),         // ISO timestamp
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  /** Physical path of the downloaded clip once generation is done */
  outputPath: z.string().optional(),
  /** SHA-256 of the downloaded clip */
  outputSha256: z.string().optional(),
  errorMessage: z.string().optional(),
  /** Number of polls since submission */
  pollCount: z.number().default(0),
  /** Raw API metadata (provider model used, etc.) */
  apiMetadata: z.record(z.unknown()).optional(),
});
export type VeoOperationRecord = z.infer<typeof VeoOperationRecordSchema>;

// ─── Store ───────────────────────────────────────────────────────────────────

export class VeoOperationStore {
  private readonly baseDir: string;

  constructor(baseDir = '.studio/veo-operations') {
    this.baseDir = baseDir;
  }

  private recordPath(projectId: string, clipId: string): string {
    return path.join(this.baseDir, projectId, `${clipId}.json`);
  }

  /** Compute a SHA-256 hash of the prompt text (used for duplicate detection). */
  public static hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
  }

  /**
   * Returns an existing SUBMITTED/POLLING record for the same project+promptHash,
   * so the caller can resume instead of re-submitting.
   */
  public findExistingOperation(projectId: string, promptHash: string): VeoOperationRecord | null {
    const dir = path.join(this.baseDir, projectId);
    if (!fs.existsSync(dir)) return null;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const rec = VeoOperationRecordSchema.parse(raw);
        if (
          rec.projectId === projectId &&
          rec.promptHash === promptHash &&
          (rec.status === 'SUBMITTED' || rec.status === 'POLLING')
        ) {
          return rec;
        }
      } catch {
        // corrupt record — skip
      }
    }
    return null;
  }

  /** Persist a new operation record immediately after submission. */
  public save(record: VeoOperationRecord): void {
    const dir = path.join(this.baseDir, record.projectId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = this.recordPath(record.projectId, record.clipId);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  }

  /** Update fields on an existing record (e.g. after each poll). */
  public update(projectId: string, clipId: string, patch: Partial<VeoOperationRecord>): VeoOperationRecord {
    const filePath = this.recordPath(projectId, clipId);
    const existing = this.load(projectId, clipId);
    if (!existing) throw new Error(`VeoOperationStore: record not found for clipId="${clipId}"`);
    const updated: VeoOperationRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  /** Load a record by projectId + clipId. Returns null if not found. */
  public load(projectId: string, clipId: string): VeoOperationRecord | null {
    const filePath = this.recordPath(projectId, clipId);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return VeoOperationRecordSchema.parse(raw);
    } catch {
      return null;
    }
  }

  /** List all operations for a project. */
  public listForProject(projectId: string): VeoOperationRecord[] {
    const dir = path.join(this.baseDir, projectId);
    if (!fs.existsSync(dir)) return [];
    const results: VeoOperationRecord[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        results.push(VeoOperationRecordSchema.parse(raw));
      } catch {
        // skip corrupt records
      }
    }
    return results.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }
}
