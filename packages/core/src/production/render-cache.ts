import { createHash } from 'crypto';
import { ShotContract } from '../domain/director.js';
import { CompiledPromptPacket, GenerationResult } from '../domain/production.js';

export class RenderCache {
  private cache = new Map<string, GenerationResult>();

  public computeCacheKey(
    shot: ShotContract,
    promptPacket?: CompiledPromptPacket,
    inputAssetIds: string[] = []
  ): string {
    const payload = {
      shotId: shot.id,
      camera: shot.camera,
      lighting: shot.lighting,
      frame: shot.frame,
      acting: shot.acting,
      transition: shot.transition,
      locationId: shot.environmentLocationId,
      zoneId: shot.environmentZoneId,
      prompt: promptPacket ? {
        positive: promptPacket.positivePrompt,
        negative: promptPacket.negativePrompt,
        bindings: promptPacket.referenceBindings.map((b) => ({ role: b.role, assetId: b.assetId, weight: b.weight })),
      } : null,
      assets: [...inputAssetIds].sort(),
    };

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  public get(cacheKey: string): GenerationResult | undefined {
    const cached = this.cache.get(cacheKey);
    if (!cached) return undefined;

    // Physical cache validity check: If mediaUri/storageUri points to a file, verify it physically exists and is non-empty
    const uri = cached.mediaUri || (cached as any).storageUri;
    if (uri && typeof uri === 'string' && !uri.startsWith('http')) {
      try {
        const fs = require('node:fs');
        if (!fs.existsSync(uri) || fs.statSync(uri).size === 0) {
          this.cache.delete(cacheKey);
          return undefined;
        }
      } catch {
        this.cache.delete(cacheKey);
        return undefined;
      }
    }

    return cached;
  }

  public has(cacheKey: string): boolean {
    return this.get(cacheKey) !== undefined;
  }

  public set(cacheKey: string, result: GenerationResult): void {
    this.cache.set(cacheKey, result);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
