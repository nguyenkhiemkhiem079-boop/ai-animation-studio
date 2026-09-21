import { ShotContract, ActingIntent } from '../domain/director.js';
import { AssetDescriptor, TurnaroundView } from '../domain/asset.js';
import { CharacterDNA } from '../domain/universe.js';
import { AssetResolver } from './asset-resolver.js';

export interface SubjectReferenceBinding {
  characterId: string;
  characterName: string;
  roles: {
    CHARACTER_IDENTITY: AssetDescriptor;
    CHARACTER_POSE?: AssetDescriptor;
    OUTFIT?: AssetDescriptor;
    EXPRESSION?: AssetDescriptor;
  };
}

export interface ShotCharacterReferencePacket {
  shotId: string;
  bindings: SubjectReferenceBinding[];
}

export class CharacterReferenceResolver {
  constructor(private assetResolver: AssetResolver) {}

  public async resolveReferencesForShot(
    shot: ShotContract,
    characters: Map<string, CharacterDNA>
  ): Promise<ShotCharacterReferencePacket> {
    const bindings: SubjectReferenceBinding[] = [];

    for (const actor of shot.acting) {
      const character = characters.get(actor.characterId);
      if (!character) continue;

      // 1. Resolve Identity Reference (Front or Turnaround matching camera angle if available)
      const identityView: TurnaroundView = this.mapCameraAngleToView(shot.camera.angle);
      const identityRes = await this.assetResolver.resolveCharacterAsset({
        character,
        view: identityView,
      });

      // 2. Resolve Expression Reference if specified
      let expressionRes: AssetDescriptor | undefined;
      const expressionName = actor.expression || 'neutral';
      if (expressionName) {
        const exprResult = await this.assetResolver.resolveCharacterAsset({
          character,
          expression: expressionName,
        });
        expressionRes = exprResult.asset;
      }

      // 3. Resolve Pose Reference
      const poseName = actor.pose || this.inferPoseFromShot(shot, actor);
      const poseRes = await this.assetResolver.resolveCharacterAsset({
        character,
        pose: poseName,
        view: identityView,
      });

      // 4. Resolve Outfit Reference if specified
      let outfitRes: AssetDescriptor | undefined;
      const outfitId = actor.outfitId || character.outfits[0]?.id;
      if (outfitId) {
        const outResult = await this.assetResolver.resolveCharacterAsset({
          character,
          outfitId,
        });
        outfitRes = outResult.asset;
      }

      bindings.push({
        characterId: character.id,
        characterName: character.name,
        roles: {
          CHARACTER_IDENTITY: identityRes.asset,
          CHARACTER_POSE: poseRes.asset,
          OUTFIT: outfitRes,
          EXPRESSION: expressionRes,
        },
      });
    }

    return {
      shotId: shot.id,
      bindings,
    };
  }

  private mapCameraAngleToView(angle: string): TurnaroundView {
    switch (angle) {
      case 'profile_left':
      case 'side_left':
        return 'profile_left';
      case 'profile_right':
      case 'side_right':
        return 'profile_right';
      case 'three_quarter_left':
        return 'three_quarter_left';
      case 'three_quarter_right':
        return 'three_quarter_right';
      case 'back':
      case 'over_the_shoulder':
        return 'back';
      case 'front':
      case 'eye_level':
      default:
        return 'front';
    }
  }

  private inferPoseFromShot(shot: ShotContract, actor: ActingIntent): string {
    const cue = (actor.actionPrompt ?? actor.pose ?? '').toLowerCase();
    if (cue.includes('walk')) return 'walking';
    if (cue.includes('run')) return 'running';
    if (cue.includes('sit')) return 'idle_seated';
    if (cue.includes('point')) return 'pointing';
    if (cue.includes('fight') || cue.includes('combat')) return 'combat_ready';
    return 'idle_standing';
  }
}
