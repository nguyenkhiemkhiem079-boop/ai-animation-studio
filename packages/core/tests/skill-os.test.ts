import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  SkillRegistry,
  SkillRouter,
  SkillRegistryManifest
} from '../src/skill-os/index.js';

describe('Antigravity Skill OS', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const skillsDir = path.resolve(repoRoot, '.agents/skills');
  const registryJsonPath = path.resolve(skillsDir, 'registry.json');

  describe('SkillRegistry Real Manifest Validation', () => {
    it('should successfully load and validate the production registry.json', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const manifest = registry.getManifest();

      expect(manifest.skills.length).toBeGreaterThan(15);
      expect(manifest.externalSkills.length).toBeGreaterThanOrEqual(3);

      const validation = await registry.validate(skillsDir);
      if (!validation.valid) {
        console.error('Validation errors:', validation.errors);
      }
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should track external skills properly', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const external = registry.listExternalSkills();

      expect(external.map((e) => e.id)).toContain('hyperframes');
      expect(external.map((e) => e.id)).toContain('hyperframes-core');
      expect(external.map((e) => e.id)).toContain('hyperframes-animation');

      const hfSkill = registry.getSkill('hyperframes');
      expect(hfSkill).toBeDefined();
      expect((hfSkill as any).source).toBe('heygen-com/hyperframes');
      expect((hfSkill as any).type).toBe('EXTERNAL');
    });

    it('should filter skills by category', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const devSkills = registry.listSkills('development');
      expect(devSkills.length).toBeGreaterThanOrEqual(5);
      expect(devSkills.every((s) => s.category === 'development')).toBe(true);

      const qaSkills = registry.listSkills('qa');
      expect(qaSkills.length).toBeGreaterThanOrEqual(3);
      expect(qaSkills.every((s) => s.category === 'qa')).toBe(true);
    });
  });

  describe('SkillRegistry Error Detection', () => {
    it('should detect duplicate IDs', async () => {
      const invalidManifest: SkillRegistryManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'test',
        skills: [
          {
            id: 'dup-skill',
            name: 'Skill A',
            category: 'development',
            version: '1.0.0',
            description: 'desc',
            entryPoint: 'fake/path.md',
            dependencies: [],
            applicablePhases: [],
            status: 'ACTIVE'
          },
          {
            id: 'dup-skill',
            name: 'Skill B',
            category: 'development',
            version: '1.0.0',
            description: 'desc',
            entryPoint: 'fake/path2.md',
            dependencies: [],
            applicablePhases: [],
            status: 'ACTIVE'
          }
        ],
        externalSkills: []
      };

      const registry = SkillRegistry.fromJson(invalidManifest);
      const res = await registry.validate();
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
    });

    it('should detect missing dependencies', async () => {
      const invalidManifest: SkillRegistryManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'test',
        skills: [
          {
            id: 'skill-a',
            name: 'Skill A',
            category: 'story',
            version: '1.0.0',
            description: 'desc',
            entryPoint: 'fake/path.md',
            dependencies: ['non-existent-dep'],
            applicablePhases: [],
            status: 'ACTIVE'
          }
        ],
        externalSkills: []
      };

      const registry = SkillRegistry.fromJson(invalidManifest);
      const res = await registry.validate();
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.code === 'MISSING_DEPENDENCY')).toBe(true);
    });

    it('should detect circular dependencies', async () => {
      const cycleManifest: SkillRegistryManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'test',
        skills: [
          {
            id: 'cycle-a',
            name: 'Cycle A',
            category: 'directing',
            version: '1.0.0',
            description: 'desc',
            entryPoint: 'fake.md',
            dependencies: ['cycle-b'],
            applicablePhases: [],
            status: 'ACTIVE'
          },
          {
            id: 'cycle-b',
            name: 'Cycle B',
            category: 'directing',
            version: '1.0.0',
            description: 'desc',
            entryPoint: 'fake.md',
            dependencies: ['cycle-a'],
            applicablePhases: [],
            status: 'ACTIVE'
          }
        ],
        externalSkills: []
      };

      const registry = SkillRegistry.fromJson(cycleManifest);
      const res = await registry.validate();
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should detect missing entrypoint file', async () => {
      const missingEntryManifest: SkillRegistryManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'test',
        skills: [
          {
            id: 'missing-entry',
            name: 'Missing Entry',
            category: 'directing',
            version: '1.0.0',
            description: 'desc',
            entryPoint: 'non_existent_file.md',
            dependencies: [],
            applicablePhases: [],
            status: 'ACTIVE'
          }
        ],
        externalSkills: []
      };

      const registry = SkillRegistry.fromJson(missingEntryManifest);
      const res = await registry.validate(skillsDir);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.code === 'MISSING_ENTRYPOINT')).toBe(true);
    });
  });

  describe('SkillRouter Routing Accuracy', () => {
    it('routes "Check whether Minh stays visually consistent." to character-consistency and identity-qa', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('Check whether Minh stays visually consistent.');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('character-consistency');
      expect(recommendedIds).toContain('identity-qa');
      expect(match.primaryCategory).toBe('character');
    });

    it('routes "Create a slow push-in on the candle." to cinematography', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('Create a slow push-in on the candle.');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('cinematography');
      expect(match.primaryCategory).toBe('cinematic');
    });

    it('routes "Render this deterministic scene." to production-route and HyperFrames', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('Render this deterministic scene.');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);
      const externalIds = match.externalSkills.map((e) => e.id);

      expect(recommendedIds).toContain('production-route');
      expect(recommendedIds).toContain('hyperframes-production');
      expect(externalIds).toContain('hyperframes');
    });

    it('routes "Phase 4 feature development" to development workflow skills', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('Phase 4 feature development');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('repo-audit');
      expect(recommendedIds).toContain('architecture-review');
      expect(recommendedIds).toContain('implementation');
      expect(recommendedIds).toContain('testing');
      expect(recommendedIds).toContain('phase-gate');
      expect(match.primaryCategory).toBe('development');
    });
  });
});
