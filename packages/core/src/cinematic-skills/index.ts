/**
 * CinematicSkill Registry and standard cinematic grammar definitions.
 */

import { CinematicSkill, CinematicSkillSchema } from '../domain/cinematic.js';
import { ValidationError } from '../errors/index.js';

export const STANDARD_CINEMATIC_SKILLS: CinematicSkill[] = [
  {
    id: 'push_in',
    name: 'Push In',
    category: 'camera_motion',
    description: 'Slow forward camera push toward the subject.',
    semanticIntent: 'Directs viewer focus into the character interiority, dread, or sudden realization.',
    parameters: [
      { name: 'speed', type: 'enum', description: 'Rate of push', defaultValue: 'slow', allowedValues: ['subtle', 'slow', 'medium', 'fast'] },
      { name: 'targetFraming', type: 'enum', description: 'Ending framing', defaultValue: 'close_up', allowedValues: ['medium', 'medium_close_up', 'close_up', 'extreme_close_up'] },
    ],
    supportsDeterministic: true,
    supportsGenerative: true,
  },
  {
    id: 'pull_out',
    name: 'Pull Out',
    category: 'camera_motion',
    description: 'Camera recedes backward away from the subject.',
    semanticIntent: 'Emphasizes loneliness, vulnerability, abandonment, or exposes environmental danger.',
    parameters: [
      { name: 'speed', type: 'enum', description: 'Rate of retreat', defaultValue: 'slow', allowedValues: ['slow', 'medium', 'fast'] },
      { name: 'revealSurroundings', type: 'boolean', description: 'Whether backdrop expands', defaultValue: true },
    ],
    supportsDeterministic: true,
    supportsGenerative: true,
  },
  {
    id: 'orbit',
    name: 'Orbit',
    category: 'camera_motion',
    description: 'Camera rotates around subject in a circle maintaining eye line.',
    semanticIntent: 'Creates disorientation, heroic confrontation, or panoramic suspense.',
    parameters: [
      { name: 'direction', type: 'enum', description: 'Rotation direction', defaultValue: 'clockwise', allowedValues: ['clockwise', 'counter_clockwise'] },
      { name: 'degrees', type: 'number', description: 'Angular sweep in degrees', defaultValue: 90, min: 15, max: 360 },
    ],
    supportsDeterministic: true,
    supportsGenerative: true,
  },
  {
    id: 'rack_focus',
    name: 'Rack Focus',
    category: 'lens_effect',
    description: 'Shifts focal plane between foreground and background elements.',
    semanticIntent: 'Transfers narrative emphasis and emotional tension from one subject to another.',
    parameters: [
      { name: 'shiftDirection', type: 'enum', description: 'Focus change direction', defaultValue: 'fg_to_bg', allowedValues: ['fg_to_bg', 'bg_to_fg'] },
      { name: 'durationSeconds', type: 'number', description: 'Transition time', defaultValue: 1.2, min: 0.2, max: 5.0 },
    ],
    supportsDeterministic: true,
    supportsGenerative: true,
  },
  {
    id: 'dutch_angle',
    name: 'Dutch Angle',
    category: 'composition',
    description: 'Camera is tilted off the horizontal axis.',
    semanticIntent: 'Signals psychological unbalance, moral decay, or imminent supernatural threat.',
    parameters: [
      { name: 'tiltDegrees', type: 'number', description: 'Angle of tilt', defaultValue: 15, min: 5, max: 45 },
      { name: 'tiltDirection', type: 'enum', description: 'Tilt direction', defaultValue: 'right', allowedValues: ['left', 'right'] },
    ],
    supportsDeterministic: true,
    supportsGenerative: true,
  },
  {
    id: 'handheld',
    name: 'Handheld Organic Drift',
    category: 'camera_motion',
    description: 'Natural micro-jitters and breathing motion mimicking a human operator.',
    semanticIntent: 'Imparts raw realism, suspense, and grounded documentary urgency.',
    parameters: [
      { name: 'intensity', type: 'enum', description: 'Jitter magnitude', defaultValue: 'subtle', allowedValues: ['subtle', 'medium', 'chaotic'] },
    ],
    supportsDeterministic: true,
    supportsGenerative: true,
  },
];

export class CinematicSkillRegistry {
  private skills = new Map<string, CinematicSkill>();

  constructor(loadDefaults = true) {
    if (loadDefaults) {
      for (const skill of STANDARD_CINEMATIC_SKILLS) {
        this.register(skill);
      }
    }
  }

  public register(skill: CinematicSkill): void {
    const validated = CinematicSkillSchema.parse(skill);
    this.skills.set(validated.id, validated);
  }

  public get(id: string): CinematicSkill {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new ValidationError(`Cinematic skill "${id}" is not registered`);
    }
    return skill;
  }

  public has(id: string): boolean {
    return this.skills.has(id);
  }

  public list(): CinematicSkill[] {
    return Array.from(this.skills.values());
  }

  public listByCategory(category: CinematicSkill['category']): CinematicSkill[] {
    return this.list().filter((s) => s.category === category);
  }
}

export const defaultCinematicSkills = new CinematicSkillRegistry();
