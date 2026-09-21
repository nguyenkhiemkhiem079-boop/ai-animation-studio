import { ShotContract } from '../domain/director.js';
import {
  EnvironmentLayer,
  LightingPreset,
  AtmospherePreset,
  PropPlacement,
  SpatialAnchor,
} from '../domain/world.js';
import { AssetDescriptor } from '../domain/asset.js';
import { LocationDNA } from '../domain/universe.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { SpatialMemory } from './spatial-memory.js';
import { EnvironmentLayerManager } from './environment-layers.js';
import { LightingLibrary, AtmosphereLibrary } from './presets.js';
import { PropPlacementTracker } from './prop-tracker.js';

export interface ShotEnvironmentReferencePacket {
  shotId: string;
  locationId?: string;
  zoneId?: string;
  establishingBackdrop?: AssetDescriptor;
  layers: EnvironmentLayer[];
  lightingPreset?: LightingPreset;
  atmospherePreset?: AtmospherePreset;
  visibleAnchors: SpatialAnchor[];
  activeProps: PropPlacement[];
}

export class LocationReferenceResolver {
  constructor(
    private assetRegistry: IAssetRegistry,
    private spatialMemory: SpatialMemory,
    private layerManager: EnvironmentLayerManager,
    private lightingLib: LightingLibrary,
    private atmosphereLib: AtmosphereLibrary,
    private propTracker: PropPlacementTracker
  ) {}

  public async resolveEnvironmentForShot(
    seriesId: string,
    shot: ShotContract,
    locations: Map<string, LocationDNA>
  ): Promise<ShotEnvironmentReferencePacket> {
    const locationId = shot.environmentLocationId;
    const zoneId = shot.environmentZoneId ?? 'main_room';

    if (!locationId) {
      return {
        shotId: shot.id,
        layers: [],
        visibleAnchors: [],
        activeProps: [],
      };
    }

    const location = locations.get(locationId);

    // 1. Resolve wide establishing backdrop asset
    let establishingBackdrop: AssetDescriptor | undefined;
    const backdropCandidates = await this.assetRegistry.query({
      seriesId,
      entityId: locationId,
      type: 'location_backdrop',
      tags: [locationId, zoneId],
    });
    if (backdropCandidates.length > 0) {
      establishingBackdrop = backdropCandidates.find((a) => a.status === 'approved_canon') ?? backdropCandidates[0];
    }

    // 2. Resolve multi-plane depth layers
    const layers = this.layerManager.getLayers(seriesId, locationId, zoneId);

    // 3. Resolve lighting preset
    let lightingPreset: LightingPreset | undefined;
    const shotMood = shot.lighting.mood;
    if (shotMood && shotMood.includes('noir')) {
      lightingPreset = this.lightingLib.get('noir_chiaroscuro');
    } else if (shotMood && shotMood.includes('warm')) {
      lightingPreset = this.lightingLib.get('golden_hour');
    } else {
      lightingPreset = this.lightingLib.get('high_noon');
    }

    // 4. Resolve atmosphere preset
    let atmospherePreset: AtmospherePreset | undefined;
    const shotLighting = shot.lighting as any;
    if (
      shotLighting.fogAtmosphere ||
      shotLighting.atmosphere?.includes('fog') ||
      shotLighting.mood?.includes('fog') ||
      shotLighting.mood?.includes('hazy')
    ) {
      atmospherePreset = this.atmosphereLib.get('dense_fog');
    } else {
      atmospherePreset = this.atmosphereLib.get('clear_day');
    }

    // 5. Check spatial memory and visible anchors
    const sceneMap = this.spatialMemory.getOrCreateSceneMap(seriesId, locationId, zoneId, location?.name);
    const spatialCheck = this.spatialMemory.verifySpatialContinuity(sceneMap, shot.camera);
    const visibleAnchors = spatialCheck.visibleAnchors;

    // 6. Get active props in the zone
    const activeProps = this.propTracker.getProps(seriesId, locationId, zoneId);

    return {
      shotId: shot.id,
      locationId,
      zoneId,
      establishingBackdrop,
      layers,
      lightingPreset,
      atmospherePreset,
      visibleAnchors,
      activeProps,
    };
  }
}
