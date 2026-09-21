/**
 * Checkpoint system for saving, listing, diffing, and restoring Studio state.
 */

import { z } from 'zod';
import { CheckpointError } from '../errors/index.js';
import type { IStorageProvider } from '../storage/index.js';

export const CheckpointMetadataSchema = z.object({
  id: z.string().min(1), // e.g. "v0.1-foundation"
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  stage: z.string().default('pipeline'),
  stateChecksum: z.string().min(1),
  tags: z.array(z.string()).default([]),
  parentCheckpointId: z.string().optional(),
});
export type CheckpointMetadata = z.infer<typeof CheckpointMetadataSchema>;

export interface CheckpointBundle {
  metadata: CheckpointMetadata;
  state: Record<string, unknown>;
}

export class CheckpointManager {
  private storage: IStorageProvider;

  constructor(storage: IStorageProvider) {
    this.storage = storage;
  }

  private getBasePath(projectId: string): string {
    return `.studio/projects/${projectId}/checkpoints`;
  }

  private getCheckpointMetaPath(projectId: string, checkpointId: string): string {
    return `${this.getBasePath(projectId)}/${checkpointId}/checkpoint.meta.json`;
  }

  private getCheckpointStatePath(projectId: string, checkpointId: string): string {
    return `${this.getBasePath(projectId)}/${checkpointId}/state.json`;
  }

  public async createCheckpoint(
    projectId: string,
    checkpointId: string,
    stateData: Record<string, unknown>,
    options: {
      name?: string;
      description?: string;
      stage?: string;
      tags?: string[];
      parentCheckpointId?: string;
    } = {}
  ): Promise<CheckpointMetadata> {
    if (!checkpointId.trim()) {
      throw new CheckpointError('Checkpoint ID cannot be empty');
    }

    const stateSerialized = JSON.stringify(stateData, null, 2);
    const checksum = this.storage.computeHash(stateSerialized);

    const metadata: CheckpointMetadata = {
      id: checkpointId,
      projectId,
      name: options.name ?? checkpointId,
      description: options.description,
      createdAt: new Date().toISOString(),
      stage: options.stage ?? 'manual',
      stateChecksum: checksum,
      tags: options.tags ?? [],
      parentCheckpointId: options.parentCheckpointId,
    };

    // Validate metadata schema
    const parsedMeta = CheckpointMetadataSchema.parse(metadata);

    const metaPath = this.getCheckpointMetaPath(projectId, checkpointId);
    const statePath = this.getCheckpointStatePath(projectId, checkpointId);

    await this.storage.write(statePath, stateSerialized);
    await this.storage.writeJson(metaPath, parsedMeta);

    return parsedMeta;
  }

  public async restoreCheckpoint(projectId: string, checkpointId: string): Promise<Record<string, unknown>> {
    const bundle = await this.getCheckpoint(projectId, checkpointId);
    // Verify checksum
    const serialized = JSON.stringify(bundle.state, null, 2);
    const currentChecksum = this.storage.computeHash(serialized);
    if (currentChecksum !== bundle.metadata.stateChecksum) {
      throw new CheckpointError(
        `Checkpoint integrity failure for "${checkpointId}": expected ${bundle.metadata.stateChecksum}, got ${currentChecksum}`
      );
    }
    return bundle.state;
  }

  public async getCheckpoint(projectId: string, checkpointId: string): Promise<CheckpointBundle> {
    const metaPath = this.getCheckpointMetaPath(projectId, checkpointId);
    const statePath = this.getCheckpointStatePath(projectId, checkpointId);

    const exists = await this.storage.exists(metaPath);
    if (!exists) {
      throw new CheckpointError(`Checkpoint "${checkpointId}" not found for project "${projectId}"`);
    }

    const rawMeta = await this.storage.readJson<CheckpointMetadata>(metaPath);
    const metadata = CheckpointMetadataSchema.parse(rawMeta);
    const state = await this.storage.readJson<Record<string, unknown>>(statePath);

    return { metadata, state };
  }

  public async listCheckpoints(projectId: string): Promise<CheckpointMetadata[]> {
    const basePath = this.getBasePath(projectId);
    const allFiles = await this.storage.list(basePath);
    const metaFiles = allFiles.filter((f) => f.endsWith('/checkpoint.meta.json') || f.endsWith('checkpoint.meta.json'));

    const list: CheckpointMetadata[] = [];
    for (const file of metaFiles) {
      try {
        const raw = await this.storage.readJson<CheckpointMetadata>(file);
        list.push(CheckpointMetadataSchema.parse(raw));
      } catch {
        // skip corrupted
      }
    }

    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public async deleteCheckpoint(projectId: string, checkpointId: string): Promise<void> {
    const metaPath = this.getCheckpointMetaPath(projectId, checkpointId);
    const statePath = this.getCheckpointStatePath(projectId, checkpointId);
    await this.storage.delete(metaPath);
    await this.storage.delete(statePath);
  }
}
