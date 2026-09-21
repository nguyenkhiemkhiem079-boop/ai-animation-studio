/**
 * WorldStateTracker: Manages dynamic state, state transitions, continuity snapshots,
 * and continuity rule validation for AI Animation Studio.
 */

import {
  WorldState,
  WorldStateSchema,
  StateTransition,
  StateTransitionSchema,
  ContinuitySnapshot,
  ContinuitySnapshotSchema,
  Universe,
} from '../domain/universe.js';
import { ContinuityError } from '../errors/index.js';
import { UniverseManager } from './universe-manager.js';

export class WorldStateTracker {
  private universeManager: UniverseManager;

  constructor(universeManager: UniverseManager) {
    this.universeManager = universeManager;
  }

  public async getCurrentWorldState(seriesId: string): Promise<WorldState> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    return universe.currentWorldState;
  }

  /**
   * Applies a state transition to the series universe, updating world state and recording history.
   */
  public async applyTransition(seriesId: string, transitionData: Omit<StateTransition, 'id' | 'timestamp'> & { id?: string }): Promise<WorldState> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);

    const now = new Date().toISOString();
    const transition: StateTransition = {
      id: transitionData.id ?? `trans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      trigger: transitionData.trigger,
      episodeId: transitionData.episodeId,
      sceneId: transitionData.sceneId,
      changes: transitionData.changes,
    };

    const validatedTransition = StateTransitionSchema.parse(transition);

    // Deep copy current world state to apply updates cleanly
    const nextState: WorldState = {
      timestamp: now,
      episodeId: transitionData.episodeId ?? universe.currentWorldState.episodeId,
      sceneId: transitionData.sceneId ?? universe.currentWorldState.sceneId,
      characterLocations: { ...universe.currentWorldState.characterLocations },
      propHolders: { ...universe.currentWorldState.propHolders },
      worldFacts: [...universe.currentWorldState.worldFacts],
    };

    // 1. Apply character movements
    for (const move of validatedTransition.changes.characterMovements) {
      if (!universe.characters[move.characterId]) {
        throw new ContinuityError(
          `Cannot transition character "${move.characterId}": not found in universe for series "${seriesId}"`
        );
      }
      if (!universe.locations[move.toLocationId]) {
        throw new ContinuityError(
          `Cannot move character to location "${move.toLocationId}": location not found in universe`
        );
      }
      if (move.toZoneId) {
        const targetLoc = universe.locations[move.toLocationId];
        const hasZone = targetLoc.zones.some((z) => z.id === move.toZoneId);
        if (!hasZone) {
          throw new ContinuityError(
            `Zone "${move.toZoneId}" not found in location "${move.toLocationId}"`
          );
        }
      }

      nextState.characterLocations[move.characterId] = {
        locationId: move.toLocationId,
        zoneId: move.toZoneId,
        status: 'active',
      };
    }

    // 2. Apply prop transfers
    for (const transfer of validatedTransition.changes.propTransfers) {
      if (!universe.props[transfer.propId]) {
        throw new ContinuityError(
          `Cannot transfer prop "${transfer.propId}": prop not found in universe`
        );
      }
      // target holder can be a character or a location
      const isChar = !!universe.characters[transfer.toHolder];
      const isLoc = !!universe.locations[transfer.toHolder];
      if (!isChar && !isLoc) {
        throw new ContinuityError(
          `Target prop holder "${transfer.toHolder}" must be a known character or location`
        );
      }

      nextState.propHolders[transfer.propId] = transfer.toHolder;
    }

    // 3. Apply world facts
    for (const fact of validatedTransition.changes.factsAdded) {
      if (!nextState.worldFacts.includes(fact)) {
        nextState.worldFacts.push(fact);
      }
    }
    for (const fact of validatedTransition.changes.factsRemoved) {
      nextState.worldFacts = nextState.worldFacts.filter((f) => f !== fact);
    }

    const validatedNextState = WorldStateSchema.parse(nextState);

    universe.currentWorldState = validatedNextState;
    universe.transitions.push(validatedTransition);
    await this.universeManager.saveUniverse(universe);

    return validatedNextState;
  }

  /**
   * Captures an immutable continuity snapshot at a key milestone (e.g. end of scene or episode).
   */
  public async createContinuitySnapshot(
    seriesId: string,
    options: {
      snapshotId?: string;
      episodeId?: string;
      sceneId?: string;
      notes?: string;
    } = {}
  ): Promise<ContinuitySnapshot> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const now = new Date().toISOString();

    const snapshot: ContinuitySnapshot = {
      id: options.snapshotId ?? `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      seriesId,
      timestamp: now,
      episodeId: options.episodeId ?? universe.currentWorldState.episodeId,
      sceneId: options.sceneId ?? universe.currentWorldState.sceneId,
      worldState: { ...universe.currentWorldState },
      notes: options.notes,
    };

    const validated = ContinuitySnapshotSchema.parse(snapshot);
    universe.history.push(validated);
    await this.universeManager.saveUniverse(universe);

    return validated;
  }
}
