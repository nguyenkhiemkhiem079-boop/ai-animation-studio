import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene } from '../domain/director.js';
import { CharacterStudio } from './character-studio.js';
import { UniverseManager } from '../universe/index.js';
import { FileSystemAssetRegistry, InMemoryAssetRegistry } from '../asset-registry/index.js';
import { ShotCharacterReferencePacket } from './character-reference-resolver.js';
import { ValidationError } from '../errors/index.js';

export interface CharacterResolutionSummary {
  totalScenes: number;
  totalShots: number;
  totalSubjectsResolved: number;
  totalAssetsReused: number;
  totalCandidatesGenerated: number;
}

export class CharacterAssetPipelineStep implements PipelineStep {
  public readonly id = 'character_asset_resolution';
  public readonly name = 'Character & Asset Resolution';
  public readonly description =
    'Resolves canonical character references, turnaround sheets, expressions, and outfits for all planned shots.';
  public readonly saveCheckpointAfter = true;

  constructor(private characterStudio?: CharacterStudio) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, storage, logger } = context;
    const seriesId = (state.seriesId as string) || 'default_series';

    // 1. Retrieve planned production scenes from Director step
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    if (!productionScenes || !Array.isArray(productionScenes)) {
      throw new ValidationError(
        'Cannot run CharacterAssetPipelineStep: "productionScenes" missing from pipeline state. Run Director step first.'
      );
    }

    // 2. Initialize or obtain CharacterStudio
    let studio = this.characterStudio;
    if (!studio) {
      const universeManager = new UniverseManager(storage);
      const assetRegistry = new FileSystemAssetRegistry(storage);
      studio = new CharacterStudio(universeManager, assetRegistry);
    }

    logger.info(
      `Starting Character & Asset Resolution for ${productionScenes.length} scene(s) in series "${seriesId}"...`
    );

    const characterReferencePackets: Record<string, ShotCharacterReferencePacket> = {};
    let totalSubjectsResolved = 0;
    let totalCandidatesGenerated = 0;

    // 3. Process every shot in every scene
    for (const scene of productionScenes) {
      for (const shot of scene.shots) {
        const packet = await studio.resolveShotReferences(seriesId, shot);
        characterReferencePackets[shot.id] = packet;
        totalSubjectsResolved += packet.bindings.length;

        for (const binding of packet.bindings) {
          if (binding.roles.CHARACTER_IDENTITY.status === 'candidate') {
            totalCandidatesGenerated++;
          }
        }
      }
    }

    const totalAssetsReused = studio.getAssetResolver().getReuseEngine().getTotalReuses();

    const summary: CharacterResolutionSummary = {
      totalScenes: productionScenes.length,
      totalShots: productionScenes.reduce((acc, s) => acc + s.shots.length, 0),
      totalSubjectsResolved,
      totalAssetsReused,
      totalCandidatesGenerated,
    };

    logger.info(
      `Character & Asset Resolution complete. Resolved ${totalSubjectsResolved} subject instance(s), ${totalAssetsReused} asset reuse(s).`
    );

    return {
      characterReferencePackets,
      characterResolutionSummary: summary,
    };
  }
}
