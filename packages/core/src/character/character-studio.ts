import {
  AssetDescriptor,
  CharacterAssetManifest,
  CharacterAssetManifestSchema,
  IdentityLock,
  IdentityQAResult,
  TurnaroundView,
} from '../domain/asset.js';
import { CharacterDNA } from '../domain/universe.js';
import { ShotContract } from '../domain/director.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { UniverseManager } from '../universe/index.js';
import { CanonicalCharacterSheet, REQUIRED_TURNAROUND_VIEWS } from './character-sheet.js';
import { CharacterAssetFactory } from './character-asset-factory.js';
import { AssetResolver, ResolutionResult, ResolveAssetRequest } from './asset-resolver.js';
import { CharacterReferenceResolver, ShotCharacterReferencePacket } from './character-reference-resolver.js';
import { ExpressionLibrary, PoseLibrary, OutfitLibrary } from './libraries.js';
import { IdentityQAEvaluator } from './identity-qa.js';
import { NotFoundError, ValidationError } from '../errors/index.js';

export class CharacterStudio {
  private assetFactory: CharacterAssetFactory;
  private assetResolver: AssetResolver;
  private referenceResolver: CharacterReferenceResolver;
  private expressionLib = ExpressionLibrary.createDefault();
  private poseLib = PoseLibrary.createDefault();
  private outfitLib = new OutfitLibrary();

  constructor(
    private universeManager: UniverseManager,
    private assetRegistry: IAssetRegistry
  ) {
    this.assetFactory = new CharacterAssetFactory(assetRegistry);
    this.assetResolver = new AssetResolver(assetRegistry, this.assetFactory);
    this.referenceResolver = new CharacterReferenceResolver(this.assetResolver);
  }

  public getAssetRegistry(): IAssetRegistry {
    return this.assetRegistry;
  }

  public getAssetFactory(): CharacterAssetFactory {
    return this.assetFactory;
  }

  public getAssetResolver(): AssetResolver {
    return this.assetResolver;
  }

  public getExpressionLibrary(): ExpressionLibrary {
    return this.expressionLib;
  }

  public getPoseLibrary(): PoseLibrary {
    return this.poseLib;
  }

  public getOutfitLibrary(): OutfitLibrary {
    return this.outfitLib;
  }

  public async getOrCreateCharacterSheet(
    seriesId: string,
    characterId: string,
    autoGenerateMissingViews = true
  ): Promise<CanonicalCharacterSheet> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const character = universe.characters[characterId];
    if (!character) {
      throw new NotFoundError(`Character "${characterId}" not found in series "${seriesId}"`);
    }

    const sheet = CanonicalCharacterSheet.create(characterId, {
      version: character.currentVersion,
    });

    // Check existing turnaround assets in registry
    for (const view of REQUIRED_TURNAROUND_VIEWS) {
      const existing = await this.assetRegistry.query({
        seriesId,
        entityId: characterId,
        type: 'character_turnaround',
        tags: [characterId, view],
      });

      const approved = existing.find((a) => a.status === 'approved_canon');
      const candidate = existing.find((a) => a.status === 'candidate');

      if (approved) {
        sheet.setView(view, approved.id);
      } else if (candidate) {
        sheet.setView(view, candidate.id);
      } else if (autoGenerateMissingViews) {
        // Synthesize candidate turnaround view
        const created = await this.assetFactory.createTurnaroundView(character, view);
        sheet.setView(view, created.id);
      }
    }

    // Set front view as neutral portrait if available
    const frontViewAssetId = sheet.getView('front');
    if (frontViewAssetId) {
      sheet.setNeutralPortrait(frontViewAssetId);
    }

    return sheet;
  }

  public async resolveCharacterAsset(request: ResolveAssetRequest): Promise<ResolutionResult> {
    return this.assetResolver.resolveCharacterAsset(request);
  }

  public async resolveShotReferences(
    seriesId: string,
    shot: ShotContract
  ): Promise<ShotCharacterReferencePacket> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const charactersMap = new Map<string, CharacterDNA>();
    for (const actor of shot.acting) {
      const char = universe.characters[actor.characterId];
      if (char) {
        charactersMap.set(char.id, char);
      }
    }

    return this.referenceResolver.resolveReferencesForShot(shot, charactersMap);
  }

  public async runIdentityQA(
    seriesId: string,
    characterId: string,
    assetId: string
  ): Promise<IdentityQAResult> {
    const universe = await this.universeManager.getOrCreateUniverse(seriesId);
    const character = universe.characters[characterId];
    if (!character) {
      throw new NotFoundError(`Character "${characterId}" not found in series "${seriesId}"`);
    }

    const asset = await this.assetRegistry.findById(assetId);
    if (!asset) {
      throw new NotFoundError(`Asset "${assetId}" not found in registry`);
    }

    const identityLock: IdentityLock = {
      characterId: character.id,
      confidenceThreshold: 0.85,
      featureAnchors: {},
    };

    return IdentityQAEvaluator.evaluate(asset, character, identityLock);
  }

  public async approveAsset(assetId: string): Promise<AssetDescriptor> {
    return this.assetRegistry.approveCanon(assetId);
  }

  public async getCharacterManifest(
    seriesId: string,
    characterId: string
  ): Promise<CharacterAssetManifest> {
    const sheet = await this.getOrCreateCharacterSheet(seriesId, characterId, false);
    const allCharAssets = await this.assetRegistry.query({
      seriesId,
      entityId: characterId,
    });

    const poses: Record<string, string> = {};
    const expressions: Record<string, string> = {};
    const views: Record<string, string> = {};
    const outfits: Record<string, string[]> = {};

    for (const asset of allCharAssets) {
      if (asset.type === 'character_turnaround') {
        const viewTag = REQUIRED_TURNAROUND_VIEWS.find((v) => asset.tags.includes(v));
        if (viewTag) views[viewTag] = asset.id;
      } else if (asset.type === 'character_expression') {
        const exprName = (asset.metadata.expression as string) ?? asset.tags[3] ?? asset.name;
        expressions[exprName] = asset.id;
      } else if (asset.type === 'character_pose') {
        const poseName = (asset.metadata.pose as string) ?? asset.tags[3] ?? asset.name;
        poses[poseName] = asset.id;
      } else if (asset.type === 'character_outfit') {
        const outfitName = (asset.metadata.outfitId as string) ?? asset.tags[3] ?? asset.name;
        if (!outfits[outfitName]) outfits[outfitName] = [];
        outfits[outfitName].push(asset.id);
      }
    }

    return CharacterAssetManifestSchema.parse({
      characterId,
      canonicalSheetAssetId: sheet.neutralPortraitAssetId,
      poses,
      expressions,
      views,
      outfits,
      updatedAt: new Date().toISOString(),
    });
  }
}
