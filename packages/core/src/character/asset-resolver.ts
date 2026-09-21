import {
  AssetDescriptor,
  TurnaroundView,
  IdentityLock,
  IdentityQAResult,
} from '../domain/asset.js';
import { CharacterDNA } from '../domain/universe.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { CharacterAssetFactory } from './character-asset-factory.js';
import { IdentityQAEvaluator } from './identity-qa.js';

export interface ResolveAssetRequest {
  character: CharacterDNA;
  identityLock?: IdentityLock;
  view?: TurnaroundView;
  expression?: string;
  pose?: string;
  outfitId?: string;
  autoApproveOnPass?: boolean;
}

export type ResolutionSource = 'REUSED' | 'GENERATED_CANDIDATE' | 'GENERATED_AND_APPROVED';

export interface ResolutionResult {
  asset: AssetDescriptor;
  source: ResolutionSource;
  qaResult?: IdentityQAResult;
}

export class AssetReuseEngine {
  private reuseStats = new Map<string, { count: number; lastReusedAt: string }>();

  public recordReuse(assetId: string): void {
    const current = this.reuseStats.get(assetId) ?? { count: 0, lastReusedAt: '' };
    this.reuseStats.set(assetId, {
      count: current.count + 1,
      lastReusedAt: new Date().toISOString(),
    });
  }

  public getStats(assetId: string): { count: number; lastReusedAt: string } | undefined {
    return this.reuseStats.get(assetId);
  }

  public getTotalReuses(): number {
    let total = 0;
    for (const stat of this.reuseStats.values()) {
      total += stat.count;
    }
    return total;
  }
}

export class AssetResolver {
  private reuseEngine = new AssetReuseEngine();

  constructor(
    private assetRegistry: IAssetRegistry,
    private assetFactory: CharacterAssetFactory
  ) {}

  public getReuseEngine(): AssetReuseEngine {
    return this.reuseEngine;
  }

  public async resolveCharacterAsset(request: ResolveAssetRequest): Promise<ResolutionResult> {
    const { character, view, expression, pose, outfitId, autoApproveOnPass = true } = request;
    const seriesId = character.seriesId;

    // 1. Build query tags to search Asset Registry
    const queryTags: string[] = [character.id];
    if (view) queryTags.push(view);
    if (expression) queryTags.push(expression.toLowerCase());
    if (pose) queryTags.push(pose.toLowerCase());
    if (outfitId) queryTags.push(outfitId.toLowerCase());

    const existingCandidates = await this.assetRegistry.query({
      seriesId,
      entityId: character.id,
      version: character.currentVersion,
      tags: queryTags,
    });

    // 2. Check if an approved canon asset already exists
    const approved = existingCandidates.find((a) => a.status === 'approved_canon');
    if (approved) {
      this.reuseEngine.recordReuse(approved.id);
      return {
        asset: approved,
        source: 'REUSED',
      };
    }

    // 3. Check if an existing candidate already exists
    const existingCandidate = existingCandidates.find((a) => a.status === 'candidate');
    if (existingCandidate) {
      this.reuseEngine.recordReuse(existingCandidate.id);
      return {
        asset: existingCandidate,
        source: 'REUSED',
      };
    }

    // 4. If not found -> Generate candidate via CharacterAssetFactory
    let newAsset: AssetDescriptor;
    if (view) {
      newAsset = await this.assetFactory.createTurnaroundView(character, view, {
        tags: queryTags,
      });
    } else if (expression) {
      newAsset = await this.assetFactory.createExpressionAsset(character, expression, {
        tags: queryTags,
      });
    } else if (pose) {
      newAsset = await this.assetFactory.createPoseAsset(character, pose, view ?? 'front', {
        tags: queryTags,
      });
    } else if (outfitId) {
      newAsset = await this.assetFactory.createOutfitAsset(character, outfitId, {
        tags: queryTags,
      });
    } else {
      // Default to turnaround front view
      newAsset = await this.assetFactory.createTurnaroundView(character, 'front', {
        tags: queryTags,
      });
    }

    // 5. Run Identity QA against character IdentityLock
    const lock: IdentityLock = request.identityLock ?? {
      characterId: character.id,
      confidenceThreshold: 0.85,
      featureAnchors: {},
    };
    const qaResult = IdentityQAEvaluator.evaluate(newAsset, character, lock);

    // 6. If QA passes and autoApprove is requested, promote to approved_canon
    if (qaResult.passed && autoApproveOnPass) {
      const approvedAsset = await this.assetRegistry.approveCanon(newAsset.id);
      return {
        asset: approvedAsset,
        source: 'GENERATED_AND_APPROVED',
        qaResult,
      };
    }

    return {
      asset: newAsset,
      source: 'GENERATED_CANDIDATE',
      qaResult,
    };
  }
}
