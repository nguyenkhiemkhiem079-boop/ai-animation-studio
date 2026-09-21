import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { MemoryStorage, FileSystemStorage } from '../src/index.js';

describe('Storage Abstraction', () => {
  describe('MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    it('writes, checks existence, reads, and deletes text', async () => {
      const uri = 'test/file.txt';
      expect(await storage.exists(uri)).toBe(false);

      await storage.write(uri, 'Hello Studio');
      expect(await storage.exists(uri)).toBe(true);

      const content = await storage.read(uri);
      expect(content).toBe('Hello Studio');

      await storage.delete(uri);
      expect(await storage.exists(uri)).toBe(false);
    });

    it('handles JSON read and write', async () => {
      const data = { title: 'Episode 1', count: 42 };
      await storage.writeJson('data/ep1.json', data);

      const loaded = await storage.readJson('data/ep1.json');
      expect(loaded).toEqual(data);
    });

    it('computes sha256 checksum', () => {
      const hash1 = storage.computeHash('sample text');
      const hash2 = storage.computeHash('sample text');
      const hash3 = storage.computeHash('different text');
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('lists files by prefix', async () => {
      await storage.write('scenes/sc01/shot01.json', '{}');
      await storage.write('scenes/sc01/shot02.json', '{}');
      await storage.write('scenes/sc02/shot01.json', '{}');

      const sc1Files = await storage.list('scenes/sc01');
      expect(sc1Files).toHaveLength(2);
      expect(sc1Files).toContain('scenes/sc01/shot01.json');
    });
  });

  describe('FileSystemStorage', () => {
    let tempDir: string;
    let storage: FileSystemStorage;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-fs-test-'));
      storage = new FileSystemStorage(tempDir);
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('atomically writes and reads files', async () => {
      const uri = 'manifests/project.json';
      const payload = { id: 'p1', name: 'FsProject' };

      await storage.writeJson(uri, payload);
      expect(await storage.exists(uri)).toBe(true);

      const readBack = await storage.readJson(uri);
      expect(readBack).toEqual(payload);
    });

    it('lists files correctly in filesystem', async () => {
      await storage.write('assets/a1.txt', 'asset 1');
      await storage.write('assets/a2.txt', 'asset 2');

      const files = await storage.list('assets');
      expect(files.length).toBe(2);
      expect(files).toContain('assets/a1.txt');
    });
  });
});
