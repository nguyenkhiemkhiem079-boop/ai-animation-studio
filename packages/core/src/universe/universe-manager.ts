/**
 * UniverseManager: Persistent memory, series isolation, immutable character versioning,
 * and universe import/export for AI Animation Studio.
 */

import {
  Universe,
  UniverseSchema,
  CharacterDNA,
  CharacterDNASchema,
  CharacterVersion,
  LocationDNA,
  LocationDNASchema,
  LocationZone,
  PropDNA,
  PropDNASchema,
  RelationshipDNA,
  RelationshipDNASchema,
  Outfit,
  UniverseExportBundle,
  UniverseExportBundleSchema,
} from '../domain/universe.js';
import { ValidationError, ContinuityError } from '../errors/index.js';
import type { IStorageProvider } from '../storage/index.js';

export class UniverseManager {
  private storage: IStorageProvider;

  constructor(storage: IStorageProvider) {
    this.storage = storage;
  }

  private getUniversePath(seriesId: string): string {
    return `.studio/universes/${seriesId}/universe.json`;
  }

  public async getOrCreateUniverse(seriesId: string): Promise<Universe> {
    const path = this.getUniversePath(seriesId);
    if (await this.storage.exists(path)) {
      const raw = await this.storage.readJson<Universe>(path);
      return UniverseSchema.parse(raw);
    }

    const now = new Date().toISOString();
    const newUniverse: Universe = {
      seriesId,
      characters: {},
      locations: {},
      props: {},
      relationships: [],
      canonState: {
        lockedCharacterIds: [],
        lockedLocationIds: [],
        lockedPropIds: [],
        worldFacts: [],
        updatedAt: now,
      },
      currentWorldState: {
        timestamp: now,
        characterLocations: {},
        propHolders: {},
        worldFacts: [],
      },
      transitions: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    const validated = UniverseSchema.parse(newUniverse);
    await this.storage.writeJson(path, validated);
    return validated;
  }

  public async saveUniverse(universe: Universe): Promise<void> {
    const validated = UniverseSchema.parse({
      ...universe,
      updatedAt: new Date().toISOString(),
    });
    const path = this.getUniversePath(universe.seriesId);
    await this.storage.writeJson(path, validated);
  }

  public async addCharacter(
    seriesId: string,
    charData: Omit<CharacterDNA, 'createdAt' | 'updatedAt' | 'currentVersion' | 'versions'> & {
      versions?: CharacterVersion[];
    }
  ): Promise<CharacterDNA> {
    const universe = await this.getOrCreateUniverse(seriesId);
    if (universe.characters[charData.id]) {
      throw new ValidationError(`Character with ID "${charData.id}" already exists in series "${seriesId}"`);
    }

    const now = new Date().toISOString();
    const initialVersion: CharacterVersion = {
      version: 1,
      summary: 'Initial character introduction look',
      visualAnchorPrompt: charData.visualAnchorPrompt,
      canonicalAssetIds: charData.canonicalSheetAssetId ? [charData.canonicalSheetAssetId] : [],
      createdAt: now,
    };

    const character: CharacterDNA = {
      ...charData,
      seriesId,
      aliases: charData.aliases ?? [],
      currentVersion: 1,
      versions: [initialVersion],
      outfits: charData.outfits ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const validated = CharacterDNASchema.parse(character);
    universe.characters[validated.id] = validated;
    await this.saveUniverse(universe);
    return validated;
  }

  /**
   * Creates a new version of a Character while keeping all historical versions IMMUTABLE.
   * Updating Character v2 MUST NOT modify or mutate Character v1.
   */
  public async createCharacterVersion(
    seriesId: string,
    characterId: string,
    versionUpdate: {
      summary: string;
      visualChanges?: string;
      visualAnchorPrompt?: string;
      canonicalAssetIds?: string[];
    }
  ): Promise<CharacterDNA> {
    const universe = await this.getOrCreateUniverse(seriesId);
    const existing = universe.characters[characterId];
    if (!existing) {
      throw new ValidationError(`Character "${characterId}" not found in series "${seriesId}"`);
    }

    const now = new Date().toISOString();
    const nextVersionNum = existing.currentVersion + 1;

    // Build immutable copy of the new version
    const newVersion: CharacterVersion = {
      version: nextVersionNum,
      summary: versionUpdate.summary,
      visualChanges: versionUpdate.visualChanges,
      visualAnchorPrompt: versionUpdate.visualAnchorPrompt ?? existing.visualAnchorPrompt,
      canonicalAssetIds: versionUpdate.canonicalAssetIds ?? [],
      createdAt: now,
    };

    // Deep copy existing versions array to ensure absolute immutability of historical snapshots
    const updatedVersions = existing.versions.map((v) => ({ ...v, canonicalAssetIds: [...v.canonicalAssetIds] }));
    updatedVersions.push(newVersion);

    const updatedCharacter: CharacterDNA = {
      ...existing,
      currentVersion: nextVersionNum,
      visualAnchorPrompt: versionUpdate.visualAnchorPrompt ?? existing.visualAnchorPrompt,
      versions: updatedVersions,
      updatedAt: now,
    };

    const validated = CharacterDNASchema.parse(updatedCharacter);
    universe.characters[characterId] = validated;
    await this.saveUniverse(universe);
    return validated;
  }

  public async addOutfit(seriesId: string, characterId: string, outfit: Outfit): Promise<CharacterDNA> {
    const universe = await this.getOrCreateUniverse(seriesId);
    const existing = universe.characters[characterId];
    if (!existing) {
      throw new ValidationError(`Character "${characterId}" not found in series "${seriesId}"`);
    }

    if (existing.outfits.some((o) => o.id === outfit.id)) {
      throw new ValidationError(`Outfit with ID "${outfit.id}" already exists for character "${characterId}"`);
    }

    const updated: CharacterDNA = {
      ...existing,
      outfits: [...existing.outfits, outfit],
      updatedAt: new Date().toISOString(),
    };

    const validated = CharacterDNASchema.parse(updated);
    universe.characters[characterId] = validated;
    await this.saveUniverse(universe);
    return validated;
  }

  public async addLocation(
    seriesId: string,
    locData: Omit<LocationDNA, 'createdAt' | 'updatedAt'>
  ): Promise<LocationDNA> {
    const universe = await this.getOrCreateUniverse(seriesId);
    if (universe.locations[locData.id]) {
      throw new ValidationError(`Location "${locData.id}" already exists in series "${seriesId}"`);
    }

    const now = new Date().toISOString();
    const location: LocationDNA = {
      ...locData,
      seriesId,
      aliases: locData.aliases ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const validated = LocationDNASchema.parse(location);
    universe.locations[validated.id] = validated;
    await this.saveUniverse(universe);
    return validated;
  }

  public async addLocationZone(seriesId: string, locationId: string, zone: LocationZone): Promise<LocationDNA> {
    const universe = await this.getOrCreateUniverse(seriesId);
    const existing = universe.locations[locationId];
    if (!existing) {
      throw new ValidationError(`Location "${locationId}" not found in series "${seriesId}"`);
    }

    if (existing.zones.some((z) => z.id === zone.id)) {
      throw new ValidationError(`Zone "${zone.id}" already exists in location "${locationId}"`);
    }

    const updated: LocationDNA = {
      ...existing,
      zones: [...existing.zones, zone],
      updatedAt: new Date().toISOString(),
    };

    const validated = LocationDNASchema.parse(updated);
    universe.locations[locationId] = validated;
    await this.saveUniverse(universe);
    return validated;
  }

  public async addProp(seriesId: string, propData: PropDNA): Promise<PropDNA> {
    const universe = await this.getOrCreateUniverse(seriesId);
    if (universe.props[propData.id]) {
      throw new ValidationError(`Prop "${propData.id}" already exists in series "${seriesId}"`);
    }

    const validated = PropDNASchema.parse({
      ...propData,
      seriesId,
      aliases: propData.aliases ?? [],
    });
    universe.props[validated.id] = validated;
    await this.saveUniverse(universe);
    return validated;
  }

  public async addRelationship(seriesId: string, relationship: RelationshipDNA): Promise<void> {
    const universe = await this.getOrCreateUniverse(seriesId);
    const validated = RelationshipDNASchema.parse(relationship);
    universe.relationships.push(validated);
    await this.saveUniverse(universe);
  }

  public async lockCanonEntity(
    seriesId: string,
    entityType: 'character' | 'location' | 'prop',
    entityId: string
  ): Promise<void> {
    const universe = await this.getOrCreateUniverse(seriesId);
    if (entityType === 'character') {
      if (!universe.characters[entityId]) {
        throw new ValidationError(`Character "${entityId}" not found to lock into Canon`);
      }
      if (!universe.canonState.lockedCharacterIds.includes(entityId)) {
        universe.canonState.lockedCharacterIds.push(entityId);
      }
    } else if (entityType === 'location') {
      if (!universe.locations[entityId]) {
        throw new ValidationError(`Location "${entityId}" not found to lock into Canon`);
      }
      if (!universe.canonState.lockedLocationIds.includes(entityId)) {
        universe.canonState.lockedLocationIds.push(entityId);
      }
    } else if (entityType === 'prop') {
      if (!universe.props[entityId]) {
        throw new ValidationError(`Prop "${entityId}" not found to lock into Canon`);
      }
      if (!universe.canonState.lockedPropIds.includes(entityId)) {
        universe.canonState.lockedPropIds.push(entityId);
      }
    }
    universe.canonState.updatedAt = new Date().toISOString();
    await this.saveUniverse(universe);
  }

  public async exportUniverse(seriesId: string): Promise<UniverseExportBundle> {
    const universe = await this.getOrCreateUniverse(seriesId);
    const serialized = JSON.stringify(universe, null, 2);
    const checksum = this.storage.computeHash(serialized);

    const bundle: UniverseExportBundle = {
      schemaVersion: '1.0.0',
      seriesId,
      exportedAt: new Date().toISOString(),
      checksum,
      universe,
    };

    return UniverseExportBundleSchema.parse(bundle);
  }

  public async importUniverse(seriesId: string, bundle: UniverseExportBundle): Promise<Universe> {
    const validated = UniverseExportBundleSchema.parse(bundle);

    // Verify integrity checksum
    const serialized = JSON.stringify(validated.universe, null, 2);
    const computedChecksum = this.storage.computeHash(serialized);
    if (computedChecksum !== validated.checksum) {
      throw new ContinuityError(
        `Universe bundle checksum mismatch: expected ${validated.checksum}, got ${computedChecksum}`
      );
    }

    // Assign to seriesId namespace (preserving series isolation)
    const targetUniverse: Universe = {
      ...validated.universe,
      seriesId,
      updatedAt: new Date().toISOString(),
    };

    await this.saveUniverse(targetUniverse);
    return targetUniverse;
  }
}
