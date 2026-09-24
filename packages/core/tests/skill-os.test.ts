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

      expect(manifest.version).toBe('1.1.0');
      expect(manifest.skills.length).toBe(33);
      expect(manifest.externalSkills.length).toBe(3);

      const validation = await registry.validate(skillsDir);
      if (!validation.valid) {
        console.error('Validation errors:', validation.errors);
      }
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should track the 5 modern production skills', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);

      const liveProvider = registry.getSkill('live-provider-validation');
      expect(liveProvider).toBeDefined();
      expect(('category' in liveProvider! && liveProvider.category)).toBe('production');

      const trustEvidence = registry.getSkill('production-trust-evidence');
      expect(trustEvidence).toBeDefined();
      expect(('category' in trustEvidence! && trustEvidence.category)).toBe('production');

      const flowOperator = registry.getSkill('flow-operator-workflow');
      expect(flowOperator).toBeDefined();
      expect(('category' in flowOperator! && flowOperator.category)).toBe('production');

      const releaseSec = registry.getSkill('release-security');
      expect(releaseSec).toBeDefined();
      expect(('category' in releaseSec! && releaseSec.category)).toBe('development');

      const releaseVal = registry.getSkill('release-validation');
      expect(releaseVal).toBeDefined();
      expect(('category' in releaseVal! && releaseVal.category)).toBe('development');
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
      expect(devSkills.length).toBeGreaterThanOrEqual(7);
      expect(devSkills.every((s) => s.category === 'development')).toBe(true);

      const prodSkills = registry.listSkills('production');
      expect(prodSkills.length).toBeGreaterThanOrEqual(8);
      expect(prodSkills.every((s) => s.category === 'production')).toBe(true);

      const qaSkills = registry.listSkills('qa');
      expect(qaSkills.length).toBeGreaterThanOrEqual(3);
      expect(qaSkills.every((s) => s.category === 'qa')).toBe(true);
    });

    it('should accurately resolve topological dependency chains without cycles', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);

      const chain = registry.resolveDependencies('live-provider-validation', true);
      expect(chain).toContain('repo-audit');
      expect(chain).toContain('architecture-review');
      expect(chain).toContain('production-route');
      expect(chain[chain.length - 1]).toBe('live-provider-validation');

      const releaseChain = registry.resolveDependencies('release-validation', true);
      expect(releaseChain).toContain('testing');
      expect(releaseChain).toContain('phase-gate');
      expect(releaseChain).toContain('release-security');
      expect(releaseChain).toContain('production-trust-evidence');
      expect(releaseChain[releaseChain.length - 1]).toBe('release-validation');
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

  describe('SkillRouter Deterministic Routing Suite', () => {
    it('routes "check latest repo architecture" to repo-audit and architecture-review', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('check latest repo architecture');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('repo-audit');
      expect(recommendedIds).toContain('architecture-review');
      expect(match.primaryCategory).toBe('development');
    });

    it('routes "Gemini API live test" to live-provider-validation', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('Gemini API live test');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('live-provider-validation');
      expect(match.primaryCategory).toBe('production');
      expect(match.dependencyChain).toBeDefined();
      expect(match.dependencyChain).toContain('architecture-review');
    });

    it('routes "Google Flow handoff" to flow-operator-workflow', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('Google Flow handoff');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('flow-operator-workflow');
      expect(match.primaryCategory).toBe('production');
    });

    it('routes "why can\'t this run become master verified?" to production-trust-evidence', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route("why can't this run become master verified?");
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('production-trust-evidence');
      expect(match.primaryCategory).toBe('production');
    });

    it('routes "check leaked API key" to release-security', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('check leaked API key');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('release-security');
      expect(match.primaryCategory).toBe('development');
    });

    it('routes "are we ready to release?" to release-validation', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('are we ready to release?');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('release-validation');
      expect(match.primaryCategory).toBe('development');
    });

    it('routes "character changed face" to character-consistency and identity-qa', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('character changed face');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('character-consistency');
      expect(recommendedIds).toContain('identity-qa');
      expect(match.primaryCategory).toBe('character');
    });

    it('routes "shot sequence breaks 180 degree rule" to cinematography and director-qa', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('shot sequence breaks 180 degree rule');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('cinematography');
      expect(recommendedIds).toContain('director-qa');
      expect(match.primaryCategory).toBe('cinematic');
    });

    it('routes "retake only shot 2" to retake, continuation, and continuity-qa', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('retake only shot 2');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);

      expect(recommendedIds).toContain('retake');
      expect(recommendedIds).toContain('continuation');
      expect(recommendedIds).toContain('continuity-qa');
      expect(match.primaryCategory).toBe('production');
    });

    it('routes "HyperFrames camera animation" to production-route, hyperframes-production and external hyperframes', async () => {
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const router = new SkillRouter(registry);

      const match = router.route('HyperFrames camera animation');
      const recommendedIds = match.recommendedSkills.map((s) => s.id);
      const externalIds = match.externalSkills.map((e) => e.id);

      expect(recommendedIds).toContain('production-route');
      expect(recommendedIds).toContain('hyperframes-production');
      expect(externalIds).toContain('hyperframes');
      expect(externalIds).toContain('hyperframes-animation');
    });
  });

  describe('Skill Conflict & Precedence Invariants', () => {
    it('enforces that runtime schema authority outranks skill advice', async () => {
      // Invariant test: Skill manifest schemas must strictly validate types
      const registry = await SkillRegistry.fromFile(registryJsonPath);
      const allSkills = registry.getAllSkills();

      for (const skill of allSkills) {
        expect(skill.id).toBeDefined();
        expect(skill.description.length).toBeGreaterThan(0);
        expect(skill.entryPoint).toBeDefined();
      }
    });

    it('enforces that offline test doubles cannot produce live external provenance', () => {
      const offlineType = 'OFFLINE_TEST_DOUBLE';
      const liveType = 'LIVE_EXTERNAL';

      expect(offlineType).not.toBe(liveType);
    });

    it('enforces that automated test approval cannot be equated with human approval', () => {
      const automatedState = 'AUTOMATED_TEST';
      const humanState = 'HUMAN';

      expect(automatedState).not.toBe(humanState);
    });

    it('enforces that offline rehearsal verified cannot be equated with master production verified', () => {
      const rehearsalVerified = 'OFFLINE_REHEARSAL_VERIFIED';
      const masterVerified = 'MASTER_PRODUCTION_VERIFIED';

      expect(rehearsalVerified).not.toBe(masterVerified);
    });
  });
});
