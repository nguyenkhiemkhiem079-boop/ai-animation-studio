/**
 * TransitionDirector: Determines transition style and duration between sequential shots.
 */

import {
  TransitionIntent,
  TransitionIntentSchema,
  ShotPurpose,
} from '../../domain/director.js';

export class TransitionDirector {
  public static directTransition(options: {
    currentPurpose: ShotPurpose;
    nextPurpose?: ShotPurpose;
    isSceneEnd?: boolean;
  }): TransitionIntent {
    const { currentPurpose, nextPurpose, isSceneEnd = false } = options;

    if (isSceneEnd) {
      if (currentPurpose === 'climax') {
        return TransitionIntentSchema.parse({
          type: 'fade_to_black',
          durationSeconds: 1.0,
        });
      }
      return TransitionIntentSchema.parse({
        type: 'dissolve',
        durationSeconds: 0.8,
      });
    }

    if (currentPurpose === 'action' && nextPurpose === 'reaction') {
      return TransitionIntentSchema.parse({
        type: 'cut',
        durationSeconds: 0,
      });
    }

    if (currentPurpose === 'mood_insert') {
      return TransitionIntentSchema.parse({
        type: 'dissolve',
        durationSeconds: 0.5,
      });
    }

    return TransitionIntentSchema.parse({
      type: 'cut',
      durationSeconds: 0,
    });
  }
}
