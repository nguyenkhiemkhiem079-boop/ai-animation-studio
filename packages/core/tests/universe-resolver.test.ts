import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, UniverseManager, UniverseResolver } from '../src/index.js';

describe('UniverseResolver', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;
  let resolver: UniverseResolver;
  const seriesId = 'series_detective';

  beforeEach(async () => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
    resolver = new UniverseResolver(universeManager);

    // Setup universe with canonical character, location, and prop
    await universeManager.addCharacter(seriesId, {
      id: 'CHAR_MINH_001',
      seriesId,
      name: 'Minh',
      aliases: ['Detective Minh', 'The Hound'],
      description: 'Senior investigator',
      visualAnchorPrompt: 'Tired detective in trench coat',
    });

    await universeManager.addLocation(seriesId, {
      id: 'LOC_OLD_HOUSE_001',
      seriesId,
      name: 'Old French House',
      aliases: ['The Haunted Villa', 'Old House'],
      description: 'A decaying colonial estate in Dalat',
      zones: [
        { id: 'living_room', name: 'Living Room', description: 'Dusty armchairs with antique mirror' },
        { id: 'funeral_room', name: 'Altar Room', description: 'Ancestral altar with incense bowls' },
      ],
    });

    await universeManager.addProp(seriesId, {
      id: 'PROP_AMULET_001',
      seriesId,
      name: 'Jade Serpent Amulet',
      aliases: ['The Green Pendant', 'Grandfather Amulet'],
      description: 'Carved jade with hairline fractures',
      visualPrompt: 'Emerald green circular pendant on worn hemp cord',
      isCanonical: true,
      canonicalAssetIds: [],
    });
  });

  it('resolves character by exact ID, canonical name, and aliases', async () => {
    // Exact ID
    const res1 = await resolver.resolveCharacter(seriesId, 'CHAR_MINH_001');
    expect(res1.resolved).toBe(true);
    expect(res1.canonId).toBe('CHAR_MINH_001');
    expect(res1.matchType).toBe('exact_id');

    // Canonical Name
    const res2 = await resolver.resolveCharacter(seriesId, 'Minh');
    expect(res2.resolved).toBe(true);
    expect(res2.canonId).toBe('CHAR_MINH_001');
    expect(res2.matchType).toBe('name_match');

    // Case-insensitive / whitespace
    const res3 = await resolver.resolveCharacter(seriesId, '  minh  ');
    expect(res3.resolved).toBe(true);
    expect(res3.canonId).toBe('CHAR_MINH_001');

    // Alias
    const res4 = await resolver.resolveCharacter(seriesId, 'Detective Minh');
    expect(res4.resolved).toBe(true);
    expect(res4.canonId).toBe('CHAR_MINH_001');
    expect(res4.matchType).toBe('alias_match');
  });

  it('treats unknown character mentions as unresolved candidate (Candidate != Canon)', async () => {
    const res = await resolver.resolveCharacter(seriesId, {
      candidateId: 'cand_stranger',
      suggestedName: 'Mysterious Stranger in Black',
      mentionCount: 2,
      traits: ['tall', 'masked'],
      sourceTrace: [],
    });

    expect(res.resolved).toBe(false);
    expect(res.canonId).toBeUndefined();
    expect(res.matchType).toBe('unresolved_candidate');
  });

  it('resolves location by name and alias', async () => {
    const res1 = await resolver.resolveLocation(seriesId, 'Old French House');
    expect(res1.resolved).toBe(true);
    expect(res1.canonId).toBe('LOC_OLD_HOUSE_001');

    const res2 = await resolver.resolveLocation(seriesId, 'The Haunted Villa');
    expect(res2.resolved).toBe(true);
    expect(res2.canonId).toBe('LOC_OLD_HOUSE_001');
    expect(res2.matchType).toBe('alias_match');
  });

  it('resolves prop by name and alias', async () => {
    const res1 = await resolver.resolveProp(seriesId, 'Jade Serpent Amulet');
    expect(res1.resolved).toBe(true);
    expect(res1.canonId).toBe('PROP_AMULET_001');

    const res2 = await resolver.resolveProp(seriesId, 'Grandfather Amulet');
    expect(res2.resolved).toBe(true);
    expect(res2.canonId).toBe('PROP_AMULET_001');
  });
});
