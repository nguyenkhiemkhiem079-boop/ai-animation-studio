/**
 * DirectorQA: Analyzes planned shot sequences for jump cuts, eyeline mismatches,
 * skill/framing repetition, circular dependencies, and pacing rhythm.
 */

import {
  ProductionScene,
  ShotContract,
  ShotDependencyGraph,
  DirectorProfile,
  DirectorQAReport,
  DirectorQAReportSchema,
} from '../domain/director.js';
import { CinematicGrammarEngine } from './cinematic-grammar-engine.js';
import { DEFAULT_DIRECTOR_PROFILE } from './shot-planner.js';

export class DirectorQA {
  public static evaluateScene(
    scene: ProductionScene,
    dependencyGraph: ShotDependencyGraph,
    profile: DirectorProfile = DEFAULT_DIRECTOR_PROFILE
  ): DirectorQAReport {
    const shots = scene.shots;
    const jumpCutWarnings: DirectorQAReport['jumpCutWarnings'] = [];
    const eyelineWarnings: DirectorQAReport['eyelineWarnings'] = [];
    const dependencyErrors: string[] = [];

    // 1. Jump cut detection
    for (let i = 0; i < shots.length - 1; i++) {
      const shotA = shots[i];
      const shotB = shots[i + 1];

      // If both shots feature the same single character
      const charA = shotA.acting[0]?.characterId;
      const charB = shotB.acting[0]?.characterId;

      if (charA && charB && charA === charB && shotA.acting.length === 1 && shotB.acting.length === 1) {
        // Same character, same shot size, same camera angle across hard cut
        if (
          shotA.camera.shotSize === shotB.camera.shotSize &&
          shotA.camera.angle === shotB.camera.angle &&
          shotA.transition.type === 'cut'
        ) {
          jumpCutWarnings.push({
            shotAId: shotA.id,
            shotBId: shotB.id,
            reason: `Potential jump cut: consecutive shots of "${charA}" share identical size (${shotA.camera.shotSize}) and angle (${shotA.camera.angle}) without change in axis`,
          });
        }
      }
    }

    // 2. Eyeline mismatch detection
    for (let i = 0; i < shots.length - 1; i++) {
      const shotA = shots[i];
      const shotB = shots[i + 1];

      if (shotA.purpose === 'dialogue_coverage' && shotB.purpose === 'dialogue_coverage') {
        const charA = shotA.acting[0];
        const charB = shotB.acting[0];
        if (charA && charB && charA.characterId !== charB.characterId) {
          // If both characters look in the exact same direction, they appear not to be looking at each other
          if (
            (charA.gazeDirection === 'screen_left' && charB.gazeDirection === 'screen_left') ||
            (charA.gazeDirection === 'screen_right' && charB.gazeDirection === 'screen_right')
          ) {
            eyelineWarnings.push({
              shotAId: shotA.id,
              shotBId: shotB.id,
              reason: `Eyeline mismatch: "${charA.characterId}" and "${charB.characterId}" are both looking ${charA.gazeDirection}, violating cross-shot conversational eyelines`,
            });
          }
        }
      }
    }

    // 3. Repetition detection
    const repetitionWarnings = CinematicGrammarEngine.detectRepetitions(shots);

    // 4. Dependency cycle detection in graph
    if (this.hasCycle(dependencyGraph.adjacencyList)) {
      dependencyErrors.push('Circular dependency detected in ShotDependencyGraph');
    }

    // 5. Rhythm calculation
    const rhythmSummary = CinematicGrammarEngine.calculateRhythm(shots, profile);

    const report: DirectorQAReport = {
      isValid: dependencyErrors.length === 0,
      jumpCutWarnings,
      eyelineWarnings,
      repetitionWarnings,
      dependencyErrors,
      rhythmSummary,
    };

    return DirectorQAReportSchema.parse(report);
  }

  private static hasCycle(adjacencyList: Record<string, string[]>): boolean {
    const visited: Record<string, boolean> = {};
    const recStack: Record<string, boolean> = {};

    const dfs = (node: string): boolean => {
      visited[node] = true;
      recStack[node] = true;

      const neighbors = adjacencyList[node] || [];
      for (const neighbor of neighbors) {
        if (!visited[neighbor]) {
          if (dfs(neighbor)) return true;
        } else if (recStack[neighbor]) {
          return true;
        }
      }

      recStack[node] = false;
      return false;
    };

    for (const node of Object.keys(adjacencyList)) {
      if (!visited[node]) {
        if (dfs(node)) return true;
      }
    }

    return false;
  }
}
