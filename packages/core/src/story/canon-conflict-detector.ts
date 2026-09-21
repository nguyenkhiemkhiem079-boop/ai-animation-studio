/**
 * Canon Conflict Detector: Cross-references story candidates against persistent Universe Canon.
 */

import {
  CanonConflict,
  CanonConflictSchema,
  CharacterCandidate,
  LocationCandidate,
  PropCandidate,
  SceneCandidate,
} from '../domain/story.js';
import { Universe } from '../domain/universe.js';

export class CanonConflictDetector {
  /**
   * Identifies conflicts between extracted story candidates and existing canonical universe memory.
   */
  public static detectConflicts(
    universe: Universe,
    items: {
      characters?: CharacterCandidate[];
      locations?: LocationCandidate[];
      props?: PropCandidate[];
      scenes?: SceneCandidate[];
    }
  ): CanonConflict[] {
    const conflicts: CanonConflict[] = [];

    // 1. Character conflicts
    if (items.characters) {
      for (const charCandidate of items.characters) {
        // Find if this candidate matches an existing canonical character
        const matchedCanon = Object.values(universe.characters).find(
          (c) =>
            c.id === charCandidate.resolvedCanonId ||
            c.name.toLowerCase() === charCandidate.suggestedName.toLowerCase() ||
            c.aliases.some((a) => a.toLowerCase() === charCandidate.suggestedName.toLowerCase())
        );

        if (matchedCanon) {
          // Check if canon world facts mention this character is dead/destroyed
          const deadFact = universe.canonState.worldFacts.find(
            (f) =>
              f.toLowerCase().includes(matchedCanon.name.toLowerCase()) &&
              (f.toLowerCase().includes('dead') || f.toLowerCase().includes('deceased') || f.toLowerCase().includes('killed'))
          );

          if (deadFact) {
            conflicts.push({
              entityType: 'character',
              entityId: matchedCanon.id,
              description: `Character "${matchedCanon.name}" appears actively in story, but Canon world fact states: "${deadFact}"`,
              sourceTrace: charCandidate.sourceTrace[0],
              suggestedResolution: 'Verify if appearance is a flashback, ghost sequence, or canon resurrection.',
            });
          }
        }
      }
    }

    // 2. Prop conflicts
    if (items.props) {
      for (const propCandidate of items.props) {
        const matchedProp = Object.values(universe.props).find(
          (p) =>
            p.id === propCandidate.resolvedCanonId ||
            p.name.toLowerCase() === propCandidate.suggestedName.toLowerCase()
        );

        if (matchedProp) {
          // Check if prop was destroyed
          const destroyedFact = universe.canonState.worldFacts.find(
            (f) =>
              f.toLowerCase().includes(matchedProp.name.toLowerCase()) &&
              (f.toLowerCase().includes('destroyed') || f.toLowerCase().includes('lost forever'))
          );

          if (destroyedFact) {
            conflicts.push({
              entityType: 'prop',
              entityId: matchedProp.id,
              description: `Prop "${matchedProp.name}" is referenced in story, but Canon states: "${destroyedFact}"`,
              sourceTrace: propCandidate.sourceTrace[0],
              suggestedResolution: 'Confirm if prop is a replica or if scene takes place prior to destruction.',
            });
          }
        }
      }
    }

    // Validate with schema
    return conflicts.map((c) => CanonConflictSchema.parse(c));
  }
}
