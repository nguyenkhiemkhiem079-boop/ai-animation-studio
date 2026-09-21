/**
 * MotionDirector: Evaluates movement dynamics, shot complexity, and determines renderer routing intent.
 */

import {
  RendererIntent,
  ShotComplexity,
  ShotPurpose,
  CameraIntent,
} from '../../domain/director.js';

export class MotionDirector {
  public static directMotion(options: {
    purpose: ShotPurpose;
    camera: CameraIntent;
    characterCount: number;
    hasHighAction?: boolean;
  }): { complexity: ShotComplexity; rendererIntent: RendererIntent } {
    const { purpose, camera, characterCount, hasHighAction = false } = options;

    // 1. High dynamic action or complex fluid/organic camera maneuvers
    if (hasHighAction || purpose === 'action' || purpose === 'climax') {
      return {
        complexity: 'complex_generative_video',
        rendererIntent: 'generative_full_video',
      };
    }

    // 2. Character dialogue with gestures or walking
    if (characterCount > 0 && (purpose === 'dialogue_coverage' || purpose === 'character_intro')) {
      return {
        complexity: 'rigged_character_action',
        rendererIntent: 'deterministic_rigged_2d',
      };
    }

    // 3. Multi-layer parallax movement
    if (camera.movement === 'push_in' || camera.movement === 'pull_out' || camera.movement === 'tracking') {
      return {
        complexity: 'multi_layer_parallax',
        rendererIntent: 'deterministic_hyperframes',
      };
    }

    // 4. Simple camera transform
    if (camera.movement !== 'static') {
      return {
        complexity: 'simple_transform',
        rendererIntent: 'deterministic_hyperframes',
      };
    }

    // 5. Static shot
    return {
      complexity: 'static',
      rendererIntent: 'deterministic_hyperframes',
    };
  }
}
