import { describe, it, expect } from 'vitest';
import { CinematicSkillRegistry, STANDARD_CINEMATIC_SKILLS } from '../src/index.js';

describe('CinematicSkill Registry', () => {
  it('loads standard semantic cinematic skills', () => {
    const registry = new CinematicSkillRegistry(true);
    expect(registry.list().length).toBeGreaterThanOrEqual(6);

    const pushIn = registry.get('push_in');
    expect(pushIn.name).toBe('Push In');
    expect(pushIn.category).toBe('camera_motion');
    expect(pushIn.semanticIntent).toContain('interiority');
    expect(pushIn.supportsDeterministic).toBe(true);

    const orbit = registry.get('orbit');
    expect(orbit.name).toBe('Orbit');
    expect(orbit.parameters).toHaveLength(2);
  });

  it('allows registering custom cinematic skills', () => {
    const registry = new CinematicSkillRegistry(false);
    expect(registry.list()).toHaveLength(0);

    registry.register({
      id: 'vertigo_dolly_zoom',
      name: 'Vertigo Dolly Zoom',
      category: 'lens_effect',
      description: 'Simultaneous forward dolly with optical zoom out.',
      semanticIntent: 'Creates sudden realization of profound vertigo or existential shock.',
      parameters: [],
      supportsDeterministic: true,
      supportsGenerative: true,
    });

    expect(registry.has('vertigo_dolly_zoom')).toBe(true);
    expect(registry.get('vertigo_dolly_zoom').name).toBe('Vertigo Dolly Zoom');
  });

  it('throws on non-existent skill lookup', () => {
    const registry = new CinematicSkillRegistry(true);
    expect(() => registry.get('non_existent_skill')).toThrow();
  });
});
