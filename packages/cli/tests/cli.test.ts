import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { runCli } from '../src/index.js';
import { FileSystemStorage, UniverseManager } from '@ai-studio/core';

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

  it('manages universe display, export, import, and character listing via CLI', async () => {
    const universeManager = new UniverseManager(storage);
    const seriesId = 'series_cli_test';

    // Seed a character
    await universeManager.addCharacter(seriesId, {
      id: 'CHAR_CLI_01',
      seriesId,
      name: 'Agent Zero',
      description: 'Undercover detective',
      visualAnchorPrompt: 'Black suit, sunglasses',
      traits: ['calm'],
    });

    // 1. universe show
    const showCode = await runCli(['universe', 'show', seriesId], { cwd: tempDir, storage });
    expect(showCode).toBe(0);

    // 2. character list
    const charListCode = await runCli(['character', 'list', seriesId], { cwd: tempDir, storage });
    expect(charListCode).toBe(0);

    // 3. universe export
    const exportFile = 'exports/test_universe.json';
    const exportCode = await runCli(['universe', 'export', seriesId, exportFile], { cwd: tempDir, storage });
    expect(exportCode).toBe(0);
    expect(await storage.exists(exportFile)).toBe(true);

    // 4. universe import into backup series
    const importCode = await runCli(['universe', 'import', 'series_cli_backup', exportFile], { cwd: tempDir, storage });
    expect(importCode).toBe(0);
  });
});
