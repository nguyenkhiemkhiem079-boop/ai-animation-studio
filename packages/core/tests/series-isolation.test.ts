import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, UniverseManager, UniverseResolver } from '../src/index.js';

describe('Series Isolation Guarantees', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;
  let resolver: UniverseResolver;

  beforeEach(() => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
    resolver = new UniverseResolver(universeManager);
  });

  it('keeps universes completely isolated between two different series', async () => {
    const seriesA = 'series_cyberpunk';
    const seriesB = 'series_fantasy';

    // Register character in Series A
    await universeManager.addCharacter(seriesA, {
      id: 'CHAR_KAI_001',
      seriesId: seriesA,
      name: 'Kai',
      description: 'Cyborg street hacker',
      visualAnchorPrompt: 'Young man with glowing cybernetic eye and chrome jacket',
      traits: ['stealthy', 'cynical'],
    });

    // Register character in Series B with same or different ID
    await universeManager.addCharacter(seriesB, {
      id: 'CHAR_ELDRIN_001',
      seriesId: seriesB,
      name: 'Eldrin',
      description: 'Elven archer',
      visualAnchorPrompt: 'Tall elf with silver braided hair and wooden recurve bow',
      traits: ['noble', 'composed'],
    });

    const uniA = await universeManager.getOrCreateUniverse(seriesA);
    const uniB = await universeManager.getOrCreateUniverse(seriesB);

    // Assert Series A has Kai and NOT Eldrin
    expect(uniA.characters['CHAR_KAI_001']).toBeDefined();
    expect(uniA.characters['CHAR_ELDRIN_001']).toBeUndefined();

    // Assert Series B has Eldrin and NOT Kai
    expect(uniB.characters['CHAR_ELDRIN_001']).toBeDefined();
    expect(uniB.characters['CHAR_KAI_001']).toBeUndefined();

    // UniverseResolver in Series B must NOT resolve Kai from Series A
    const resolveKaiInSeriesB = await resolver.resolveCharacter(seriesB, 'Kai');
    expect(resolveKaiInSeriesB.resolved).toBe(false);
    expect(resolveKaiInSeriesB.matchType).toBe('unresolved_candidate');

    // UniverseResolver in Series A resolves Kai successfully
    const resolveKaiInSeriesA = await resolver.resolveCharacter(seriesA, 'Kai');
    expect(resolveKaiInSeriesA.resolved).toBe(true);
    expect(resolveKaiInSeriesA.canonId).toBe('CHAR_KAI_001');
  });
});
