import { describe, it, expect, beforeEach } from 'vitest';
import {
  SourceDocumentManager,
  RuleBasedStoryAnalyzer,
  ProviderStoryAnalyzer,
  MockProvider,
  MemoryStorage,
  UniverseManager,
} from '../src/index.js';

describe('Story Analyzers (Rule-Based and Provider-Based)', () => {
  const screenplay = `INT. OLD HOUSE - LIVING ROOM - NIGHT

Rain lashes against the window. An eerie chill fills the room.

MINH: Where is the amulet?
LAN: It is hidden behind the mirror.

EXT. DALAT FOREST - DAWN

MINH: We have to keep moving.`;

  let storage: MemoryStorage;
  let universeManager: UniverseManager;

  beforeEach(async () => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);

    // Setup canon in universe
    await universeManager.addCharacter('series_01', {
      id: 'CHAR_MINH_001',
      seriesId: 'series_01',
      name: 'Minh',
      description: 'Investigator',
      visualAnchorPrompt: 'Tired detective',
    });

    await universeManager.addLocation('series_01', {
      id: 'LOC_OLD_HOUSE_001',
      seriesId: 'series_01',
      name: 'Old House',
      description: 'Decaying estate',
    });
  });

  it('extracts scenes, dialogue, characters, locations, and beats with RuleBasedStoryAnalyzer', async () => {
    const doc = SourceDocumentManager.createSourceDocument('proj_01', 'Screenplay Sample', screenplay);
    const universe = await universeManager.getOrCreateUniverse('series_01');

    const analyzer = new RuleBasedStoryAnalyzer();
    const analysis = await analyzer.analyze(doc, universe);

    expect(analysis.sceneCandidates).toHaveLength(2);
    expect(analysis.sceneCandidates[0].heading).toContain('INT. OLD HOUSE');
    expect(analysis.sceneCandidates[0].timeOfDay).toBe('night');
    expect(analysis.sceneCandidates[1].timeOfDay).toBe('dawn');

    // Dialogue extraction
    expect(analysis.sceneCandidates[0].dialogueLines).toHaveLength(2);
    expect(analysis.sceneCandidates[0].dialogueLines[0].speaker).toBe('MINH');
    expect(analysis.sceneCandidates[0].dialogueLines[0].line).toBe('Where is the amulet?');

    // Character candidates
    const charNames = analysis.characterCandidates.map((c) => c.suggestedName);
    expect(charNames).toContain('MINH');
    expect(charNames).toContain('LAN');

    // Canon resolution: MINH resolved to CHAR_MINH_001, LAN remains unresolved candidate
    const minhCand = analysis.characterCandidates.find((c) => c.suggestedName === 'MINH')!;
    expect(minhCand.resolvedCanonId).toBe('CHAR_MINH_001');

    const lanCand = analysis.characterCandidates.find((c) => c.suggestedName === 'LAN')!;
    expect(lanCand.resolvedCanonId).toBeUndefined(); // Candidate != Canon!

    // Location candidates
    const locNames = analysis.locationCandidates.map((l) => l.suggestedName);
    expect(locNames).toContain('OLD HOUSE');
    expect(locNames).toContain('DALAT FOREST');

    // Prop candidates
    const propNames = analysis.propCandidates.map((p) => p.suggestedName);
    expect(propNames).toContain('amulet');
    expect(propNames).toContain('mirror');

    // Source coverage
    expect(analysis.coverage.coveragePercentage).toBeGreaterThan(50);
  });

  it('runs ProviderStoryAnalyzer with MockProvider and validates schema', async () => {
    const doc = SourceDocumentManager.createSourceDocument('proj_01', 'Test', 'Some content');
    const mock = new MockProvider({ id: 'llm-mock' });

    mock.setHandler('story_analysis', () => ({
      characterCandidates: [
        {
          candidateId: 'CAND_01',
          suggestedName: 'Hero',
          mentionCount: 1,
          traits: ['brave'],
          sourceTrace: [],
        },
      ],
      locationCandidates: [],
      propCandidates: [],
      relationshipCandidates: [],
      eventCandidates: [],
      sceneCandidates: [],
      canonConflicts: [],
    }));

    const providerAnalyzer = new ProviderStoryAnalyzer(mock);
    const analysis = await providerAnalyzer.analyze(doc);

    expect(analysis.characterCandidates).toHaveLength(1);
    expect(analysis.characterCandidates[0].suggestedName).toBe('Hero');
  });
});
