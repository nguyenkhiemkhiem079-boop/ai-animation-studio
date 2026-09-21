import {
  ExpressionEntry,
  ExpressionEntrySchema,
  ExpressionCategory,
  PoseEntry,
  PoseEntrySchema,
  PoseCategory,
  TurnaroundView,
} from '../domain/asset.js';
import { Outfit, OutfitSchema } from '../domain/universe.js';
import { ValidationError } from '../errors/index.js';

export class ExpressionLibrary {
  private expressions = new Map<string, ExpressionEntry>();

  constructor(initialEntries: ExpressionEntry[] = []) {
    for (const entry of initialEntries) {
      this.register(entry);
    }
  }

  public static createDefault(): ExpressionLibrary {
    const lib = new ExpressionLibrary();
    // Default catalog entries with placeholder or standard tokens
    const defaults: Omit<ExpressionEntry, 'assetId'>[] = [
      { name: 'neutral', category: 'neutral', intensity: 0.5, tags: ['default', 'calm'] },
      { name: 'happy', category: 'positive', intensity: 0.6, tags: ['joy', 'smile'] },
      { name: 'sad', category: 'negative', intensity: 0.6, tags: ['sorrow', 'tears'] },
      { name: 'afraid', category: 'intense', intensity: 0.8, tags: ['fear', 'scared', 'terror'] },
      { name: 'angry', category: 'intense', intensity: 0.7, tags: ['rage', 'furious'] },
      { name: 'surprised', category: 'intense', intensity: 0.7, tags: ['shock', 'gasp'] },
      { name: 'disgusted', category: 'negative', intensity: 0.6, tags: ['repulsion'] },
      { name: 'thoughtful', category: 'subtle', intensity: 0.4, tags: ['contemplative', 'pensive'] },
      { name: 'smirking', category: 'subtle', intensity: 0.5, tags: ['confidence', 'sly'] },
      { name: 'determined', category: 'positive', intensity: 0.7, tags: ['resolute', 'focused'] },
    ];

    for (const def of defaults) {
      lib.register({
        ...def,
        assetId: `EXPR_DEF_${def.name.toUpperCase()}`,
      });
    }

    return lib;
  }

  public register(entry: ExpressionEntry): void {
    const validated = ExpressionEntrySchema.parse(entry);
    this.expressions.set(validated.name.toLowerCase(), validated);
  }

  public get(name: string): ExpressionEntry | undefined {
    return this.expressions.get(name.toLowerCase());
  }

  public list(): ExpressionEntry[] {
    return Array.from(this.expressions.values());
  }

  public findByCategory(category: ExpressionCategory): ExpressionEntry[] {
    return this.list().filter((e) => e.category === category);
  }
}

export class PoseLibrary {
  private poses = new Map<string, PoseEntry>();

  constructor(initialEntries: PoseEntry[] = []) {
    for (const entry of initialEntries) {
      this.register(entry);
    }
  }

  public static createDefault(): PoseLibrary {
    const lib = new PoseLibrary();
    const defaults: Omit<PoseEntry, 'assetId'>[] = [
      { name: 'idle_standing', category: 'standing', facing: 'front', tags: ['neutral', 'standing'] },
      { name: 'idle_seated', category: 'seated', facing: 'front', tags: ['seated', 'chair'] },
      { name: 'walking', category: 'kinetic', facing: 'three_quarter_left', tags: ['movement', 'locomotion'] },
      { name: 'running', category: 'kinetic', facing: 'profile_left', tags: ['fast', 'sprint'] },
      { name: 'pointing', category: 'gesture', facing: 'three_quarter_left', tags: ['direction', 'arm_extended'] },
      { name: 'reaching', category: 'gesture', facing: 'front', tags: ['grasp', 'forward'] },
      { name: 'recoiling', category: 'kinetic', facing: 'three_quarter_right', tags: ['flinch', 'defensive'] },
      { name: 'combat_ready', category: 'standing', facing: 'three_quarter_left', tags: ['guard', 'action'] },
    ];

    for (const def of defaults) {
      lib.register({
        ...def,
        assetId: `POSE_DEF_${def.name.toUpperCase()}`,
      });
    }

    return lib;
  }

  public register(entry: PoseEntry): void {
    const validated = PoseEntrySchema.parse(entry);
    this.poses.set(validated.name.toLowerCase(), validated);
  }

  public get(name: string): PoseEntry | undefined {
    return this.poses.get(name.toLowerCase());
  }

  public list(): PoseEntry[] {
    return Array.from(this.poses.values());
  }

  public findByCategory(category: PoseCategory): PoseEntry[] {
    return this.list().filter((p) => p.category === category);
  }

  public findByFacing(facing: TurnaroundView): PoseEntry[] {
    return this.list().filter((p) => p.facing === facing);
  }
}

export class OutfitLibrary {
  private outfits = new Map<string, Outfit>(); // key: `${seriesId}:${characterId}:${outfitId}`

  private makeKey(seriesId: string, characterId: string, outfitId: string): string {
    return `${seriesId}:${characterId}:${outfitId.toLowerCase()}`;
  }

  public register(seriesId: string, characterId: string, outfit: Outfit): void {
    const validated = OutfitSchema.parse(outfit);
    this.outfits.set(this.makeKey(seriesId, characterId, validated.id), validated);
  }

  public get(seriesId: string, characterId: string, outfitId: string): Outfit | undefined {
    return this.outfits.get(this.makeKey(seriesId, characterId, outfitId));
  }

  public listForCharacter(seriesId: string, characterId: string): Outfit[] {
    const prefix = `${seriesId}:${characterId}:`;
    const results: Outfit[] = [];
    for (const [key, outfit] of this.outfits.entries()) {
      if (key.startsWith(prefix)) {
        results.push(outfit);
      }
    }
    return results;
  }

  public addReferenceAsset(
    seriesId: string,
    characterId: string,
    outfitId: string,
    assetId: string
  ): Outfit {
    const existing = this.get(seriesId, characterId, outfitId);
    if (!existing) {
      throw new ValidationError(
        `Outfit "${outfitId}" not found for character "${characterId}" in series "${seriesId}"`
      );
    }
    if (!existing.referenceAssetIds.includes(assetId)) {
      existing.referenceAssetIds.push(assetId);
    }
    this.outfits.set(this.makeKey(seriesId, characterId, outfitId), existing);
    return existing;
  }
}
