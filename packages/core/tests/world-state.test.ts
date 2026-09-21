import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, UniverseManager, WorldStateTracker, ContinuityError } from '../src/index.js';

describe('WorldState & Continuity Tracking', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;
  let stateTracker: WorldStateTracker;
  const seriesId = 'series_haunted_estate';

  beforeEach(async () => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
    stateTracker = new WorldStateTracker(universeManager);

    await universeManager.addCharacter(seriesId, {
      id: 'CHAR_MINH',
      seriesId,
      name: 'Minh',
      description: 'Protagonist',
      visualAnchorPrompt: 'Trenchcoat man',
    });

    await universeManager.addLocation(seriesId, {
      id: 'LOC_MANSION',
      seriesId,
      name: 'Old Mansion',
      description: 'Colonial estate',
      zones: [
        { id: 'living_room', name: 'Living Room', description: 'Dusty salon' },
        { id: 'altar_room', name: 'Altar Room', description: 'Ancestral altar' },
      ],
    });

    await universeManager.addProp(seriesId, {
      id: 'PROP_KEY',
      seriesId,
      name: 'Rusted Key',
      description: 'Key to the cellar',
      visualPrompt: 'Heavy iron skeleton key',
      isCanonical: true,
      canonicalAssetIds: [],
    });
  });

  it('applies state transitions and updates character location and prop holders', async () => {
    const updatedState = await stateTracker.applyTransition(seriesId, {
      trigger: 'Minh enters the living room and picks up the rusted key from the table',
      episodeId: 'EP_01',
      sceneId: 'SC_02',
      changes: {
        characterMovements: [
          {
            characterId: 'CHAR_MINH',
            toLocationId: 'LOC_MANSION',
            toZoneId: 'living_room',
          },
        ],
        propTransfers: [
          {
            propId: 'PROP_KEY',
            toHolder: 'CHAR_MINH',
          },
        ],
        factsAdded: ['Minh now possesses the cellar key', 'Front door is locked behind him'],
        factsRemoved: [],
      },
    });

    expect(updatedState.characterLocations['CHAR_MINH'].locationId).toBe('LOC_MANSION');
    expect(updatedState.characterLocations['CHAR_MINH'].zoneId).toBe('living_room');
    expect(updatedState.propHolders['PROP_KEY']).toBe('CHAR_MINH');
    expect(updatedState.worldFacts).toContain('Minh now possesses the cellar key');
  });

  it('rejects invalid state transitions that violate continuity constraints', async () => {
    // Attempt to move non-existent character
    await expect(
      stateTracker.applyTransition(seriesId, {
        trigger: 'Ghost appears in nowhere',
        changes: {
          characterMovements: [
            {
              characterId: 'NON_EXISTENT_CHAR',
              toLocationId: 'LOC_MANSION',
            },
          ],
          propTransfers: [],
          factsAdded: [],
          factsRemoved: [],
        },
      })
    ).rejects.toThrow(ContinuityError);

    // Attempt to move character to non-existent zone
    await expect(
      stateTracker.applyTransition(seriesId, {
        trigger: 'Minh enters secret laboratory',
        changes: {
          characterMovements: [
            {
              characterId: 'CHAR_MINH',
              toLocationId: 'LOC_MANSION',
              toZoneId: 'secret_lab_non_existent',
            },
          ],
          propTransfers: [],
          factsAdded: [],
          factsRemoved: [],
        },
      })
    ).rejects.toThrow(ContinuityError);
  });

  it('captures immutable continuity snapshots across episode milestones', async () => {
    await stateTracker.applyTransition(seriesId, {
      trigger: 'Minh reaches the altar room',
      changes: {
        characterMovements: [
          {
            characterId: 'CHAR_MINH',
            toLocationId: 'LOC_MANSION',
            toZoneId: 'altar_room',
          },
        ],
        propTransfers: [],
        factsAdded: ['Altar candles are burning'],
        factsRemoved: [],
      },
    });

    const snapshot = await stateTracker.createContinuitySnapshot(seriesId, {
      snapshotId: 'snap_ep01_cliffhanger',
      episodeId: 'EP_01',
      sceneId: 'SC_FINAL',
      notes: 'End of Episode 1 cliffhanger state',
    });

    expect(snapshot.id).toBe('snap_ep01_cliffhanger');
    expect(snapshot.worldState.characterLocations['CHAR_MINH'].zoneId).toBe('altar_room');

    const universe = await universeManager.getOrCreateUniverse(seriesId);
    expect(universe.history).toHaveLength(1);
    expect(universe.history[0].id).toBe('snap_ep01_cliffhanger');
  });
});
