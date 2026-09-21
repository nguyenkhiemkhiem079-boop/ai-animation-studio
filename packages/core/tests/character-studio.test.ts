import { describe, it, expect, beforeEach } from 'vitest';
import {
  CharacterStudio,
  CanonicalCharacterSheet,
  REQUIRED_TURNAROUND_VIEWS,
  ExpressionLibrary,
  PoseLibrary,
  OutfitLibrary,
  IdentityQAEvaluator,
  CharacterAssetFactory,
  AssetResolver,
  CharacterReferenceResolver,
  CharacterAssetPipelineStep,
} from '../src/character/index.js';
import { UniverseManager } from '../src/universe/index.js';
import { InMemoryAssetRegistry } from '../src/asset-registry/index.js';
import { MemoryStorage } from '../src/storage/index.js';
import { ShotContract, ProductionScene } from '../src/domain/director.js';
import { CharacterDNA } from '../src/domain/universe.js';
import { Pipeline, PipelineContext } from '../src/pipeline/index.js';
import { CheckpointManager } from '../src/checkpoint/index.js';
import { defaultEventBus } from '../src/events/index.js';
import { defaultLogger } from '../src/logging/index.js';

describe('Character & Asset Studio (Phase 4)', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;
  let assetRegistry: InMemoryAssetRegistry;
  let studio: CharacterStudio;
  const seriesId = 'series_phase4_test';

  const testCharacter: CharacterDNA = {
    id: 'CHAR_MINH_001',
    seriesId,
    name: 'Minh Vu',
    aliases: ['Minh', 'Detective Vu'],
    description: 'A dedicated investigator with sharp analytical instincts.',
    visualAnchorPrompt: 'Asian male, 32 years old, short black hair, trench coat, intense dark eyes',
    traits: ['analytical', 'cautious', 'tenacious'],
    currentVersion: 1,
    versions: [
      {
        version: 1,
        summary: 'Original detective attire',
        canonicalAssetIds: [],
        createdAt: new Date().toISOString(),
      },
    ],
    outfits: [
      {
        id: 'detective_trench',
        name: 'Detective Trench Coat',
        description: 'Classic beige trench coat over a dark suit',
        referenceAssetIds: [],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
    assetRegistry = new InMemoryAssetRegistry();
    studio = new CharacterStudio(universeManager, assetRegistry);

    // Seed universe with character
    const universe = await universeManager.getOrCreateUniverse(seriesId);
    universe.characters[testCharacter.id] = testCharacter;
    await universeManager.saveUniverse(universe);
  });

  describe('CanonicalCharacterSheet', () => {
    it('creates an empty sheet and identifies missing turnaround views', () => {
      const sheet = CanonicalCharacterSheet.create(testCharacter.id, { version: 1 });
      expect(sheet.characterId).toBe(testCharacter.id);
      expect(sheet.isComplete()).toBe(false);
      expect(sheet.getMissingViews()).toEqual(REQUIRED_TURNAROUND_VIEWS);
    });

    it('becomes complete when all 6 turnaround views are provided', () => {
      const sheet = CanonicalCharacterSheet.create(testCharacter.id, { version: 1 });

      for (const view of REQUIRED_TURNAROUND_VIEWS) {
        sheet.setView(view, `ASSET_TURN_${view.toUpperCase()}`);
      }

      expect(sheet.isComplete()).toBe(true);
      expect(sheet.getMissingViews()).toHaveLength(0);
      expect(sheet.getView('front')).toBe('ASSET_TURN_FRONT');
    });

    it('rejects invalid view assignment', () => {
      const sheet = CanonicalCharacterSheet.create(testCharacter.id);
      expect(() => (sheet as any).setView('invalid_angle', 'ASSET_123')).toThrow();
    });
  });

  describe('Libraries: Expression, Pose, Outfit', () => {
    it('loads default expressions and filters by category', () => {
      const exprLib = studio.getExpressionLibrary();
      expect(exprLib.list().length).toBeGreaterThanOrEqual(10);

      const happy = exprLib.get('happy');
      expect(happy).toBeDefined();
      expect(happy?.category).toBe('positive');

      const intense = exprLib.findByCategory('intense');
      expect(intense.map((e) => e.name)).toContain('afraid');
      expect(intense.map((e) => e.name)).toContain('angry');
    });

    it('loads default poses and filters by category and facing', () => {
      const poseLib = studio.getPoseLibrary();
      expect(poseLib.list().length).toBeGreaterThanOrEqual(8);

      const walking = poseLib.get('walking');
      expect(walking).toBeDefined();
      expect(walking?.category).toBe('kinetic');
      expect(walking?.facing).toBe('three_quarter_left');

      const standing = poseLib.findByCategory('standing');
      expect(standing.map((p) => p.name)).toContain('idle_standing');
    });

    it('registers and manages outfits with reference assets', () => {
      const outfitLib = studio.getOutfitLibrary();
      outfitLib.register(seriesId, testCharacter.id, testCharacter.outfits[0]);

      const retrieved = outfitLib.get(seriesId, testCharacter.id, 'detective_trench');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Detective Trench Coat');

      outfitLib.addReferenceAsset(seriesId, testCharacter.id, 'detective_trench', 'ASSET_COAT_01');
      const updated = outfitLib.get(seriesId, testCharacter.id, 'detective_trench');
      expect(updated?.referenceAssetIds).toContain('ASSET_COAT_01');
    });
  });

  describe('IdentityQAEvaluator', () => {
    it('passes high-fidelity candidates matching character identity', async () => {
      const factory = studio.getAssetFactory();
      const candidate = await factory.createTurnaroundView(testCharacter, 'front');

      const result = IdentityQAEvaluator.evaluate(candidate, testCharacter, {
        characterId: testCharacter.id,
        confidenceThreshold: 0.85,
        featureAnchors: {},
      });

      expect(result.passed).toBe(true);
      expect(result.similarityScore).toBeGreaterThanOrEqual(0.85);
      expect(result.facialDriftDetected).toBe(false);
      expect(result.anatomyCheckPassed).toBe(true);
    });

    it('fails candidate when identity drift occurs (score below threshold)', async () => {
      const factory = studio.getAssetFactory();
      const candidate = await factory.createTurnaroundView(testCharacter, 'front');

      const result = IdentityQAEvaluator.evaluate(
        candidate,
        testCharacter,
        {
          characterId: testCharacter.id,
          confidenceThreshold: 0.85,
          featureAnchors: {},
        },
        { simulatedScore: 0.72 }
      );

      expect(result.passed).toBe(false);
      expect(result.facialDriftDetected).toBe(true);
      expect(result.critique.length).toBeGreaterThan(0);
      expect(result.critique[0]).toContain('Identity drift detected');
    });

    it('fails candidate when anatomy defects are detected', async () => {
      const factory = studio.getAssetFactory();
      const candidate = await factory.createTurnaroundView(testCharacter, 'front', {
        tags: ['corrupted_anatomy'],
      });

      const result = IdentityQAEvaluator.evaluate(
        candidate,
        testCharacter,
        {
          characterId: testCharacter.id,
          confidenceThreshold: 0.85,
          featureAnchors: {},
        },
        { simulatedAnatomyPass: false }
      );

      expect(result.passed).toBe(false);
      expect(result.anatomyCheckPassed).toBe(false);
      expect(result.critique.some((c) => c.includes('Anatomical defect'))).toBe(true);
    });
  });

  describe('AssetResolver & AssetReuseEngine', () => {
    it('generates a candidate on first request, then REUSES on subsequent requests', async () => {
      const resolver = studio.getAssetResolver();

      // 1. First resolution: Asset does not exist -> Generates and auto-approves
      const res1 = await resolver.resolveCharacterAsset({
        character: testCharacter,
        expression: 'afraid',
        view: 'profile_left',
        autoApproveOnPass: true,
      });

      expect(res1.source).toBe('GENERATED_AND_APPROVED');
      expect(res1.asset.status).toBe('approved_canon');
      expect(res1.asset.tags).toContain('afraid');
      expect(res1.asset.tags).toContain('profile_left');

      // 2. Second resolution with identical requirements -> Must REUSE existing canon asset!
      const res2 = await resolver.resolveCharacterAsset({
        character: testCharacter,
        expression: 'afraid',
        view: 'profile_left',
      });

      expect(res2.source).toBe('REUSED');
      expect(res2.asset.id).toBe(res1.asset.id);
      expect(res2.asset.contentHash).toBe(res1.asset.contentHash);

      // Verify reuse tracking
      expect(resolver.getReuseEngine().getTotalReuses()).toBe(1);
      const stats = resolver.getReuseEngine().getStats(res1.asset.id);
      expect(stats?.count).toBe(1);
    });

    it('never regenerates canonical character when turnaround is requested', async () => {
      const resolver = studio.getAssetResolver();

      const turn1 = await resolver.resolveCharacterAsset({
        character: testCharacter,
        view: 'front',
        autoApproveOnPass: true,
      });

      const turn2 = await resolver.resolveCharacterAsset({
        character: testCharacter,
        view: 'front',
      });

      expect(turn2.source).toBe('REUSED');
      expect(turn2.asset.id).toBe(turn1.asset.id);
    });
  });

  describe('CharacterReferenceResolver', () => {
    it('maps ShotContract subjects into bound reference roles', async () => {
      const mockShot: ShotContract = {
        id: 'SHOT_TEST_01',
        sceneId: 'SCENE_01',
        shotNumber: 1,
        purpose: 'dialogue_coverage',
        camera: {
          shotSize: 'medium_close_up',
          angle: 'three_quarter_left',
          movement: 'static',
          character: 'smooth',
          focalLengthMm: 50,
        },
        acting: [
          {
            characterId: testCharacter.id,
            pose: 'standing_cautious',
            expression: 'afraid',
            gazeDirection: 'screen_left',
            actionPrompt: 'afraid and trembling',
          },
        ],
        lighting: {
          keyLightDirection: 'side_left',
          colorTemperatureK: 3200,
          intensity: 'high',
          mood: 'dramatic_chiaroscuro',
        },
        composition: {
          rule: 'rule_of_thirds',
          subjectPlacement: 'center',
          depthLayers: { foreground: [], midground: ['character'], background: [] },
        },
        transition: {
          type: 'cut',
          durationSeconds: 0,
        },
        frame: {
          durationSeconds: 3.0,
          targetFps: 30,
          aspectRatio: '16:9',
        },
        complexity: 'moderate',
        rendererIntent: 'deterministic_hyperframes',
        source_traceability: {
          source_text_hash: 'abc123',
          start_offset: 0,
          end_offset: 50,
        },
      };

      const packet = await studio.resolveShotReferences(seriesId, mockShot);
      expect(packet.shotId).toBe('SHOT_TEST_01');
      expect(packet.bindings).toHaveLength(1);

      const binding = packet.bindings[0];
      expect(binding.characterId).toBe(testCharacter.id);
      expect(binding.roles.CHARACTER_IDENTITY).toBeDefined();
      expect(binding.roles.CHARACTER_IDENTITY.tags).toContain('three_quarter_left');
      expect(binding.roles.EXPRESSION).toBeDefined();
      expect(binding.roles.EXPRESSION?.tags).toContain('afraid');
      expect(binding.roles.CHARACTER_POSE).toBeDefined();
    });
  });

  describe('CharacterStudio High-Level Operations', () => {
    it('initializes a full canonical character sheet with all 6 views', async () => {
      const sheet = await studio.getOrCreateCharacterSheet(seriesId, testCharacter.id);
      expect(sheet.isComplete()).toBe(true);

      for (const view of REQUIRED_TURNAROUND_VIEWS) {
        expect(sheet.getView(view)).toBeDefined();
      }

      // Check manifest construction
      const manifest = await studio.getCharacterManifest(seriesId, testCharacter.id);
      expect(manifest.characterId).toBe(testCharacter.id);
      expect(Object.keys(manifest.views)).toHaveLength(6);
    });

    it('approves an asset and updates its status in the registry', async () => {
      const factory = studio.getAssetFactory();
      const candidate = await factory.createTurnaroundView(testCharacter, 'profile_left');
      expect(candidate.status).toBe('candidate');

      const approved = await studio.approveAsset(candidate.id);
      expect(approved.status).toBe('approved_canon');
      expect(approved.approvedAt).toBeDefined();

      const retrieved = await assetRegistry.findById(candidate.id);
      expect(retrieved?.status).toBe('approved_canon');
    });
  });

  describe('CharacterAssetPipelineStep (DAG Integration)', () => {
    it('executes in a pipeline, resolving all shot subjects and recording metrics', async () => {
      const productionScenes: ProductionScene[] = [
        {
          id: 'SCENE_01',
          projectId: 'PROJ_PHASE4_TEST',
          sceneNumber: 1,
          heading: 'INT. DETECTIVE OFFICE - NIGHT',
          purpose: 'dialogue',
          narrativeIntent: {
            dramaticBeat: 'discovery',
            emotionalShift: 'calm_to_dread',
            tensionLevel: 0.8,
            keySubjectId: testCharacter.id,
          },
          shots: [
            {
              id: 'SCENE_01_SHOT_01',
              sceneId: 'SCENE_01',
              shotNumber: 1,
              purpose: 'dialogue_coverage',
              camera: {
                shotSize: 'medium',
                angle: 'front',
                movement: 'static',
                character: 'smooth',
                focalLengthMm: 35,
              },
              acting: [
                {
                  characterId: testCharacter.id,
                  pose: 'standing_cautious',
                  expression: 'thoughtful',
                  gazeDirection: 'direct_to_camera',
                  actionPrompt: 'thoughtful review of notes',
                },
              ],
              lighting: {
                keyLightDirection: 'front',
                colorTemperatureK: 4000,
                intensity: 'medium',
                mood: 'natural',
              },
              composition: {
                rule: 'symmetrical',
                subjectPlacement: 'center',
                depthLayers: { foreground: [], midground: ['character'], background: [] },
              },
              transition: { type: 'cut', durationSeconds: 0 },
              frame: { durationSeconds: 2.5, targetFps: 30, aspectRatio: '16:9' },
              complexity: 'simple',
              rendererIntent: 'deterministic_hyperframes',
              source_traceability: { source_text_hash: 'h1', start_offset: 0, end_offset: 30 },
            },
          ],
        },
      ];

      const step = new CharacterAssetPipelineStep(studio);
      const pipeline = new Pipeline({
        name: 'Character Studio Pipeline Test',
        steps: [step],
        storage,
      });

      const result = await pipeline.execute('PROJ_PHASE4_TEST', {
        seriesId,
        productionScenes,
      });
      expect(result.completedStepIds).toContain('character_asset_resolution');

      const packets = result.state.characterReferencePackets as Record<string, any>;
      expect(packets['SCENE_01_SHOT_01']).toBeDefined();
      expect(packets['SCENE_01_SHOT_01'].bindings).toHaveLength(1);

      const summary = result.state.characterResolutionSummary as any;
      expect(summary.totalScenes).toBe(1);
      expect(summary.totalShots).toBe(1);
      expect(summary.totalSubjectsResolved).toBe(1);
    });
  });
});
