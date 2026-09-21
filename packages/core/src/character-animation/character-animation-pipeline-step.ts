import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene } from '../domain/director.js';
import { DigitalActorTrack, RigKeyframe } from '../domain/character-animation.js';
import { CharacterController } from './character-controller.js';
import { CharacterAnimationLibrary } from './animation-library.js';
import { ValidationError } from '../errors/index.js';

export interface CharacterAnimationSummary {
  totalScenes: number;
  totalShots: number;
  totalActorsAnimated: number;
  totalDialogueTracksLipSynced: number;
}

export class CharacterAnimationPipelineStep implements PipelineStep {
  public readonly id = 'character_digital_actor_animation';
  public readonly name = 'Character Digital Actor Animation';
  public readonly description =
    'Synthesizes 2D skeletal rig animation, lip-sync, and facial states for all actors across scene shots.';
  public readonly saveCheckpointAfter = true;

  constructor(private library: CharacterAnimationLibrary = CharacterAnimationLibrary.createDefault()) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;

    // 1. Retrieve production scenes
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    if (!productionScenes || !Array.isArray(productionScenes)) {
      throw new ValidationError(
        'Cannot run CharacterAnimationPipelineStep: "productionScenes" missing from pipeline state. Run Director step first.'
      );
    }

    logger.info(
      `Starting Character Digital Actor Animation across ${productionScenes.length} scene(s)...`
    );

    const digitalActorTracks: Record<string, DigitalActorTrack[]> = {};
    let totalActorsAnimated = 0;
    let totalDialogueTracksLipSynced = 0;

    for (const scene of productionScenes) {
      for (const shot of scene.shots) {
        digitalActorTracks[shot.id] = [];

        for (const act of shot.acting) {
          const controller = new CharacterController(act.characterId);
          const clipName = this.mapPoseToClip(act.pose);
          const duration = shot.frame.durationSeconds;

          controller.playClip(clipName, true);
          controller.setExpression(act.expression || 'neutral');
          controller.setEyeDirection(act.gazeDirection || 'direct_to_camera');

          if (act.dialogueLine) {
            controller.speak(act.dialogueLine, duration);
            totalDialogueTracksLipSynced++;
          }

          // Sample keyframes at 0.25s intervals across shot duration
          const sampledKeyframes: RigKeyframe[] = [];
          const step = 0.25;
          for (let t = 0; t <= duration; t += step) {
            const snapshot = controller.samplePose(t);
            sampledKeyframes.push(snapshot.keyframe);
          }

          const track: DigitalActorTrack = {
            characterId: act.characterId,
            shotId: shot.id,
            clipName,
            durationSeconds: duration,
            loop: true,
            dialogue: act.dialogueLine,
            props: controller.getAttachedProps(),
            sampledKeyframes,
          };

          digitalActorTracks[shot.id].push(track);
          totalActorsAnimated++;
        }
      }
    }

    const summary: CharacterAnimationSummary = {
      totalScenes: productionScenes.length,
      totalShots: productionScenes.reduce((acc, s) => acc + s.shots.length, 0),
      totalActorsAnimated,
      totalDialogueTracksLipSynced,
    };

    logger.info(
      `Character animation synthesis complete. Animated ${totalActorsAnimated} actor track(s) with ${totalDialogueTracksLipSynced} lip-sync speech sequence(s).`
    );

    return {
      digitalActorTracks,
      characterAnimationSummary: summary,
    };
  }

  private mapPoseToClip(pose?: string): string {
    if (!pose) return 'idle';
    const p = pose.toLowerCase();
    if (p.includes('walk')) return 'walk';
    if (p.includes('run') || p.includes('sprint')) return 'run';
    if (p.includes('sit')) return 'sit';
    if (p.includes('point')) return 'point';
    if (p.includes('wave')) return 'wave';
    if (p.includes('combat') || p.includes('fight')) return 'react';
    if (p.includes('fear') || p.includes('scared')) return 'fear';
    if (p.includes('surprise') || p.includes('shock')) return 'surprise';
    if (p.includes('look')) return 'look';
    if (p.includes('pick')) return 'pick_up';
    if (p.includes('hold')) return 'hold';
    return 'idle';
  }
}
