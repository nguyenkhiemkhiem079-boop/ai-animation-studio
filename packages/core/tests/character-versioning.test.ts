import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, UniverseManager } from '../src/index.js';

describe('Character DNA & Immutable Versioning', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
  });

  it('preserves Character v1 historical record when creating v2 and v3', async () => {
    const seriesId = 'series_hanoi_mystery';

    // 1. Initial character introduction (v1)
    const charV1 = await universeManager.addCharacter(seriesId, {
      id: 'CHAR_MINH_001',
      seriesId,
      name: 'Minh',
      description: 'Investigative journalist in early 30s',
      visualAnchorPrompt: 'Short black messy hair, tired brown eyes, worn leather coat',
      traits: ['tenacious', 'skeptical'],
      canonicalSheetAssetId: 'asset_minh_sheet_v1',
    });

    expect(charV1.currentVersion).toBe(1);
    expect(charV1.versions).toHaveLength(1);
    expect(charV1.versions[0].version).toBe(1);
    expect(charV1.versions[0].canonicalAssetIds).toEqual(['asset_minh_sheet_v1']);

    // Capture exact freeze of v1 state
    const originalV1Snapshot = JSON.parse(JSON.stringify(charV1.versions[0]));

    // 2. Character evolves in episode 3 (v2: scar over right eye, cut hair)
    const charV2 = await universeManager.createCharacterVersion(seriesId, 'CHAR_MINH_001', {
      summary: 'Post-interrogation look: shaved sides, fresh jagged scar over right eyebrow',
      visualChanges: 'Scar over right brow, bandaged left wrist',
      visualAnchorPrompt: 'Short faded undercut, jagged scar over right eyebrow, intense focused eyes, dark trenchcoat',
      canonicalAssetIds: ['asset_minh_sheet_v2'],
    });

    expect(charV2.currentVersion).toBe(2);
    expect(charV2.versions).toHaveLength(2);
    expect(charV2.visualAnchorPrompt).toContain('jagged scar');

    // CRITICAL: Verify v1 snapshot is 100% IDENTICAL to what it was initially (IMMUTABILITY GUARANTEE)
    expect(charV2.versions[0]).toEqual(originalV1Snapshot);
    expect(charV2.versions[0].version).toBe(1);
    expect(charV2.versions[0].canonicalAssetIds).toEqual(['asset_minh_sheet_v1']);

    // 3. Character evolves in season 2 (v3)
    const charV3 = await universeManager.createCharacterVersion(seriesId, 'CHAR_MINH_001', {
      summary: 'One year later, fully healed scar, longer hair tied in small topknot',
      canonicalAssetIds: ['asset_minh_sheet_v3'],
    });

    expect(charV3.currentVersion).toBe(3);
    expect(charV3.versions).toHaveLength(3);

    // Verify all historical versions remain frozen
    expect(charV3.versions[0]).toEqual(originalV1Snapshot);
    expect(charV3.versions[1].version).toBe(2);
    expect(charV3.versions[1].summary).toContain('Post-interrogation look');
    expect(charV3.versions[2].version).toBe(3);
  });

  it('allows adding outfits to character DNA', async () => {
    const seriesId = 'series_test';

    await universeManager.addCharacter(seriesId, {
      id: 'CHAR_LAN_001',
      seriesId,
      name: 'Lan',
      description: 'Botanist',
      visualAnchorPrompt: 'Woman in early 20s with floral embroidered blouse',
    });

    const updated = await universeManager.addOutfit(seriesId, 'CHAR_LAN_001', {
      id: 'outfit_rain_gear',
      name: 'Monsoon Rain Gear',
      description: 'Yellow hooded slicker with muddy boots',
      season: 'Season 1',
      referenceAssetIds: ['asset_slicker_01'],
    });

    expect(updated.outfits).toHaveLength(1);
    expect(updated.outfits[0].id).toBe('outfit_rain_gear');
  });
});
