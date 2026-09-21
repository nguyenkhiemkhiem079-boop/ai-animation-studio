import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { runCli } from '../src/index.js';
import { FileSystemStorage } from '@ai-studio/core';

describe('CLI Commands', () => {
  let tempDir: string;
  let storage: FileSystemStorage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-cli-test-'));
    storage = new FileSystemStorage(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('runs doctor command successfully', async () => {
    const code = await runCli(['doctor'], { cwd: tempDir, storage });
    expect(code).toBe(0);
  });

  it('shows help when requested', async () => {
    const code = await runCli(['help'], { cwd: tempDir, storage });
    expect(code).toBe(0);
  });

  it('creates and lists checkpoints via CLI', async () => {
    const projectId = 'test_proj';
    const ckptId = 'v0.1-foundation';

    const createCode = await runCli(['checkpoint', 'create', projectId, ckptId], {
      cwd: tempDir,
      storage,
    });
    expect(createCode).toBe(0);

    const listCode = await runCli(['checkpoint', 'list', projectId], {
      cwd: tempDir,
      storage,
    });
    expect(listCode).toBe(0);

    const restoreCode = await runCli(['checkpoint', 'restore', projectId, ckptId], {
      cwd: tempDir,
      storage,
    });
    expect(restoreCode).toBe(0);
  });

  it('inspects and validates JSON domain artifacts', async () => {
    const validProject = {
      id: 'p_inspect',
      name: 'Inspect Project',
      seriesId: 's_inspect',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await storage.writeJson('project.json', validProject);

    const code = await runCli(['inspect', 'project.json', 'project'], {
      cwd: tempDir,
      storage,
    });
    expect(code).toBe(0);
  });
});
