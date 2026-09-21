import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene } from '../domain/director.js';
import { WorldStudio } from './world-studio.js';
import { UniverseManager } from '../universe/index.js';
import { FileSystemAssetRegistry } from '../asset-registry/index.js';
import { ShotEnvironmentReferencePacket } from './location-reference-resolver.js';
import { ValidationError } from '../errors/index.js';

export interface WorldResolutionSummary {
  totalScenes: number;
  totalShots: number;
  totalShotsWithEnvironment: number;
  totalLayersBound: number;
  totalPropsActive: number;
}

export class WorldEnvironmentPipelineStep implements PipelineStep {
  public readonly id = 'world_environment_resolution';
  public readonly name = 'World & Environment Resolution';
  public readonly description =
    'Resolves persistent location backdrops, depth layers, spatial anchors, and prop states for all planned shots.';
  public readonly saveCheckpointAfter = true;

  constructor(private worldStudio?: WorldStudio) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, storage, logger } = context;
    const seriesId = (state.seriesId as string) || 'default_series';

    // 1. Retrieve planned production scenes from Director step
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    if (!productionScenes || !Array.isArray(productionScenes)) {
      throw new ValidationError(
        'Cannot run WorldEnvironmentPipelineStep: "productionScenes" missing from pipeline state. Run Director step first.'
      );
    }

    // 2. Initialize or obtain WorldStudio
    let studio = this.worldStudio;
    if (!studio) {
      const universeManager = new UniverseManager(storage);
      const assetRegistry = new FileSystemAssetRegistry(storage);
      studio = new WorldStudio(universeManager, assetRegistry);
    }

    logger.info(
      `Starting World & Environment Resolution for ${productionScenes.length} scene(s) in series "${seriesId}"...`
    );

    const environmentReferencePackets: Record<string, ShotEnvironmentReferencePacket> = {};
    let totalShotsWithEnvironment = 0;
    let totalLayersBound = 0;
    let totalPropsActive = 0;

    // 3. Process every shot in every scene
    for (const scene of productionScenes) {
      for (const shot of scene.shots) {
        const packet = await studio.resolveEnvironmentForShot(seriesId, shot);
        environmentReferencePackets[shot.id] = packet;

        if (packet.locationId) {
          totalShotsWithEnvironment++;
        }
        totalLayersBound += packet.layers.length;
        totalPropsActive += packet.activeProps.length;
      }
    }

    const summary: WorldResolutionSummary = {
      totalScenes: productionScenes.length,
      totalShots: productionScenes.reduce((acc, s) => acc + s.shots.length, 0),
      totalShotsWithEnvironment,
      totalLayersBound,
      totalPropsActive,
    };

    logger.info(
      `World & Environment Resolution complete. Bound environments for ${totalShotsWithEnvironment} shot(s), ${totalLayersBound} layer(s).`
    );

    return {
      environmentReferencePackets,
      worldResolutionSummary: summary,
    };
  }
}
