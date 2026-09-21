import { describe, it, expect } from 'vitest';
import {
  ShotPlanner,
  SceneCandidate,
  DEFAULT_DIRECTOR_PROFILE,
} from '../src/index.js';

describe('ShotPlanner Orchestrator', () => {
  const mockScene: SceneCandidate = {
    id: 'SCENE_01',
    sceneNumber: 1,
    heading: 'INT. POLICE ARCHIVES - NIGHT',
    timeOfDay: 'night',
    locationName: 'POLICE ARCHIVES',
    charactersPresent: ['MINH', 'LAN'],
    beats: [
      {
        id: 'BEAT_01',
        index: 0,
        summary: 'Minh and Lan inspect the classified case file',
        involvedCharacterIds: ['MINH', 'LAN'],
        sourceTrace: { documentId: 'd1', segmentIndex: 0, charStart: 0, charEnd: 10, contentHash: 'h' },
      },
    ],
    dialogueLines: [
      {
        speaker: 'MINH',
        line: 'Look at the date on this confession. It was signed three days before the arrest.',
        sourceTrace: { documentId: 'd1', segmentIndex: 0, charStart: 0, charEnd: 10, contentHash: 'h' },
      },
      {
        speaker: 'LAN',
        line: 'That means the evidence was planted from the start.',
        sourceTrace: { documentId: 'd1', segmentIndex: 0, charStart: 0, charEnd: 10, contentHash: 'h' },
      },
    ],
    narrationLines: [],
    sourceTrace: [{ documentId: 'd1', segmentIndex: 0, charStart: 0, charEnd: 50, contentHash: 'h' }],
  };

  it('plans a sequence of shots with opening, dialogue coverage, and transitions', () => {
    const planner = new ShotPlanner(DEFAULT_DIRECTOR_PROFILE);
    const { productionScene, dependencyGraph } = planner.planScene(mockScene, 'proj_test');

    expect(productionScene.shots.length).toBeGreaterThanOrEqual(3);

    // Shot 1 is opening/establishing
    expect(productionScene.shots[0].shotNumber).toBe(1);
    expect(productionScene.shots[0].purpose).toBe('establishing');
    expect(productionScene.shots[0].camera.shotSize).toBe('extreme_wide');

    // Subsequent shots are dialogue coverage
    const dialogueShots = productionScene.shots.filter((s) => s.purpose === 'dialogue_coverage');
    expect(dialogueShots.length).toBe(2);
    expect(dialogueShots[0].acting[0].characterId).toBe('MINH');
    expect(dialogueShots[1].acting[0].characterId).toBe('LAN');

    // Transitions
    expect(productionScene.shots[productionScene.shots.length - 1].transition.type).toBe('dissolve');

    // Dependency graph
    expect(dependencyGraph.entryShotIds).toEqual([productionScene.shots[0].id]);
    expect(dependencyGraph.terminalShotIds).toEqual([productionScene.shots[productionScene.shots.length - 1].id]);
  });
});
