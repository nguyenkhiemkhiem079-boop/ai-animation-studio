import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShotContract,
  ProductionScene,
  ProductionPlan,
  HyperFramesCompositionCompiler,
  HyperFramesAdapter,
  HyperFramesLayerSystem,
  ParallaxEngine,
  CinematicSkillCompiler,
  HyperFramesExecutionPipelineStep,
  Pipeline,
  MemoryStorage,
} from '../src/index.js';
import { ShotEnvironmentReferencePacket } from '../src/world/location-reference-resolver.js';

describe('HyperFrames & Deterministic Animation (Phase 7)', () => {
  let parallaxEngine: ParallaxEngine;
  let layerSystem: HyperFramesLayerSystem;
  let skillCompiler: CinematicSkillCompiler;
  let compiler: HyperFramesCompositionCompiler;
  let adapter: HyperFramesAdapter;
  let storage: MemoryStorage;

  const testShot: ShotContract = {
    id: 'SHOT_HF_TEST_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'simple_transform',
    rendererIntent: 'deterministic_hyperframes',
    frame: { durationSeconds: 4.0, targetFps: 24, aspectRatio: '16:9' },
    camera: {
      focalLength: '35mm',
      shotSize: 'wide',
      angle: 'eye_level',
      movement: 'push_in',
      semanticSkills: ['pushin', 'handheld'],
    },
    lighting: {
      keyLightDirection: 'left',
      mood: 'noir_chiaroscuro',
      colorTemperature: 'cool',
      fogAtmosphere: true,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: { foreground: [], midground: [], background: [] },
    },
    acting: [
      {
        characterId: 'char_kaito',
        pose: 'standing_watchful',
        expression: 'grim',
        gazeDirection: 'screen_right',
        dialogueLine: 'The signal is coming from below.',
      },
    ],
    transition: { type: 'cut', durationSeconds: 0 },
    environmentLocationId: 'loc_observatory',
    environmentZoneId: 'dome_room',
    audioCue: { sfx: ['ambient_wind'] },
    requiredAssetIds: ['ASSET_BG_OBSERVATORY', 'ASSET_CHAR_KAITO'],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: false,
      isFramingLocked: false,
      isRendererLocked: false,
      isActingLocked: false,
    },
    provenance: { decidedAt: new Date().toISOString() },
  };

  const testEnvPacket: ShotEnvironmentReferencePacket = {
    shotId: testShot.id,
    locationId: 'loc_observatory',
    zoneId: 'dome_room',
    establishingBackdrop: {
      id: 'ASSET_BG_OBSERVATORY',
      seriesId: 'series_hf_test',
      entityId: 'loc_observatory',
      name: 'Observatory Backdrop',
      type: 'location_backdrop',
      status: 'approved_canon',
      version: 1,
      storageUri: 'assets/locations/observatory/backdrop.png',
      tags: ['loc_observatory', 'dome_room'],
      contentHash: 'hash_bg_01',
      sourceTraceability: { sourceTextHash: 'src_01', startOffset: 0, endOffset: 10 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    layers: [
      {
        id: 'layer_foreground_pillars',
        name: 'Foreground Stone Pillars',
        type: 'foreground',
        parallaxFactor: 1.5,
        zIndex: 5,
        assetId: 'ASSET_PILLARS_FG',
      },
    ],
    visibleAnchors: [],
    activeProps: [],
  };

  beforeEach(() => {
    parallaxEngine = new ParallaxEngine();
    layerSystem = new HyperFramesLayerSystem();
    skillCompiler = new CinematicSkillCompiler(parallaxEngine);
    compiler = new HyperFramesCompositionCompiler(layerSystem, skillCompiler);
    storage = new MemoryStorage();
    adapter = new HyperFramesAdapter(compiler, storage);
  });

  describe('ParallaxEngine', () => {
    it('computes differential scale motion for push_in with depth multiplier', () => {
      const bgMotion = parallaxEngine.computeLayerMotion('push_in', 0.2, 3.0);
      const fgMotion = parallaxEngine.computeLayerMotion('push_in', 1.5, 3.0);

      expect(bgMotion.to.scale).toBeCloseTo(1.024, 3);
      expect(fgMotion.to.scale).toBeCloseTo(1.18, 2);
      expect(fgMotion.to.scale).toBeGreaterThan(bgMotion.to.scale);
      expect(bgMotion.ease).toBe('power2.out');
    });

    it('computes differential horizontal shift for pan_left', () => {
      const bgMotion = parallaxEngine.computeLayerMotion('pan_left', 0.2, 4.0);
      const fgMotion = parallaxEngine.computeLayerMotion('pan_left', 1.5, 4.0);

      // Camera pans left -> scenery moves right
      expect(bgMotion.to.x).toBe(10); // 100 * 0.2 * 0.5
      expect(fgMotion.to.x).toBe(75); // 100 * 1.5 * 0.5
      expect(fgMotion.to.x).toBeGreaterThan(bgMotion.to.x);
    });

    it('computes rotational arc for orbit camera motion', () => {
      const orbitMotion = parallaxEngine.computeLayerMotion('orbit', 1.0, 5.0);
      expect(orbitMotion.from.rotation).toBeLessThan(0);
      expect(orbitMotion.to.rotation).toBeGreaterThan(0);
      expect(orbitMotion.ease).toBe('sine.inOut');
    });
  });

  describe('HyperFramesLayerSystem', () => {
    it('assembles multi-plane layers from environment and character inputs', () => {
      const layers = layerSystem.buildLayersForShot(testShot, testEnvPacket);

      expect(layers.length).toBeGreaterThanOrEqual(4);

      const backdrop = layers.find((l) => l.id.includes('backdrop'));
      expect(backdrop).toBeDefined();
      expect(backdrop?.parallaxFactor).toBe(0.2);
      expect(backdrop?.zIndex).toBe(1);

      const fg = layers.find((l) => l.id.includes('foreground_pillars'));
      expect(fg).toBeDefined();
      expect(fg?.parallaxFactor).toBe(1.5);

      const char = layers.find((l) => l.id.includes('char_kaito'));
      expect(char).toBeDefined();
      expect(char?.parallaxFactor).toBe(1.0);

      const sub = layers.find((l) => l.id.includes('sub_char_kaito'));
      expect(sub).toBeDefined();
      expect(sub?.parallaxFactor).toBe(0.0); // Fixed UI layer
      expect(sub?.zIndex).toBe(100);
      expect(sub?.textContent).toContain('The signal is coming from below');
    });
  });

  describe('CinematicSkillCompiler', () => {
    it('compiles multi-plane parallax and semantic skills into GSAP timeline code', () => {
      const layers = layerSystem.buildLayersForShot(testShot, testEnvPacket);
      const gsapCode = skillCompiler.compileSkillsToGsap(
        ['pushin', 'handheld', 'vintagefilm'],
        'push_in',
        layers,
        4.0
      );

      expect(gsapCode).toContain('tl.fromTo(');
      expect(gsapCode).toContain('Handheld Organic Drift');
      expect(gsapCode).toContain('Vintage Film');
      expect(gsapCode).toContain('#camera_rig');
      expect(gsapCode).toContain('sepia(0.35)');
    });
  });

  describe('HyperFramesCompositionCompiler', () => {
    it('compiles ShotContract into valid standalone HyperFrames HTML composition', () => {
      const composition = compiler.compile(testShot, testEnvPacket);

      expect(composition.compositionId).toBe('hf_shot_hf_test_01');
      expect(composition.width).toBe(1920);
      expect(composition.height).toBe(1080);
      expect(composition.fps).toBe(24);
      expect(composition.durationSeconds).toBe(4.0);
      expect(composition.layers.length).toBeGreaterThanOrEqual(4);

      // Verify HTML structure follows HyperFrames contract
      expect(composition.html).toContain('<!DOCTYPE html>');
      expect(composition.html).toContain(`data-composition-id="${composition.compositionId}"`);
      expect(composition.html).toContain('data-width="1920"');
      expect(composition.html).toContain('data-height="1080"');
      expect(composition.html).toContain('data-duration="4"');
      expect(composition.html).not.toContain('<template>'); // Standalone root must NOT be wrapped in <template>
      expect(composition.html).toContain('class="clip');
      expect(composition.html).toContain('data-track-index=');
      expect(composition.html).toContain(`window.__timelines["${composition.compositionId}"] = tl;`);
    });
  });

  describe('HyperFramesAdapter', () => {
    it('executes deterministic render, writes HTML to storage, and incurs $0.00 cost', async () => {
      const result = await adapter.execute({
        taskType: 'deterministic_anim',
        input: { shot: testShot, envPacket: testEnvPacket },
      });

      expect(result.actualCostUsd).toBe(0.0);
      expect(result.providerId).toBe('hyperframes-local');

      const output = result.output as any;
      expect(output.assetId).toBe('ASSET_HF_SHOT_HF_TEST_01');
      expect(output.renderResult.format).toBe('html_bundle');
      expect(output.renderResult.actualCostUsd).toBe(0.0);
      expect(output.renderResult.htmlPath).toBe('compositions/hf_shot_hf_test_01.html');

      // Verify HTML file was stored in storage
      const storedHtml = await storage.read('compositions/hf_shot_hf_test_01.html');
      expect(storedHtml).toContain('data-composition-id="hf_shot_hf_test_01"');
    });
  });

  describe('HyperFramesExecutionPipelineStep (DAG Integration)', () => {
    it('renders all deterministic shots and records savings in DAG pipeline', async () => {
      const scenes: ProductionScene[] = [
        {
          id: 'SCENE_01',
          projectId: 'PROJ_HF_DAG',
          sceneNumber: 1,
          heading: 'INT. OBSERVATORY - NIGHT',
          purpose: 'establishing',
          shots: [testShot],
          coverageSummary: { totalShots: 1, estimatedDurationSeconds: 4.0, complexityScore: 2 },
          actingDirectives: [],
          directorNotes: 'Establish mood with parallax push-in',
        },
      ];

      const productionPlan: ProductionPlan = {
        projectId: 'PROJ_HF_DAG',
        seriesId: 'series_hf_dag',
        totalShots: 1,
        deterministicShotsCount: 1,
        generativeShotsCount: 0,
        hybridShotsCount: 0,
        totalEstimatedCostUsd: 0.0,
        totalEstimatedLatencyMs: 50,
        strategies: [
          {
            shotId: testShot.id,
            executionRoute: 'deterministic_hyperframes',
            primaryProviderId: 'hyperframes-local',
            estimatedCostUsd: 0.0,
            estimatedLatencyMs: 50,
            rationale: 'Deterministic HyperFrames animation',
            requiredInputAssets: [],
            isDeterministic: true,
            requiresContinuation: false,
          },
        ],
        plannedAt: new Date().toISOString(),
      };

      const step = new HyperFramesExecutionPipelineStep(adapter);
      const pipeline = new Pipeline({
        name: 'HyperFrames Execution Test',
        steps: [step],
        storage,
      });

      const result = await pipeline.execute('PROJ_HF_DAG', {
        seriesId: 'series_hf_dag',
        productionScenes: scenes,
        productionPlan,
        environmentReferencePackets: {
          [testShot.id]: testEnvPacket,
        },
      });

      expect(result.completedStepIds).toContain('hyperframes_deterministic_execution');
      const rendered = result.state.renderedHyperFramesCompositions as Record<string, any>;
      expect(rendered[testShot.id]).toBeDefined();
      expect(rendered[testShot.id].actualCostUsd).toBe(0.0);

      const summary = result.state.hyperFramesExecutionSummary as any;
      expect(summary.totalDeterministicShots).toBe(1);
      expect(summary.totalCompositionsCompiled).toBe(1);
      expect(summary.totalCostUsd).toBe(0.0);
      expect(summary.totalEstimatedSavingsUsd).toBe(0.25);
    });
  });
});
