import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, CheckpointManager, CheckpointError } from '../src/index.js';

describe('Checkpoint System', () => {
  let storage: MemoryStorage;
  let checkpoints: CheckpointManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    checkpoints = new CheckpointManager(storage);
  });

  it('creates and lists checkpoints', async () => {
    const projectId = 'proj_alpha';
    const state1 = { stage: 'foundation', count: 1 };

    const meta = await checkpoints.createCheckpoint(projectId, 'v0.1-foundation', state1, {
      name: 'Foundation checkpoint',
      stage: 'foundation',
      tags: ['init', 'skeleton'],
    });

    expect(meta.id).toBe('v0.1-foundation');
    expect(meta.stateChecksum).toBeDefined();

    const list = await checkpoints.listCheckpoints(projectId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('v0.1-foundation');
  });

  it('restores checkpoint and preserves state integrity', async () => {
    const projectId = 'proj_alpha';
    const state = { characters: ['CHAR_MINH_001'], step: 'universe_ready' };

    await checkpoints.createCheckpoint(projectId, 'v0.2-universe', state);

    const restored = await checkpoints.restoreCheckpoint(projectId, 'v0.2-universe');
    expect(restored).toEqual(state);
  });

  it('detects tampering and throws error on checksum mismatch', async () => {
    const projectId = 'proj_alpha';
    const state = { clean: true };

    await checkpoints.createCheckpoint(projectId, 'v0.3-story', state);

    // Tamper with state file in storage directly
    const statePath = `.studio/projects/${projectId}/checkpoints/v0.3-story/state.json`;
    await storage.write(statePath, JSON.stringify({ clean: false, tampered: true }, null, 2));

    await expect(checkpoints.restoreCheckpoint(projectId, 'v0.3-story')).rejects.toThrow(CheckpointError);
  });

  it('throws when restoring non-existent checkpoint', async () => {
    await expect(checkpoints.restoreCheckpoint('proj_alpha', 'non-existent')).rejects.toThrow(CheckpointError);
  });
});
