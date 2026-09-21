/**
 * CameraDirector: Assigns shot framing, focal length, angle, and semantic camera motion.
 */

import {
  CameraIntent,
  CameraIntentSchema,
  ShotPurpose,
  DirectorProfile,
} from '../../domain/director.js';
import { NarrativeBeat } from '../../domain/story.js';

export class CameraDirector {
  public static directCamera(options: {
    purpose: ShotPurpose;
    beat?: NarrativeBeat;
    profile: DirectorProfile;
    recentSkillsUsed?: string[];
  }): CameraIntent {
    const { purpose, beat, profile, recentSkillsUsed = [] } = options;

    let shotSize: CameraIntent['shotSize'] = 'medium';
    let angle: CameraIntent['angle'] = 'eye_level';
    let movement = 'static';
    let focalLength = profile.preferredFocalLengths[0] || '35mm';
    const semanticSkills: string[] = [];

    switch (purpose) {
      case 'establishing':
        shotSize = 'extreme_wide';
        angle = 'eye_level';
        movement = 'slow_pan';
        focalLength = '24mm';
        break;

      case 'character_intro':
        shotSize = 'medium_wide';
        angle = 'low_angle';
        movement = 'push_in';
        semanticSkills.push('push_in');
        focalLength = '35mm';
        break;

      case 'dialogue_coverage':
        shotSize = 'medium_close_up';
        angle = 'eye_level';
        movement = 'static';
        focalLength = '50mm';
        break;

      case 'reaction':
        shotSize = 'close_up';
        angle = 'eye_level';
        movement = 'push_in';
        semanticSkills.push('push_in');
        focalLength = '85mm';
        break;

      case 'action':
        shotSize = 'medium';
        angle = 'low_angle';
        movement = 'tracking';
        semanticSkills.push('tracking');
        focalLength = '35mm';
        break;

      case 'reveal':
        shotSize = 'wide';
        angle = 'high_angle';
        movement = 'pull_out';
        semanticSkills.push('pull_out');
        focalLength = '28mm';
        break;

      case 'mood_insert':
        shotSize = 'extreme_close_up';
        angle = 'eye_level';
        movement = 'static';
        focalLength = '85mm';
        break;

      case 'climax':
        shotSize = 'close_up';
        angle = 'dutch_angle';
        movement = 'orbit';
        semanticSkills.push('orbit');
        focalLength = '50mm';
        break;

      case 'transition':
        shotSize = 'wide';
        angle = 'eye_level';
        movement = 'pan_right';
        focalLength = '35mm';
        break;
    }

    // Check if the chosen skill was recently overused, switch to fallback
    if (semanticSkills.length > 0 && recentSkillsUsed.slice(-2).includes(semanticSkills[0])) {
      semanticSkills.length = 0;
      movement = 'static';
    }

    // Blend with director favorite skills if applicable
    if (semanticSkills.length === 0 && profile.favoriteSkills.length > 0 && Math.random() < 0.3) {
      const fav = profile.favoriteSkills[0];
      if (!recentSkillsUsed.slice(-2).includes(fav)) {
        semanticSkills.push(fav);
        movement = fav;
      }
    }

    return CameraIntentSchema.parse({
      focalLength,
      shotSize,
      angle,
      movement,
      semanticSkills,
    });
  }
}
