import {
  CharacterRig,
  BoneName,
  DigitalActorTrack,
  RigKeyframe,
} from '../domain/character-animation.js';

export interface RigCompilationResult {
  domHtml: string;
  gsapScript: string;
}

export class RigToHyperFramesCompiler {
  public compileTrackToHyperFrames(track: DigitalActorTrack): RigCompilationResult {
    const actorId = `actor_${track.characterId}`;
    const domLines: string[] = [
      `<!-- Digital Actor: ${track.characterId} (${track.clipName}) -->`,
      `<div id="${actorId}" class="digital-actor" style="position:absolute;inset:0;pointer-events:none;">`,
      `  <div id="${actorId}_torso" class="actor-limb limb-torso" style="position:absolute;width:60px;height:90px;background:#334155;border-radius:10px;">`,
      `    <div id="${actorId}_head" class="actor-limb limb-head" style="position:absolute;top:-45px;left:10px;width:40px;height:45px;background:#f8fafc;border-radius:50%;border:2px solid #0f172a;">`,
      `      <div id="${actorId}_eyes" class="actor-feature feature-eyes" style="position:absolute;top:15px;left:8px;width:24px;height:6px;background:#0284c7;border-radius:3px;"></div>`,
      `      <div id="${actorId}_mouth" class="actor-feature feature-mouth" style="position:absolute;bottom:8px;left:14px;width:12px;height:4px;background:#e11d48;border-radius:2px;"></div>`,
      `    </div>`,
      `    <div id="${actorId}_upper_arm_L" class="actor-limb limb-arm-L" style="position:absolute;top:10px;left:-15px;width:14px;height:45px;background:#475569;border-radius:6px;transform-origin:top center;"></div>`,
      `    <div id="${actorId}_upper_arm_R" class="actor-limb limb-arm-R" style="position:absolute;top:10px;right:-15px;width:14px;height:45px;background:#475569;border-radius:6px;transform-origin:top center;"></div>`,
      `    <div id="${actorId}_upper_leg_L" class="actor-limb limb-leg-L" style="position:absolute;bottom:-55px;left:5px;width:18px;height:55px;background:#1e293b;border-radius:6px;transform-origin:top center;"></div>`,
      `    <div id="${actorId}_upper_leg_R" class="actor-limb limb-leg-R" style="position:absolute;bottom:-55px;right:5px;width:18px;height:55px;background:#1e293b;border-radius:6px;transform-origin:top center;"></div>`,
      `  </div>`,
      `</div>`,
    ];

    const gsapLines: string[] = [
      `  // Digital Actor Animation: ${track.characterId} (${track.clipName})`,
    ];

    // Build timeline tweens from sampled keyframes
    const keyframes = track.sampledKeyframes;
    for (let i = 0; i < keyframes.length; i++) {
      const kf = keyframes[i];
      const time = kf.timeSeconds;

      // Animate limb rotations if available
      const bones = kf.boneTransforms;
      if (bones.upper_arm_L) {
        gsapLines.push(
          `  tl.to("#${actorId}_upper_arm_L", { rotation: ${bones.upper_arm_L.rotation}, duration: 0.15, ease: "sine.inOut" }, ${time});`
        );
      }
      if (bones.upper_arm_R) {
        gsapLines.push(
          `  tl.to("#${actorId}_upper_arm_R", { rotation: ${bones.upper_arm_R.rotation}, duration: 0.15, ease: "sine.inOut" }, ${time});`
        );
      }
      if (bones.upper_leg_L) {
        gsapLines.push(
          `  tl.to("#${actorId}_upper_leg_L", { rotation: ${bones.upper_leg_L.rotation}, duration: 0.15, ease: "sine.inOut" }, ${time});`
        );
      }
      if (bones.upper_leg_R) {
        gsapLines.push(
          `  tl.to("#${actorId}_upper_leg_R", { rotation: ${bones.upper_leg_R.rotation}, duration: 0.15, ease: "sine.inOut" }, ${time});`
        );
      }

      // Facial / Lip-sync animations
      if (kf.facialState) {
        if (kf.facialState.mouthShape) {
          const height = kf.facialState.mouthShape === 'rest' ? 2 : 8;
          gsapLines.push(
            `  tl.to("#${actorId}_mouth", { height: ${height}, duration: 0.08, ease: "power1.out" }, ${time});`
          );
        }
        if (kf.facialState.blinkState) {
          const scaleY = kf.facialState.blinkState === 'closed' ? 0.1 : (kf.facialState.blinkState === 'half' ? 0.5 : 1.0);
          gsapLines.push(
            `  tl.to("#${actorId}_eyes", { scaleY: ${scaleY}, duration: 0.05 }, ${time});`
          );
        }
      }
    }

    return {
      domHtml: domLines.join('\n'),
      gsapScript: gsapLines.join('\n'),
    };
  }
}
