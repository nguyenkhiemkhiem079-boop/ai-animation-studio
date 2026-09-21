import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorldStudio,
  SpatialMemory,
  EnvironmentLayerManager,
  LightingLibrary,
  AtmosphereLibrary,
  PropPlacementTracker,
  LocationReferenceResolver,
  WorldEnvironmentPipelineStep,
} from '../src/world/index.js';
import { UniverseManager } from '../src/universe/index.js';
import { InMemoryAssetRegistry } from '../src/asset-registry/index.js';
import { MemoryStorage } from '../src/storage/index.js';
import { ShotContract, ProductionScene } from '../src/domain/director.js';
import { LocationDNA } from '../src/domain/universe.js';
import { Pipeline } from '../src/pipeline/index.js';

describe('World & Environment Studio (Phase 5)', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;
  let assetRegistry: InMemoryAssetRegistry;
  let studio: WorldStudio;
  const seriesId = 'series_phase5_test';

  const testLocation: LocationDNA = {
    id: 'LOC_OLD_HOUSE_001',
    seriesId,
    name: 'Old Ancestral House',
    aliases: ['Minh Family House', 'The Old Residence'],
    description: 'A traditional wooden house steeped in family secrets and shadows.',
    zones: [
      {
        id: 'funeral_room',
        name: 'Funeral / Altar Room',
        description: 'Solemn interior with high wooden beams, ancestral portraits, and incense smoke.',
        lightingLogic: 'Low ambient moonlight through high windows with flickering candle warm glow.',
        keyProps: ['ancestral_altar', 'incense_burner', 'brass_urn', 'mahogany_armchair'],
      },
      {
        id: 'courtyard',
        name: 'Stone Courtyard',
        description: 'Rain-soaked courtyard with cracked flagstones.',
        keyProps: ['stone_well', 'rusted_gate'],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
    assetRegistry = new InMemoryAssetRegistry();
    studio = new WorldStudio(universeManager, assetRegistry);

    // Seed universe with location
    const universe = await universeManager.getOrCreateUniverse(seriesId);
    universe.locations[testLocation.id] = testLocation;
    await universeManager.saveUniverse(universe);
  });

  describe('SpatialMemory & SceneMap', () => {
    it('creates a SceneMap and adds spatial anchors with positions', () => {
      const memory = studio.getSpatialMemory();
      const map = memory.getOrCreateSceneMap(seriesId, testLocation.id, 'funeral_room');

      expect(map.locationId).toBe(testLocation.id);
      expect(map.zoneId).toBe('funeral_room');
      expect(map.dimensions.widthMeters).toBeGreaterThan(0);

      // Add door and altar anchors
      memory.addAnchor(seriesId, testLocation.id, 'funeral_room', {
        id: 'anchor_altar',
        name: 'Ancestral Altar',
        position: { x: 0, y: 0.8, z: 3.0 }, // North wall
        facingAngleDeg: 180,
        associatedProps: ['ancestral_altar', 'incense_burner'],
      });

      memory.addAnchor(seriesId, testLocation.id, 'funeral_room', {
        id: 'anchor_door',
        name: 'Entrance Double Door',
        position: { x: 0, y: 0, z: -3.5 }, // South wall
        facingAngleDeg: 0,
        associatedProps: ['wooden_door'],
      });

      const anchors = memory.listAnchors(seriesId, testLocation.id, 'funeral_room');
      expect(anchors).toHaveLength(2);
      expect(anchors.map((a) => a.id)).toContain('anchor_altar');
      expect(anchors.map((a) => a.id)).toContain('anchor_door');
    });

    it('verifies spatial continuity and flags reverse cut contradictions', () => {
      const memory = studio.getSpatialMemory();
      const map = memory.getOrCreateSceneMap(seriesId, testLocation.id, 'funeral_room');

      memory.addAnchor(seriesId, testLocation.id, 'funeral_room', {
        id: 'anchor_altar',
        name: 'Ancestral Altar',
        position: { x: 0, y: 0.8, z: 3.0 }, // North wall (+z)
        facingAngleDeg: 180,
        associatedProps: ['altar'],
      });

      // Camera 1: looking front (towards +z, altar is in front)
      const cam1 = { shotSize: 'medium', angle: 'front', movement: 'static', character: 'smooth', focalLengthMm: 35 } as const;
      const check1 = memory.verifySpatialContinuity(map, cam1);
      expect(check1.isConsistent).toBe(true);
      expect(check1.visibleAnchors.map((a) => a.id)).toContain('anchor_altar');

      // Camera 2: reverse angle looking back (towards -z)
      const cam2 = { shotSize: 'medium', angle: 'back', movement: 'static', character: 'smooth', focalLengthMm: 35 } as const;
      const check2 = memory.verifySpatialContinuity(map, cam2, cam1);
      expect(check2.isConsistent).toBe(true);
      // Altar (+z) should NOT be visible when looking back (-z)
      expect(check2.visibleAnchors.map((a) => a.id)).not.toContain('anchor_altar');
    });
  });

  describe('EnvironmentLayerManager & Parallax', () => {
    it('manages multi-plane layers and sorts by depth order', () => {
      const layerManager = studio.getLayerManager();

      layerManager.addLayer(seriesId, testLocation.id, 'funeral_room', {
        id: 'layer_bg',
        type: 'background',
        assetId: 'ASSET_BG_WALL',
        name: 'North Wall & Altar',
        parallaxFactor: 0.2,
        depthOrder: 0,
        opacity: 1.0,
      });

      layerManager.addLayer(seriesId, testLocation.id, 'funeral_room', {
        id: 'layer_fg',
        type: 'foreground',
        assetId: 'ASSET_FG_CURTAIN',
        name: 'Hanging Silk Curtains',
        parallaxFactor: 1.6,
        depthOrder: 2,
        opacity: 0.9,
      });

      layerManager.addLayer(seriesId, testLocation.id, 'funeral_room', {
        id: 'layer_mg',
        type: 'midground',
        assetId: 'ASSET_MG_TABLE',
        name: 'Offering Table',
        parallaxFactor: 1.0,
        depthOrder: 1,
        opacity: 1.0,
      });

      const layers = layerManager.getLayers(seriesId, testLocation.id, 'funeral_room');
      expect(layers).toHaveLength(3);
      expect(layers[0].id).toBe('layer_bg');
      expect(layers[1].id).toBe('layer_mg');
      expect(layers[2].id).toBe('layer_fg');
    });

    it('computes differential parallax displacement during camera pan', () => {
      const layerManager = studio.getLayerManager();
      const layers = [
        {
          id: 'bg',
          type: 'background' as const,
          assetId: 'a1',
          name: 'bg',
          parallaxFactor: 0.2,
          depthOrder: 0,
          opacity: 1.0,
        },
        {
          id: 'fg',
          type: 'foreground' as const,
          assetId: 'a2',
          name: 'fg',
          parallaxFactor: 1.5,
          depthOrder: 2,
          opacity: 1.0,
        },
      ];

      // Pan left at 100% progress
      const displacement = layerManager.computeParallaxDisplacement(layers, 'pan_left', 1.0);
      expect(displacement).toHaveLength(2);

      const bgDisp = displacement.find((d) => d.layerId === 'bg');
      const fgDisp = displacement.find((d) => d.layerId === 'fg');

      expect(bgDisp?.offsetXPixels).toBe(150 * 0.2); // 30px
      expect(fgDisp?.offsetXPixels).toBe(150 * 1.5); // 225px
      expect(fgDisp!.offsetXPixels).toBeGreaterThan(bgDisp!.offsetXPixels);
    });
  });

  describe('LightingLibrary & AtmosphereLibrary', () => {
    it('retrieves default lighting presets and filters by time of day', () => {
      const lightingLib = studio.getLightingLibrary();
      expect(lightingLib.list().length).toBeGreaterThanOrEqual(5);

      const noir = lightingLib.get('noir_chiaroscuro');
      expect(noir).toBeDefined();
      expect(noir?.timeOfDay).toBe('night');
      expect(noir?.intensity).toBe('dramatic');

      const sunsetPresets = lightingLib.findByTimeOfDay('sunset');
      expect(sunsetPresets.map((p) => p.id)).toContain('golden_hour');
    });

    it('retrieves default atmosphere presets and filters by weather', () => {
      const atmosphereLib = studio.getAtmosphereLibrary();
      expect(atmosphereLib.list().length).toBeGreaterThanOrEqual(5);

      const rain = atmosphereLib.get('heavy_downpour');
      expect(rain).toBeDefined();
      expect(rain?.weather).toBe('heavy_rain');
      expect(rain?.particles).toBe('rain_streaks');

      const fogPresets = atmosphereLib.findByWeather('fog');
      expect(fogPresets.map((p) => p.id)).toContain('dense_fog');
    });
  });

  describe('PropPlacementTracker', () => {
    it('places props and tracks mutable state changes across shots', () => {
      const tracker = studio.getPropTracker();

      tracker.placeProp(seriesId, testLocation.id, 'funeral_room', {
        propId: 'urn_01',
        propName: 'Brass Incense Urn',
        anchorId: 'anchor_altar',
        state: 'intact',
      });

      const initialProps = tracker.getProps(seriesId, testLocation.id, 'funeral_room');
      expect(initialProps).toHaveLength(1);
      expect(initialProps[0].state).toBe('intact');

      // Mutate prop state during an action shot
      tracker.mutatePropState(seriesId, testLocation.id, 'funeral_room', 'urn_01', 'damaged', 'SHOT_03');

      const updatedProps = tracker.getProps(seriesId, testLocation.id, 'funeral_room');
      expect(updatedProps[0].state).toBe('damaged');
      expect(updatedProps[0].lastMutatedInShotId).toBe('SHOT_03');

      const state = tracker.getOrCreateState(seriesId, testLocation.id, 'funeral_room');
      expect(state.damagedElements).toContain('Brass Incense Urn');
    });
  });

  describe('WorldStudio Coordination & Shot Environment Resolution', () => {
    it('registers backdrop asset and constructs LocationReferenceSet', async () => {
      const asset = await studio.registerBackdropAsset(seriesId, testLocation.id, 'funeral_room', {
        contentHash: 'hash_bg_funeral_01',
        storageUri: 'assets/locations/funeral_room/backdrop.png',
      });

      expect(asset.id).toBe('ASSET_LOC_LOC_OLD_HOUSE_001_FUNERAL_ROOM_BG');
      expect(asset.status).toBe('approved_canon');

      const refSet = await studio.getLocationReferenceSet(seriesId, testLocation.id, 'funeral_room');
      expect(refSet.locationId).toBe(testLocation.id);
      expect(refSet.zoneId).toBe('funeral_room');
      expect(refSet.wideEstablishingAssetId).toBe(asset.id);
      expect(Object.keys(refSet.lightingPresets).length).toBeGreaterThan(0);
    });

    it('resolves environment packet for a ShotContract', async () => {
      await studio.registerBackdropAsset(seriesId, testLocation.id, 'funeral_room', {
        contentHash: 'hash_bg_01',
        storageUri: 'assets/locations/funeral_room/bg.png',
      });

      studio.addSpatialAnchor(seriesId, testLocation.id, 'funeral_room', {
        id: 'anchor_altar',
        name: 'Ancestral Altar',
        position: { x: 0, y: 1.0, z: 2.0 },
        facingAngleDeg: 180,
        associatedProps: ['altar_table'],
      });

      const mockShot: ShotContract = {
        id: 'SHOT_SCENE_01_SH01',
        sceneId: 'SCENE_01',
        shotNumber: 1,
        purpose: 'establishing',
        complexity: 'simple',
        rendererIntent: 'deterministic_hyperframes',
        frame: { durationSeconds: 4.0, targetFps: 24, aspectRatio: '16:9' },
        camera: {
          shotSize: 'wide',
          angle: 'front',
          movement: 'push_in',
          character: 'smooth',
          focalLengthMm: 24,
        },
        lighting: {
          keyLightDirection: 'left',
          colorTemperature: 'cool',
          mood: 'noir_suspense',
          fogAtmosphere: true,
          atmosphere: 'foggy',
        },
        composition: {
          rule: 'rule_of_thirds',
          subjectPlacement: 'center',
          depthLayers: { foreground: [], midground: [], background: [] },
        },
        acting: [],
        transition: { type: 'cut', durationSeconds: 0 },
        environmentLocationId: testLocation.id,
        environmentZoneId: 'funeral_room',
        audioCue: { sfx: [] },
        requiredAssetIds: [],
        dependsOnShotIds: [],
        directorLocks: {
          cameraLocked: false,
          framingLocked: false,
          durationLocked: false,
        },
        source_traceability: {
          source_text_hash: 'abc',
          start_offset: 0,
          end_offset: 20,
        },
      };

      const packet = await studio.resolveEnvironmentForShot(seriesId, mockShot);
      expect(packet.shotId).toBe('SHOT_SCENE_01_SH01');
      expect(packet.locationId).toBe(testLocation.id);
      expect(packet.zoneId).toBe('funeral_room');
      expect(packet.establishingBackdrop).toBeDefined();
      expect(packet.lightingPreset?.id).toBe('noir_chiaroscuro');
      expect(packet.atmospherePreset?.id).toBe('dense_fog');
      expect(packet.visibleAnchors.map((a) => a.id)).toContain('anchor_altar');
    });
  });

  describe('WorldEnvironmentPipelineStep (DAG Integration)', () => {
    it('executes in pipeline, resolving environment packets and recording metrics', async () => {
      const productionScenes: ProductionScene[] = [
        {
          id: 'SCENE_01',
          projectId: 'PROJ_PHASE5_TEST',
          sceneNumber: 1,
          heading: 'INT. FUNERAL ROOM - NIGHT',
          purpose: 'establishing',
          narrativeIntent: {
            dramaticBeat: 'revelation',
            emotionalShift: 'mystery_to_dread',
            tensionLevel: 0.9,
          },
          shots: [
            {
              id: 'SC01_SH01',
              sceneId: 'SCENE_01',
              shotNumber: 1,
              purpose: 'establishing',
              complexity: 'simple',
              rendererIntent: 'deterministic_hyperframes',
              frame: { durationSeconds: 3.5, targetFps: 24, aspectRatio: '16:9' },
              camera: {
                shotSize: 'extreme_wide',
                angle: 'eye_level',
                movement: 'pan_left',
                character: 'smooth',
                focalLengthMm: 24,
              },
              lighting: {
                keyLightDirection: 'side_left',
                colorTemperatureK: 3200,
                intensity: 'dramatic',
                mood: 'noir',
              },
              composition: {
                rule: 'rule_of_thirds',
                subjectPlacement: 'center',
                depthLayers: { foreground: [], midground: [], background: [] },
              },
              acting: [],
              transition: { type: 'cut', durationSeconds: 0 },
              environmentLocationId: testLocation.id,
              environmentZoneId: 'funeral_room',
              source_traceability: { source_text_hash: 'h1', start_offset: 0, end_offset: 20 },
            },
          ],
        },
      ];

      const step = new WorldEnvironmentPipelineStep(studio);
      const pipeline = new Pipeline({
        name: 'World Studio Pipeline Test',
        steps: [step],
        storage,
      });

      const result = await pipeline.execute('PROJ_PHASE5_TEST', {
        seriesId,
        productionScenes,
      });

      expect(result.completedStepIds).toContain('world_environment_resolution');

      const packets = result.state.environmentReferencePackets as Record<string, any>;
      expect(packets['SC01_SH01']).toBeDefined();
      expect(packets['SC01_SH01'].locationId).toBe(testLocation.id);

      const summary = result.state.worldResolutionSummary as any;
      expect(summary.totalScenes).toBe(1);
      expect(summary.totalShots).toBe(1);
      expect(summary.totalShotsWithEnvironment).toBe(1);
    });
  });
});
