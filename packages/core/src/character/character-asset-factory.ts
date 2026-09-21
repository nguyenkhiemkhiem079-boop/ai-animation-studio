import * as crypto from 'node:crypto';
import {
  AssetDescriptor,
  AssetType,
  TurnaroundView,
} from '../domain/asset.js';
import { CharacterDNA } from '../domain/universe.js';
import { IAssetRegistry } from '../asset-registry/index.js';

export interface CreateAssetCandidateOptions {
  tags?: string[];
  metadata?: Record<string, unknown>;
  storageUri?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export class CharacterAssetFactory {
  constructor(private assetRegistry: IAssetRegistry) {}

  private generateHash(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  public async createTurnaroundView(
    character: CharacterDNA,
    view: TurnaroundView,
    options: CreateAssetCandidateOptions = {}
  ): Promise<AssetDescriptor> {
    const payload = `${character.seriesId}:${character.id}:turnaround:${view}:v${character.currentVersion}`;
    const contentHash = this.generateHash(payload);
    const assetId = `ASSET_TURN_${character.id}_${view.toUpperCase()}_V${character.currentVersion}`;

    const candidate: Omit<AssetDescriptor, 'createdAt'> = {
      id: assetId,
      seriesId: character.seriesId,
      entityId: character.id,
      type: 'character_turnaround',
      status: 'candidate',
      name: `${character.name} Turnaround ${view}`,
      contentHash,
      storageUri: options.storageUri ?? `assets/characters/${character.id}/turnaround_${view}.png`,
      mimeType: options.mimeType ?? 'image/png',
      sizeBytes: options.sizeBytes ?? 1024 * 1024, // 1MB nominal placeholder
      version: character.currentVersion,
      tags: [character.id, character.name, 'turnaround', view, `v${character.currentVersion}`, ...(options.tags ?? [])],
      metadata: {
        view,
        characterName: character.name,
        visualAnchorPrompt: character.visualAnchorPrompt,
        ...(options.metadata ?? {}),
      },
    };

    return this.assetRegistry.register(candidate);
  }

  public async createExpressionAsset(
    character: CharacterDNA,
    expressionName: string,
    options: CreateAssetCandidateOptions = {}
  ): Promise<AssetDescriptor> {
    const normExpr = expressionName.toLowerCase();
    const payload = `${character.seriesId}:${character.id}:expression:${normExpr}:v${character.currentVersion}`;
    const contentHash = this.generateHash(payload);
    const assetId = `ASSET_EXPR_${character.id}_${normExpr.toUpperCase()}_V${character.currentVersion}`;

    const candidate: Omit<AssetDescriptor, 'createdAt'> = {
      id: assetId,
      seriesId: character.seriesId,
      entityId: character.id,
      type: 'character_expression',
      status: 'candidate',
      name: `${character.name} Expression ${expressionName}`,
      contentHash,
      storageUri: options.storageUri ?? `assets/characters/${character.id}/expr_${normExpr}.png`,
      mimeType: options.mimeType ?? 'image/png',
      sizeBytes: options.sizeBytes ?? 512 * 1024,
      version: character.currentVersion,
      tags: [character.id, character.name, 'expression', normExpr, `v${character.currentVersion}`, ...(options.tags ?? [])],
      metadata: {
        expression: normExpr,
        characterName: character.name,
        ...(options.metadata ?? {}),
      },
    };

    return this.assetRegistry.register(candidate);
  }

  public async createPoseAsset(
    character: CharacterDNA,
    poseName: string,
    view: TurnaroundView = 'front',
    options: CreateAssetCandidateOptions = {}
  ): Promise<AssetDescriptor> {
    const normPose = poseName.toLowerCase();
    const payload = `${character.seriesId}:${character.id}:pose:${normPose}:${view}:v${character.currentVersion}`;
    const contentHash = this.generateHash(payload);
    const assetId = `ASSET_POSE_${character.id}_${normPose.toUpperCase()}_V${character.currentVersion}`;

    const candidate: Omit<AssetDescriptor, 'createdAt'> = {
      id: assetId,
      seriesId: character.seriesId,
      entityId: character.id,
      type: 'character_pose',
      status: 'candidate',
      name: `${character.name} Pose ${poseName}`,
      contentHash,
      storageUri: options.storageUri ?? `assets/characters/${character.id}/pose_${normPose}.png`,
      mimeType: options.mimeType ?? 'image/png',
      sizeBytes: options.sizeBytes ?? 768 * 1024,
      version: character.currentVersion,
      tags: [character.id, character.name, 'pose', normPose, view, `v${character.currentVersion}`, ...(options.tags ?? [])],
      metadata: {
        pose: normPose,
        facing: view,
        characterName: character.name,
        ...(options.metadata ?? {}),
      },
    };

    return this.assetRegistry.register(candidate);
  }

  public async createOutfitAsset(
    character: CharacterDNA,
    outfitId: string,
    options: CreateAssetCandidateOptions = {}
  ): Promise<AssetDescriptor> {
    const normOutfit = outfitId.toLowerCase();
    const payload = `${character.seriesId}:${character.id}:outfit:${normOutfit}:v${character.currentVersion}`;
    const contentHash = this.generateHash(payload);
    const assetId = `ASSET_OUTFIT_${character.id}_${normOutfit.toUpperCase()}_V${character.currentVersion}`;

    const candidate: Omit<AssetDescriptor, 'createdAt'> = {
      id: assetId,
      seriesId: character.seriesId,
      entityId: character.id,
      type: 'character_outfit',
      status: 'candidate',
      name: `${character.name} Outfit ${outfitId}`,
      contentHash,
      storageUri: options.storageUri ?? `assets/characters/${character.id}/outfit_${normOutfit}.png`,
      mimeType: options.mimeType ?? 'image/png',
      sizeBytes: options.sizeBytes ?? 1024 * 1024,
      version: character.currentVersion,
      tags: [character.id, character.name, 'outfit', normOutfit, `v${character.currentVersion}`, ...(options.tags ?? [])],
      metadata: {
        outfitId: normOutfit,
        characterName: character.name,
        ...(options.metadata ?? {}),
      },
    };

    return this.assetRegistry.register(candidate);
  }
}
