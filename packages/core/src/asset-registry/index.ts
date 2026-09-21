/**
 * Asset Registry foundation: content deduplication, versioning, and Canon approval.
 */

import { AssetDescriptor, AssetDescriptorSchema, AssetStatus, AssetType } from '../domain/asset.js';
import { ValidationError } from '../errors/index.js';
import type { IStorageProvider } from '../storage/index.js';

export interface AssetQueryFilter {
  seriesId: string;
  entityId?: string;
  type?: AssetType;
  status?: AssetStatus;
  tags?: string[];
  version?: number;
}

export interface IAssetRegistry {
  register(asset: Omit<AssetDescriptor, 'createdAt'>): Promise<AssetDescriptor>;
  findById(id: string): Promise<AssetDescriptor | null>;
  findByHash(seriesId: string, contentHash: string): Promise<AssetDescriptor | null>;
  query(filter: AssetQueryFilter): Promise<AssetDescriptor[]>;
  approveCanon(assetId: string): Promise<AssetDescriptor>;
}

export class InMemoryAssetRegistry implements IAssetRegistry {
  private assetsById = new Map<string, AssetDescriptor>();
  private assetsByHashSeries = new Map<string, AssetDescriptor>(); // key: `${seriesId}:${contentHash}`

  public async register(assetData: Omit<AssetDescriptor, 'createdAt'>): Promise<AssetDescriptor> {
    const fullAsset: AssetDescriptor = {
      ...assetData,
      createdAt: new Date().toISOString(),
    };
    const validated = AssetDescriptorSchema.parse(fullAsset);

    // Check deduplication within the series
    const hashKey = `${validated.seriesId}:${validated.contentHash}`;
    const existing = this.assetsByHashSeries.get(hashKey);
    if (existing) {
      // Re-use existing asset instead of duplicate registration
      return existing;
    }

    this.assetsById.set(validated.id, validated);
    this.assetsByHashSeries.set(hashKey, validated);
    return validated;
  }

  public async findById(id: string): Promise<AssetDescriptor | null> {
    return this.assetsById.get(id) ?? null;
  }

  public async findByHash(seriesId: string, contentHash: string): Promise<AssetDescriptor | null> {
    return this.assetsByHashSeries.get(`${seriesId}:${contentHash}`) ?? null;
  }

  public async query(filter: AssetQueryFilter): Promise<AssetDescriptor[]> {
    const results: AssetDescriptor[] = [];
    for (const asset of this.assetsById.values()) {
      if (asset.seriesId !== filter.seriesId) continue;
      if (filter.entityId && asset.entityId !== filter.entityId) continue;
      if (filter.type && asset.type !== filter.type) continue;
      if (filter.status && asset.status !== filter.status) continue;
      if (filter.version !== undefined && asset.version !== filter.version) continue;
      if (filter.tags && filter.tags.length > 0) {
        const hasAllTags = filter.tags.every((t) => asset.tags.includes(t));
        if (!hasAllTags) continue;
      }
      results.push(asset);
    }
    return results;
  }

  public async approveCanon(assetId: string): Promise<AssetDescriptor> {
    const asset = this.assetsById.get(assetId);
    if (!asset) {
      throw new ValidationError(`Asset "${assetId}" not found for Canon approval`);
    }

    const updated: AssetDescriptor = {
      ...asset,
      status: 'approved_canon',
      approvedAt: new Date().toISOString(),
    };
    this.assetsById.set(assetId, updated);
    this.assetsByHashSeries.set(`${asset.seriesId}:${asset.contentHash}`, updated);
    return updated;
  }

  public getAll(): AssetDescriptor[] {
    return Array.from(this.assetsById.values());
  }
}

export class FileSystemAssetRegistry implements IAssetRegistry {
  private inMemory: InMemoryAssetRegistry;
  private storage: IStorageProvider;
  private manifestPath: string;
  private initialized = false;

  constructor(storage: IStorageProvider, manifestPath = '.studio/assets/manifest.json') {
    this.storage = storage;
    this.manifestPath = manifestPath;
    this.inMemory = new InMemoryAssetRegistry();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (await this.storage.exists(this.manifestPath)) {
      try {
        const raw = await this.storage.readJson<AssetDescriptor[]>(this.manifestPath);
        for (const item of raw) {
          await this.inMemory.register(item);
        }
      } catch {
        // start clean if unparseable
      }
    }
    this.initialized = true;
  }

  private async persist(): Promise<void> {
    const all = this.inMemory.getAll();
    await this.storage.writeJson(this.manifestPath, all);
  }

  public async register(assetData: Omit<AssetDescriptor, 'createdAt'>): Promise<AssetDescriptor> {
    await this.ensureInitialized();
    const result = await this.inMemory.register(assetData);
    await this.saveCurrentState();
    return result;
  }

  public async findById(id: string): Promise<AssetDescriptor | null> {
    await this.ensureInitialized();
    return this.inMemory.findById(id);
  }

  public async findByHash(seriesId: string, contentHash: string): Promise<AssetDescriptor | null> {
    await this.ensureInitialized();
    return this.inMemory.findByHash(seriesId, contentHash);
  }

  public async query(filter: AssetQueryFilter): Promise<AssetDescriptor[]> {
    await this.ensureInitialized();
    return this.inMemory.query(filter);
  }

  public async approveCanon(assetId: string): Promise<AssetDescriptor> {
    await this.ensureInitialized();
    const updated = await this.inMemory.approveCanon(assetId);
    await this.saveCurrentState();
    return updated;
  }

  public getAll(): AssetDescriptor[] {
    return this.inMemory.getAll();
  }

  private async saveCurrentState(): Promise<void> {
    const all = this.inMemory.getAll();
    await this.storage.writeJson(this.manifestPath, all);
  }
}
