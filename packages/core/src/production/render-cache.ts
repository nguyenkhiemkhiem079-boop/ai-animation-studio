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
    return this.cache.get(cacheKey);
  }

  public has(cacheKey: string): boolean {
    return this.cache.has(cacheKey);
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
