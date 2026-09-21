import {
  AnimationClip,
  BoneName,
  BoneTransform,
  RigKeyframe,
} from '../domain/character-animation.js';

export class AnimationBlender {
  public sampleClip(clip: AnimationClip, timeSeconds: number): RigKeyframe {
    if (clip.keyframes.length === 0) {
      return { timeSeconds, boneTransforms: {} };
    }
    if (clip.keyframes.length === 1) {
      return clip.keyframes[0];
    }

    let t = timeSeconds;
    if (clip.loop && clip.durationSeconds > 0) {
      t = timeSeconds % clip.durationSeconds;
    } else {
      t = Math.min(Math.max(0, timeSeconds), clip.durationSeconds);
    }

    // Find surrounding keyframes
    let kfPrev = clip.keyframes[0];
    let kfNext = clip.keyframes[clip.keyframes.length - 1];

    for (let i = 0; i < clip.keyframes.length - 1; i++) {
      if (clip.keyframes[i].timeSeconds <= t && clip.keyframes[i + 1].timeSeconds >= t) {
        kfPrev = clip.keyframes[i];
        kfNext = clip.keyframes[i + 1];
        break;
      }
    }

    const span = kfNext.timeSeconds - kfPrev.timeSeconds;
    const factor = span > 0 ? (t - kfPrev.timeSeconds) / span : 0;

    return this.blendKeyframes(kfPrev, kfNext, factor, t);
  }

  public blendKeyframes(
    kfA: RigKeyframe,
    kfB: RigKeyframe,
    factor: number,
    targetTime: number = 0
  ): RigKeyframe {
    const clampedFactor = Math.min(Math.max(0, factor), 1.0);
    const allBones = new Set([
      ...Object.keys(kfA.boneTransforms),
      ...Object.keys(kfB.boneTransforms),
    ]) as Set<BoneName>;

    const blendedTransforms: Partial<Record<BoneName, BoneTransform>> = {};

    for (const bone of allBones) {
      const transA = kfA.boneTransforms[bone] ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
      const transB = kfB.boneTransforms[bone] ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

      blendedTransforms[bone] = {
        x: transA.x + (transB.x - transA.x) * clampedFactor,
        y: transA.y + (transB.y - transA.y) * clampedFactor,
        rotation: transA.rotation + (transB.rotation - transA.rotation) * clampedFactor,
        scaleX: transA.scaleX + (transB.scaleX - transA.scaleX) * clampedFactor,
        scaleY: transA.scaleY + (transB.scaleY - transA.scaleY) * clampedFactor,
      };
    }

    return {
      timeSeconds: targetTime,
      boneTransforms: blendedTransforms as Record<BoneName, BoneTransform>,
      facialState: clampedFactor >= 0.5 ? kfB.facialState : kfA.facialState,
    };
  }
}
