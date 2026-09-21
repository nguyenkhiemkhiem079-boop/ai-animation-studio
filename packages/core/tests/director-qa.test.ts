import { describe, it, expect } from 'vitest';
import {
  DirectorQA,
  ProductionScene,
  ShotContract,
  ShotDependencyGraph,
  DEFAULT_DIRECTOR_PROFILE,
} from '../src/index.js';

describe('DirectorQA Engine', () => {
  const baseShot = (id: string, overrides: Partial<ShotContract> = {}): ShotContract => ({
    id,
    sceneId: 'SC_01',
    shotNumber: 1,
    purpose: 'dialogue_coverage',
    complexity: 'simple_transform',
    rendererIntent: 'deterministic_hyperframes',
    frame: { durationSeconds: 3.0, aspectRatio: '16:9', targetFps: 24 },
    camera: {
      focalLength: '50mm',
      shotSize: 'medium_close_up',
      angle: 'eye_level',
      movement: 'static',
      semanticSkills: [],
    },
    lighting: { keyLightDirection: 'front', mood: 'neutral', colorTemperature: 'neutral', fogAtmosphere: false },
    composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
    acting: [{ characterId: 'CHAR_MINH', pose: 'stand', expression: 'neutral', gazeDirection: 'screen_right' }],
    transition: { type: 'cut', durationSeconds: 0 },
    dependsOnShotIds: [],
    directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
    provenance: { decidedAt: new Date().toISOString() },
    ...overrides,
  });

  it('detects jump cuts when consecutive shots share identical character, size, and angle across a cut', () => {
    const shot1 = baseShot('sh_01', { shotNumber: 1, camera: { focalLength: '50mm', shotSize: 'close_up', angle: 'eye_level', movement: 'static', semanticSkills: [] } });
    const shot2 = baseShot('sh_02', { shotNumber: 2, camera: { focalLength: '50mm', shotSize: 'close_up', angle: 'eye_level', movement: 'static', semanticSkills: [] } });

    const scene: ProductionScene = {
      id: 'SC_01',
      projectId: 'p1',
      sceneNumber: 1,
      heading: 'INT. ROOM - DAY',
      purpose: 'dialogue',
      narrativeIntent: { dramaticGoal: 'Talk' },
      shots: [shot1, shot2],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const graph: ShotDependencyGraph = {
      sceneId: scene.id,
      adjacencyList: { sh_01: ['sh_02'], sh_02: [] },
      entryShotIds: ['sh_01'],
      terminalShotIds: ['sh_02'],
    };

    const qa = DirectorQA.evaluateScene(scene, graph, DEFAULT_DIRECTOR_PROFILE);
    expect(qa.jumpCutWarnings).toHaveLength(1);
    expect(qa.jumpCutWarnings[0].reason).toContain('Potential jump cut');
  });

  it('detects conversational eyeline mismatches', () => {
    // Both characters looking screen_right!
    const shot1 = baseShot('sh_01', {
      acting: [{ characterId: 'MINH', pose: 'speak', expression: 'neutral', gazeDirection: 'screen_right' }],
    });
    const shot2 = baseShot('sh_02', {
      acting: [{ characterId: 'LAN', pose: 'listen', expression: 'neutral', gazeDirection: 'screen_right' }],
    });

    const scene: ProductionScene = {
      id: 'SC_01',
      projectId: 'p1',
      sceneNumber: 1,
      heading: 'INT. ROOM - DAY',
      purpose: 'dialogue',
      narrativeIntent: { dramaticGoal: 'Talk' },
      shots: [shot1, shot2],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const graph: ShotDependencyGraph = {
      sceneId: scene.id,
      adjacencyList: { sh_01: ['sh_02'], sh_02: [] },
      entryShotIds: ['sh_01'],
      terminalShotIds: ['sh_02'],
    };

    const qa = DirectorQA.evaluateScene(scene, graph, DEFAULT_DIRECTOR_PROFILE);
    expect(qa.eyelineWarnings).toHaveLength(1);
    expect(qa.eyelineWarnings[0].reason).toContain('Eyeline mismatch');
  });

  it('detects circular dependencies in ShotDependencyGraph', () => {
    const shot1 = baseShot('sh_01');
    const shot2 = baseShot('sh_02');

    const scene: ProductionScene = {
      id: 'SC_01',
      projectId: 'p1',
      sceneNumber: 1,
      heading: 'INT. ROOM - DAY',
      purpose: 'dialogue',
      narrativeIntent: { dramaticGoal: 'Talk' },
      shots: [shot1, shot2],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Circular dependency: sh_01 -> sh_02 -> sh_01
    const cyclicGraph: ShotDependencyGraph = {
      sceneId: scene.id,
      adjacencyList: {
        sh_01: ['sh_02'],
        sh_02: ['sh_01'],
      },
      entryShotIds: ['sh_01'],
      terminalShotIds: ['sh_02'],
    };

    const qa = DirectorQA.evaluateScene(scene, cyclicGraph, DEFAULT_DIRECTOR_PROFILE);
    expect(qa.isValid).toBe(false);
    expect(qa.dependencyErrors).toContain('Circular dependency detected in ShotDependencyGraph');
  });
});
