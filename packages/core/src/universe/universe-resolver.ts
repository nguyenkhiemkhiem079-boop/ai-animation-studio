/**
 * UniverseResolver: Resolves story candidates against persistent series canon,
 * ensuring entity reuse, candidate isolation, and strict series boundaries.
 */

import { CharacterCandidate, LocationCandidate } from '../domain/story.js';
import { CharacterDNA, LocationDNA, PropDNA } from '../domain/universe.js';
import { UniverseManager } from './universe-manager.js';

export type ResolutionMatchType = 'exact_id' | 'name_match' | 'alias_match' | 'unresolved_candidate';

export interface EntityResolutionResult {
  resolved: boolean;
  canonId?: string;
  entityType: 'character' | 'location' | 'prop';
  matchType: ResolutionMatchType;
  confidence: number;
  matchedEntityName?: string;
  details?: string;
}

export class UniverseResolver {
  private universeManager: UniverseManager;

  constructor(universeManager: UniverseManager) {
    this.universeManager = universeManager;
  }

  private normalize(str: string): string {
    return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Resolves a character name or candidate against existing canonical characters in the series.
   */
  public async resolveCharacter(
    seriesId: string,
    query: string | CharacterCandidate
  ): Promise<EntityResolutionResult> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const queryString = typeof query === 'string' ? query : query.suggestedName;
    const queryNorm = this.normalize(queryString);

    // 1. Check exact ID match
    if (universe.characters[queryString]) {
      return {
        resolved: true,
        canonId: queryString,
        entityType: 'character',
        matchType: 'exact_id',
        confidence: 1.0,
        matchedEntityName: universe.characters[queryString].name,
      };
    }

    // 2. Check canonical names
    for (const char of Object.values(universe.characters)) {
      if (this.normalize(char.name) === queryNorm) {
        return {
          resolved: true,
          canonId: char.id,
          entityType: 'character',
          matchType: 'name_match',
          confidence: 0.95,
          matchedEntityName: char.name,
        };
      }
    }

    // 3. Check aliases
    for (const char of Object.values(universe.characters)) {
      if (char.aliases.some((alias) => this.normalize(alias) === queryNorm)) {
        return {
          resolved: true,
          canonId: char.id,
          entityType: 'character',
          matchType: 'alias_match',
          confidence: 0.85,
          matchedEntityName: char.name,
        };
      }
    }

    // Unresolved candidate (Candidate != Canon)
    return {
      resolved: false,
      entityType: 'character',
      matchType: 'unresolved_candidate',
      confidence: 0.0,
      details: `No canonical character found matching "${queryString}" in series "${seriesId}"`,
    };
  }

  /**
   * Resolves a location heading or candidate against existing canonical locations in the series.
   */
  public async resolveLocation(
    seriesId: string,
    query: string | LocationCandidate
  ): Promise<EntityResolutionResult> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const queryString = typeof query === 'string' ? query : query.suggestedName;
    const queryNorm = this.normalize(queryString);

    // 1. Check exact ID match
    if (universe.locations[queryString]) {
      return {
        resolved: true,
        canonId: queryString,
        entityType: 'location',
        matchType: 'exact_id',
        confidence: 1.0,
        matchedEntityName: universe.locations[queryString].name,
      };
    }

    // 2. Check canonical names
    for (const loc of Object.values(universe.locations)) {
      if (this.normalize(loc.name) === queryNorm) {
        return {
          resolved: true,
          canonId: loc.id,
          entityType: 'location',
          matchType: 'name_match',
          confidence: 0.95,
          matchedEntityName: loc.name,
        };
      }
    }

    // 3. Check aliases
    for (const loc of Object.values(universe.locations)) {
      if (loc.aliases.some((alias) => this.normalize(alias) === queryNorm)) {
        return {
          resolved: true,
          canonId: loc.id,
          entityType: 'location',
          matchType: 'alias_match',
          confidence: 0.85,
          matchedEntityName: loc.name,
        };
      }
    }

    return {
      resolved: false,
      entityType: 'location',
      matchType: 'unresolved_candidate',
      confidence: 0.0,
      details: `No canonical location found matching "${queryString}" in series "${seriesId}"`,
    };
  }

  /**
   * Resolves a prop name against existing canonical props in the series.
   */
  public async resolveProp(seriesId: string, queryString: string): Promise<EntityResolutionResult> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const queryNorm = this.normalize(queryString);

    if (universe.props[queryString]) {
      return {
        resolved: true,
        canonId: queryString,
        entityType: 'prop',
        matchType: 'exact_id',
        confidence: 1.0,
        matchedEntityName: universe.props[queryString].name,
      };
    }

    for (const prop of Object.values(universe.props)) {
      if (this.normalize(prop.name) === queryNorm) {
        return {
          resolved: true,
          canonId: prop.id,
          entityType: 'prop',
          matchType: 'name_match',
          confidence: 0.95,
          matchedEntityName: prop.name,
        };
      }
    }

    for (const prop of Object.values(universe.props)) {
      if (prop.aliases.some((alias) => this.normalize(alias) === queryNorm)) {
        return {
          resolved: true,
          canonId: prop.id,
          entityType: 'prop',
          matchType: 'alias_match',
          confidence: 0.85,
          matchedEntityName: prop.name,
        };
      }
    }

    return {
      resolved: false,
      entityType: 'prop',
      matchType: 'unresolved_candidate',
      confidence: 0.0,
    };
  }
}
