import {
  SceneMap,
  SpatialAnchor,
  EnvironmentLayer,
  PropPlacement,
  PropState,
  LocationReferenceSet,
  LocationReferenceSetSchema,
} from '../domain/world.js';
import { AssetDescriptor } from '../domain/asset.js';
import { ShotContract } from '../domain/director.js';
import { LocationDNA } from '../domain/universe.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { UniverseManager } from '../universe/index.js';
import { SpatialMemory } from './spatial-memory.js';
import { EnvironmentLayerManager } from './environment-layers.js';
import { LightingLibrary, AtmosphereLibrary } from './presets.js';
import { PropPlacementTracker } from './prop-tracker.js';
import { LocationReferenceResolver, ShotEnvironmentReferencePacket } from './location-reference-resolver.js';
import { NotFoundError } from '../errors/index.js';

export class WorldStudio {
  private spatialMemory = new SpatialMemory();
  private layerManager = new EnvironmentLayerManager();
  private lightingLib = LightingLibrary.createDefault();
  private atmosphereLib = AtmosphereLibrary.createDefault();
  private propTracker = new PropPlacementTracker();
  private referenceResolver: LocationReferenceResolver;

  constructor(
    private universeManager: UniverseManager,
    private assetRegistry: IAssetRegistry
  ) {
    this.referenceResolver = new LocationReferenceResolver(
      this.assetRegistry,
      this.spatialMemory,
      this.layerManager,
      this.lightingLib,
      this.atmosphereLib,
      this.propTracker
    );
  }

  public getSpatialMemory(): SpatialMemory {
    return this.spatialMemory;
  }

  public getLayerManager(): EnvironmentLayerManager {
    return this.layerManager;
  }

  public getLightingLibrary(): LightingLibrary {
    return this.lightingLib;
  }

  public getAtmosphereLibrary(): AtmosphereLibrary {
    return this.atmosphereLib;
  }

  public getPropTracker(): PropPlacementTracker {
    return this.propTracker;
  }

  public async getOrCreateSceneMap(
    seriesId: string,
    locationId: string,
    zoneId: string,
    name?: string
  ): Promise<SceneMap> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const location = universe.locations[locationId];
    if (!location) {
      throw new NotFoundError(`Location "${locationId}" not found in series "${seriesId}"`);
    }

    return this.spatialMemory.getOrCreateSceneMap(seriesId, locationId, zoneId, name ?? location.name);
  }

  public addSpatialAnchor(
    seriesId: string,
    locationId: string,
    zoneId: string,
    anchor: SpatialAnchor
  ): SpatialAnchor {
    return this.spatialMemory.addAnchor(seriesId, locationId, zoneId, anchor);
  }

  public addEnvironmentLayer(
    seriesId: string,
    locationId: string,
    zoneId: string,
    layer: EnvironmentLayer
  ): EnvironmentLayer {
    return this.layerManager.addLayer(seriesId, locationId, zoneId, layer);
  }

  public placeProp(
    seriesId: string,
    locationId: string,
    zoneId: string,
    placement: PropPlacement
  ): PropPlacement {
    return this.propTracker.placeProp(seriesId, locationId, zoneId, placement);
  }

  public mutatePropState(
    seriesId: string,
    locationId: string,
    zoneId: string,
    propId: string,
    newState: PropState,
    shotId?: string
  ): PropPlacement {
    return this.propTracker.mutatePropState(seriesId, locationId, zoneId, propId, newState, shotId);
  }

  public async resolveEnvironmentForShot(
    seriesId: string,
    shot: ShotContract
  ): Promise<ShotEnvironmentReferencePacket> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const locationsMap = new Map<string, LocationDNA>();
    for (const [id, loc] of Object.entries(universe.locations)) {
      locationsMap.set(id, loc);
    }

    return this.referenceResolver.resolveEnvironmentForShot(seriesId, shot, locationsMap);
  }

  public async registerBackdropAsset(
    seriesId: string,
    locationId: string,
    zoneId: string,
    options: {
      name?: string;
      contentHash: string;
      storageUri: string;
      status?: 'candidate' | 'approved_canon';
    }
  ): Promise<AssetDescriptor> {
    const assetId = `ASSET_LOC_${locationId}_${zoneId.toUpperCase()}_BG`;
    return this.assetRegistry.register({
      id: assetId,
      seriesId,
      entityId: locationId,
      type: 'location_backdrop',
      status: options.status ?? 'approved_canon',
      name: options.name ?? `${locationId} ${zoneId} Backdrop`,
      contentHash: options.contentHash,
      storageUri: options.storageUri,
      mimeType: 'image/png',
      sizeBytes: 2048 * 1024,
      version: 1,
      tags: [locationId, zoneId, 'backdrop', 'environment'],
      metadata: { locationId, zoneId },
    });
  }

  public async getLocationReferenceSet(
    seriesId: string,
    locationId: string,
    zoneId: string
  ): Promise<LocationReferenceSet> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const location = universe.locations[locationId];
    if (!location) {
      throw new NotFoundError(`Location "${locationId}" not found in series "${seriesId}"`);
    }

    const backdrops = await this.assetRegistry.query({
      seriesId,
      entityId: locationId,
      type: 'location_backdrop',
      tags: [locationId, zoneId],
    });

    const wideEstablishingAssetId = backdrops[0]?.id;
    const layers = this.layerManager.getLayers(seriesId, locationId, zoneId);

    const lightingMap: Record<string, any> = {};
    for (const p of this.lightingLib.list()) {
      lightingMap[p.id] = p;
    }

    const atmosphereMap: Record<string, any> = {};
    for (const a of this.atmosphereLib.list()) {
      atmosphereMap[a.id] = a;
    }

    return LocationReferenceSetSchema.parse({
      locationId,
      zoneId,
      wideEstablishingAssetId,
      layers,
      lightingPresets: lightingMap,
      atmospherePresets: atmosphereMap,
      updatedAt: new Date().toISOString(),
    });
  }
}
