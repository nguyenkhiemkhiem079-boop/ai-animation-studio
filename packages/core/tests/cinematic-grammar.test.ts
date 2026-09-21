import { describe, it, expect } from 'vitest';
import {
  CinematicGrammarEngine,
  ShotContract,
  DEFAULT_DIRECTOR_PROFILE,
} from '../src/index.js';

describe('CinematicGrammarEngine', () => {
  const mockShot = (id: string, size: any, skill: string, duration: number): ShotContract => ({
    id,
    sceneId: 'SC_01',
    shotNumber: 1,
    purpose: 'dialogue_coverage',
    complexity: 'simple_transform',
    rendererIntent: 'deterministic_hyperframes',
    frame: { durationSeconds: duration, aspectRatio: '16:9', targetFps: 24 },
    camera: {
      focalLength: '50mm',
      shotSize: size,
      angle: 'eye_level',
      movement: skill,
      semanticSkills: skill !== 'static' ? [skill] : [],
    },
    lighting: { keyLightDirection: 'front', mood: 'neutral', colorTemperature: 'neutral', fogAtmosphere: false },
    composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
    acting: [{ characterId: 'C1', pose: 'stand', expression: 'neutral', gazeDirection: 'screen_right' }],
    transition: { type: 'cut', durationSeconds: 0 },
    dependsOnShotIds: [],
    directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
    provenance: { decidedAt: new Date().toISOString() },
  });

  it('detects 3 or more consecutive repetitions of identical shot size or skill', () => {
    const shots: ShotContract[] = [
      mockShot('s1', 'close_up', 'push_in', 3.0),
      mockShot('s2', 'close_up', 'push_in', 3.0),
      mockShot('s3', 'close_up', 'push_in', 3.0),
      mockShot('s4', 'wide', 'static', 4.0),
    ];

    const warnings = CinematicGrammarEngine.detectRepetitions(shots);
    expect(warnings.length).toBeGreaterThanOrEqual(2);

    const sizeWarn = warnings.find((w) => w.skillOrSize.includes('shotSize:close_up'));
    expect(sizeWarn).toBeDefined();
    expect(sizeWarn?.consecutiveCount).toBe(3);

    const skillWarn = warnings.find((w) => w.skillOrSize.includes('skill:push_in'));
    expect(skillWarn).toBeDefined();
    expect(skillWarn?.consecutiveCount).toBe(3);
  });

  it('calculates average shot duration and classifies pacing curve accurately', () => {
    // Deliberate pacing: ~3.5s
    const deliberateShots = [
      mockShot('s1', 'wide', 'static', 3.5),
      mockShot('s2', 'medium', 'static', 4.0),
      mockShot('s3', 'close_up', 'static', 3.0),
    ];
    const deliberateRhythm = CinematicGrammarEngine.calculateRhythm(deliberateShots, DEFAULT_DIRECTOR_PROFILE);
    expect(deliberateRhythm.averageShotDurationSeconds).toBe(3.5);
    expect(deliberateRhythm.pacingCurve).toBe('deliberate');

    // Frenetic pacing: <1.5s
    const freneticShots = [
      mockShot('s1', 'wide', 'static', 1.0),
      mockShot('s2', 'medium', 'static', 1.2),
      mockShot('s3', 'close_up', 'static', 0.8),
    ];
    const freneticRhythm = CinematicGrammarEngine.calculateRhythm(freneticShots, DEFAULT_DIRECTOR_PROFILE);
    expect(freneticRhythm.pacingCurve).toBe('frenetic');
  });
});
