import { describe, it, expect } from 'vitest';
import {
  CameraDirector,
  ActingDirector,
  CompositionDirector,
  LightingDirector,
  MotionDirector,
  TransitionDirector,
  DEFAULT_DIRECTOR_PROFILE,
} from '../src/index.js';

describe('Specialized Sub-Directors', () => {
  describe('CameraDirector', () => {
    it('selects appropriate shot sizes and angles for different purposes', () => {
      const estCamera = CameraDirector.directCamera({
        purpose: 'establishing',
        profile: DEFAULT_DIRECTOR_PROFILE,
      });
      expect(estCamera.shotSize).toBe('extreme_wide');
      expect(estCamera.focalLength).toBe('24mm');

      const reactCamera = CameraDirector.directCamera({
        purpose: 'reaction',
        profile: DEFAULT_DIRECTOR_PROFILE,
      });
      expect(reactCamera.shotSize).toBe('close_up');
      expect(reactCamera.semanticSkills).toContain('push_in');

      const climaxCamera = CameraDirector.directCamera({
        purpose: 'climax',
        profile: DEFAULT_DIRECTOR_PROFILE,
      });
      expect(climaxCamera.angle).toBe('dutch_angle');
      expect(climaxCamera.semanticSkills).toContain('orbit');
    });
  });

  describe('ActingDirector', () => {
    it('sets poses and matches conversational eyelines between two characters', () => {
      const acting = ActingDirector.directActing({
        characterIds: ['CHAR_A', 'CHAR_B'],
        purpose: 'dialogue_coverage',
        dialogue: {
          speaker: 'CHAR_A',
          line: 'Look closely at the wall.',
          sourceTrace: {
            documentId: 'd1',
            segmentIndex: 0,
            charStart: 0,
            charEnd: 10,
            contentHash: 'h',
          },
        },
        activeEyelineVector: 'screen_left',
      });

      expect(acting).toHaveLength(2);
      expect(acting[0].characterId).toBe('CHAR_A');
      expect(acting[0].dialogueLine).toBe('Look closely at the wall.');
      expect(acting[0].pose).toBe('speaking_engaged');
      expect(acting[0].gazeDirection).toBe('screen_right');

      expect(acting[1].characterId).toBe('CHAR_B');
      expect(acting[1].pose).toBe('listening_attentive');
      expect(acting[1].gazeDirection).toBe('screen_left');
    });
  });

  describe('CompositionDirector', () => {
    it('assigns depth layers and framing rules based on profile bias', () => {
      const comp = CompositionDirector.directComposition({
        purpose: 'establishing',
        profile: DEFAULT_DIRECTOR_PROFILE,
        subjectCount: 1,
      });

      expect(comp.rule).toBe('rule_of_thirds');
      expect(comp.depthLayers.foreground).toContain('fg_silhouettes');
      expect(comp.depthLayers.background).toContain('bg_environment_backdrop');
    });
  });

  describe('LightingDirector', () => {
    it('assigns chiaroscuro and cool temperature for night scenes', () => {
      const nightLight = LightingDirector.directLighting({
        purpose: 'establishing',
        timeOfDay: 'night',
      });

      expect(nightLight.colorTemperature).toBe('cool');
      expect(nightLight.mood).toBe('chiaroscuro');
      expect(nightLight.fogAtmosphere).toBe(true);

      const dawnLight = LightingDirector.directLighting({
        purpose: 'reveal',
        timeOfDay: 'dawn',
      });
      expect(dawnLight.colorTemperature).toBe('warm');
      expect(dawnLight.keyLightDirection).toBe('back');
    });
  });

  describe('MotionDirector', () => {
    it('routes static/parallax to deterministic hyperframes and high action to generative video', () => {
      const staticMotion = MotionDirector.directMotion({
        purpose: 'establishing',
        camera: {
          focalLength: '35mm',
          shotSize: 'wide',
          angle: 'eye_level',
          movement: 'static',
          semanticSkills: [],
        },
        characterCount: 0,
      });
      expect(staticMotion.complexity).toBe('static');
      expect(staticMotion.rendererIntent).toBe('deterministic_hyperframes');

      const pushInMotion = MotionDirector.directMotion({
        purpose: 'reaction',
        camera: {
          focalLength: '50mm',
          shotSize: 'close_up',
          angle: 'eye_level',
          movement: 'push_in',
          semanticSkills: ['push_in'],
        },
        characterCount: 1,
      });
      expect(pushInMotion.complexity).toBe('multi_layer_parallax');
      expect(pushInMotion.rendererIntent).toBe('deterministic_hyperframes');

      const actionMotion = MotionDirector.directMotion({
        purpose: 'action',
        camera: {
          focalLength: '35mm',
          shotSize: 'medium',
          angle: 'low_angle',
          movement: 'tracking',
          semanticSkills: ['tracking'],
        },
        characterCount: 2,
        hasHighAction: true,
      });
      expect(actionMotion.complexity).toBe('complex_generative_video');
      expect(actionMotion.rendererIntent).toBe('generative_full_video');
    });
  });

  describe('TransitionDirector', () => {
    it('directs cuts mid-scene and dissolves/fades at scene ends', () => {
      const midCut = TransitionDirector.directTransition({
        currentPurpose: 'dialogue_coverage',
        nextPurpose: 'reaction',
        isSceneEnd: false,
      });
      expect(midCut.type).toBe('cut');
      expect(midCut.durationSeconds).toBe(0);

      const sceneEnd = TransitionDirector.directTransition({
        currentPurpose: 'establishing',
        isSceneEnd: true,
      });
      expect(sceneEnd.type).toBe('dissolve');
      expect(sceneEnd.durationSeconds).toBe(0.8);
    });
  });
});
