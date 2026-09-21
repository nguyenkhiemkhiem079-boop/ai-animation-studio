/**
 * ActingDirector: Directs character staging, poses, facial expressions, and eyelines.
 */

import { ActingIntent, ActingIntentSchema, ShotPurpose } from '../../domain/director.js';
import { DialogueLine } from '../../domain/story.js';

export class ActingDirector {
  public static directActing(options: {
    characterIds: string[];
    purpose: ShotPurpose;
    dialogue?: DialogueLine;
    activeEyelineVector?: 'screen_left' | 'screen_right' | 'center';
  }): ActingIntent[] {
    const { characterIds, purpose, dialogue, activeEyelineVector = 'center' } = options;

    return characterIds.map((charId, idx) => {
      const isSpeaking = dialogue && dialogue.speaker.toUpperCase().includes(charId.toUpperCase());
      let pose = 'standing_neutral';
      let expression = 'neutral';
      let gazeDirection: ActingIntent['gazeDirection'] = 'screen_left';

      // Eyeline matching: Alternate screen_left and screen_right across speaking partners
      if (activeEyelineVector === 'screen_left') {
        gazeDirection = idx % 2 === 0 ? 'screen_right' : 'screen_left';
      } else if (activeEyelineVector === 'screen_right') {
        gazeDirection = idx % 2 === 0 ? 'screen_left' : 'screen_right';
      } else {
        gazeDirection = idx % 2 === 0 ? 'screen_right' : 'screen_left';
      }

      switch (purpose) {
        case 'dialogue_coverage':
          pose = isSpeaking ? 'speaking_engaged' : 'listening_attentive';
          expression = isSpeaking ? 'expressive_intense' : 'pensive';
          break;

        case 'reaction':
          pose = 'reactive_recoil';
          expression = 'shocked_fearful';
          break;

        case 'action':
          pose = 'motion_sprint';
          expression = 'strained_focus';
          break;

        case 'reveal':
          pose = 'frozen_realization';
          expression = 'wide_eyed_awe';
          break;

        case 'character_intro':
          pose = 'iconic_heroic_stance';
          expression = 'confident_calm';
          break;

        default:
          pose = 'standing_cautious';
          expression = 'guarded';
          break;
      }

      return ActingIntentSchema.parse({
        characterId: charId,
        pose,
        expression,
        gazeDirection,
        dialogueLine: isSpeaking ? dialogue.line : undefined,
      });
    });
  }
}
