/**
 * Storage abstraction and implementations (FileSystem & InMemory) for AI Animation Studio.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StorageError } from '../errors/index.js';

export interface IStorageProvider {
  read(uri: string): Promise<string>;
  readBinary(uri: string): Promise<Buffer>;
  readJson<T = unknown>(uri: string): Promise<T>;
  write(uri: string, data: string | Buffer): Promise<void>;
  writeJson<T = unknown>(uri: string, data: T): Promise<void>;
  exists(uri: string): Promise<boolean>;
  delete(uri: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  computeHash(data: string | Buffer): string;
}

export function computeSha256(data: string | Buffer): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * In-memory storage provider for fast unit testing and isolated runs.
 */
export class MemoryStorage implements IStorageProvider {
  private store = new Map<string, Buffer>();

  public async read(uri: string): Promise<string> {
    const buf = await this.readBinary(uri);
    return buf.toString('utf-8');
  }

  public async readBinary(uri: string): Promise<Buffer> {
    const data = this.store.get(this.normalize(uri));
    if (!data) {
      throw new StorageError(`File not found: ${uri}`);
    }
    return Buffer.from(data);
  }

  public async readJson<T = unknown>(uri: string): Promise<T> {
    const content = await this.read(uri);
    try {
      return JSON.parse(content) as T;
    } catch (err) {
      throw new StorageError(`Failed to parse JSON at ${uri}: ${err}`);
    }
  }

  public async write(uri: string, data: string | Buffer): Promise<void> {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    this.store.set(this.normalize(uri), Buffer.from(buf));
  }

  public async writeJson<T = unknown>(uri: string, data: T): Promise<void> {
    const str = JSON.stringify(data, null, 2);
    await this.write(uri, str);
  }

  public async exists(uri: string): Promise<boolean> {
    return this.store.has(this.normalize(uri));
  }

  public async delete(uri: string): Promise<void> {
    this.store.delete(this.normalize(uri));
  }

  public async list(prefix = ''): Promise<string[]> {
    const normPrefix = this.normalize(prefix);
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (!normPrefix || key.startsWith(normPrefix)) {
        keys.push(key);
      }
    }
    return keys.sort();
  }

  public computeHash(data: string | Buffer): string {
    return computeSha256(data);
  }

  public clear(): void {
    this.store.clear();
  }

  private normalize(uri: string): string {
    return uri.replace(/\\/g, '/').replace(/^\/+/, '');
  }
}

/**
 * FileSystem storage provider with atomic writes and directory management.
 */
export class FileSystemStorage implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  private resolvePath(uri: string): string {
    const cleanUri = uri.replace(/^[a-zA-Z]+:\/\//, ''); // strip file:// if present
    const resolved = path.resolve(this.baseDir, cleanUri);
    if (!resolved.startsWith(this.baseDir)) {
      throw new StorageError(`Access denied: path traverses outside base directory (${uri})`);
    }
    return resolved;
  }

  public async read(uri: string): Promise<string> {
    const target = this.resolvePath(uri);
    try {
      return await fs.readFile(target, 'utf-8');
    } catch (err: any) {
      throw new StorageError(`Failed to read file ${uri}: ${err.message}`, { path: target });
    }
  }

  public async readBinary(uri: string): Promise<Buffer> {
    const target = this.resolvePath(uri);
    try {
      return await fs.readFile(target);
    } catch (err: any) {
      throw new StorageError(`Failed to read binary file ${uri}: ${err.message}`, { path: target });
    }
  }

  public async readJson<T = unknown>(uri: string): Promise<T> {
    const raw = await this.read(uri);
    try {
      return JSON.parse(raw) as T;
    } catch (err: any) {
      throw new StorageError(`Invalid JSON in ${uri}: ${err.message}`);
    }
  }

  public async write(uri: string, data: string | Buffer): Promise<void> {
    const target = this.resolvePath(uri);
    const parent = path.dirname(target);
    try {
      await fs.mkdir(parent, { recursive: true });
      const tempPath = `${target}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, target);
    } catch (err: any) {
      throw new StorageError(`Failed to write file ${uri}: ${err.message}`, { path: target });
    }
  }

  public async writeJson<T = unknown>(uri: string, data: T): Promise<void> {
    const str = JSON.stringify(data, null, 2);
    await this.write(uri, str);
  }

  public async exists(uri: string): Promise<boolean> {
    const target = this.resolvePath(uri);
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  public async delete(uri: string): Promise<void> {
    const target = this.resolvePath(uri);
    try {
      await fs.rm(target, { force: true, recursive: true });
    } catch (err: any) {
      throw new StorageError(`Failed to delete file ${uri}: ${err.message}`, { path: target });
    }
  }

  public async list(prefix = ''): Promise<string[]> {
    const targetDir = this.resolvePath(prefix);
    try {
      const results: string[] = [];
      await this.scanDir(targetDir, results);
      const relPaths = results.map((abs) => path.relative(this.baseDir, abs).replace(/\\/g, '/'));
      return relPaths.sort();
    } catch {
      return [];
    }
  }

  private async scanDir(dir: string, accumulated: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await this.scanDir(full, accumulated);
        } else if (entry.isFile()) {
          accumulated.push(full);
        }
      }
    } catch {
      // ignore unreadable/non-existent
    }
  }

  public computeHash(data: string | Buffer): string {
    return computeSha256(data);
  }
}
