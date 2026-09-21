/**
 * CompositionDirector: Assigns visual balance, framing rules, and depth layers.
 */

import {
  CompositionIntent,
  CompositionIntentSchema,
  DirectorProfile,
  ShotPurpose,
} from '../../domain/director.js';

export class CompositionDirector {
  public static directComposition(options: {
    purpose: ShotPurpose;
    profile: DirectorProfile;
    subjectCount: number;
    locationId?: string;
  }): CompositionIntent {
    const { purpose, profile, subjectCount } = options;

    let rule: CompositionIntent['rule'] = profile.compositionBias;
    let subjectPlacement: CompositionIntent['subjectPlacement'] = 'center';

    if (rule === 'rule_of_thirds') {
      subjectPlacement = subjectCount > 1 ? 'center' : 'left_third';
    } else if (rule === 'symmetrical') {
      subjectPlacement = 'center';
    } else if (rule === 'tight_claustrophobic' || purpose === 'reaction') {
      rule = 'tight_claustrophobic';
      subjectPlacement = 'center';
    }

    const depthLayers = {
      foreground: purpose === 'establishing' ? ['fg_silhouettes'] : [],
      midground: ['subject_character_plane'],
      background: ['bg_environment_backdrop'],
    };

    return CompositionIntentSchema.parse({
      rule,
      subjectPlacement,
      depthLayers,
    });
  }
}
