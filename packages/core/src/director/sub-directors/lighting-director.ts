/**
 * LightingDirector: Determines lighting mood, key light direction, and atmospheric presets.
 */

import { LightingIntent, LightingIntentSchema, ShotPurpose } from '../../domain/director.js';

export class LightingDirector {
  public static directLighting(options: {
    purpose: ShotPurpose;
    timeOfDay?: string;
    atmospherePrompt?: string;
  }): LightingIntent {
    const { purpose, timeOfDay = 'unspecified' } = options;

    let keyLightDirection: LightingIntent['keyLightDirection'] = 'front';
    let mood = 'neutral';
    let colorTemperature: LightingIntent['colorTemperature'] = 'neutral';
    let fogAtmosphere = false;

    if (timeOfDay === 'night') {
      keyLightDirection = 'left';
      mood = 'chiaroscuro';
      colorTemperature = 'cool';
      fogAtmosphere = true;
    } else if (timeOfDay === 'dawn' || timeOfDay === 'dusk') {
      keyLightDirection = 'back';
      mood = 'dramatic';
      colorTemperature = 'warm';
      fogAtmosphere = true;
    } else {
      keyLightDirection = 'front';
      mood = 'natural';
      colorTemperature = 'neutral';
    }

    if (purpose === 'reaction' || purpose === 'climax') {
      mood = 'tense_shadows';
      keyLightDirection = 'under';
    }

    return LightingIntentSchema.parse({
      keyLightDirection,
      mood,
      colorTemperature,
      fogAtmosphere,
    });
  }
}
