import { describe, it, expect, beforeEach } from 'vitest';
import {
  CanonConflictDetector,
  MemoryStorage,
  UniverseManager,
} from '../src/index.js';

describe('CanonConflictDetector', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;
  const seriesId = 'series_conflict_test';

  beforeEach(async () => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);

    await universeManager.addCharacter(seriesId, {
      id: 'CHAR_VICTOR',
      seriesId,
      name: 'Victor',
      description: 'Fallen agent',
      visualAnchorPrompt: 'Grey suit',
    });

    await universeManager.addProp(seriesId, {
      id: 'PROP_SPEAR',
      seriesId,
      name: 'Sun Spear',
      description: 'Legendary weapon',
      visualPrompt: 'Golden spear',
      isCanonical: true,
      canonicalAssetIds: [],
    });

    const universe = await universeManager.getOrCreateUniverse(seriesId);
    universe.canonState.worldFacts = [
      'Victor was killed in the final battle of season 1',
      'The Sun Spear was destroyed during the eclipse',
    ];
    await universeManager.saveUniverse(universe);
  });

  it('detects character and prop conflicts against canonical facts', async () => {
    const universe = await universeManager.getOrCreateUniverse(seriesId);

    const conflicts = CanonConflictDetector.detectConflicts(universe, {
      characters: [
        {
          candidateId: 'C_VIC',
          suggestedName: 'Victor',
          mentionCount: 3,
          traits: ['active'],
          sourceTrace: [],
        },
      ],
      props: [
        {
          candidateId: 'C_SPEAR',
          suggestedName: 'Sun Spear',
          visualDescription: 'Golden spear in hand',
          sourceTrace: [],
        },
      ],
    });

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].entityType).toBe('character');
    expect(conflicts[0].description).toContain('Victor');
    expect(conflicts[0].description).toContain('killed');

    expect(conflicts[1].entityType).toBe('prop');
    expect(conflicts[1].description).toContain('Sun Spear');
    expect(conflicts[1].description).toContain('destroyed');
  });
});
