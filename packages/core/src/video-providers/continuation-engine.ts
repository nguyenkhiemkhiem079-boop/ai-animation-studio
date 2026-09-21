import { ShotContract } from '../domain/director.js';
import {
  ContinuationPacket,
  VideoGenerationTask,
  VideoGenerationOutput,
  CutType,
} from '../domain/generative-video.js';
import { ReferenceBinding } from '../domain/production.js';

export class ContinuationEngine {
  /**
   * Evaluates sequential continuity between preceding Shot N and target Shot N+1,
   * producing a typed ContinuationPacket with terminal references and anti-bleed rules.
   */
  public buildContinuationPacket(
    precedingShot: ShotContract,
    targetShot: ShotContract,
    precedingOutput?: VideoGenerationOutput
  ): ContinuationPacket {
    const terminalFrameAssetId =
      precedingOutput?.terminalFrameAssetId ?? `FRAME_TERMINAL_${precedingShot.id}`;

    // Determine cut type
    let cutType: CutType = 'continuation';
    const isSameScene = precedingShot.sceneId === targetShot.sceneId;

    if (!isSameScene) {
      cutType = 'direct_cut';
    } else if (
      precedingShot.camera.shotSize !== targetShot.camera.shotSize &&
      precedingShot.acting.length > 0 &&
      targetShot.acting.length > 0 &&
      precedingShot.acting[0].characterId === targetShot.acting[0].characterId
    ) {
      cutType = 'match_cut';
    }

    // Extract subject state from preceding shot acting
    let subjectState: ContinuationPacket['subjectState'];
    if (precedingShot.acting.length > 0) {
      const primaryActor = precedingShot.acting[0];
      const targetActor = targetShot.acting.find(
        (a) => a.characterId === primaryActor.characterId
      );

      if (targetActor) {
        // Character persists across cut
        subjectState = {
          characterId: primaryActor.characterId,
          facingAngleDeg: this.gazeToAngle(primaryActor.gazeDirection),
          normalizedPosition: { x: 0.5, y: 0.5 },
          motionVector: { dx: 0.0, dy: 0.0 },
        };
      }
    }

    // Lighting continuity check
    const lightingPreserved =
      precedingShot.lighting.mood === targetShot.lighting.mood &&
      precedingShot.lighting.colorTemperature === targetShot.lighting.colorTemperature;

    // Anti-bleed directives
    const antiBleedDirectives: string[] = [
      'Preserve character identity and silhouette from start frame without distortion',
      'Maintain visual continuity of background lighting and spatial environment',
      'No sudden pop or disappearance of active scene props across cut boundary',
    ];

    if (!lightingPreserved) {
      antiBleedDirectives.push(
        `Transition lighting smoothly from ${precedingShot.lighting.mood} to ${targetShot.lighting.mood}`
      );
    }

    return {
      precedingShotId: precedingShot.id,
      targetShotId: targetShot.id,
      terminalFrameAssetId,
      cutType,
      subjectState,
      lightingPreserved,
      antiBleedDirectives,
    };
  }

  /**
   * Binds a ContinuationPacket to a VideoGenerationTask, attaching the terminal frame as START_FRAME
   * and updating reference bindings.
   */
  public bindContinuation(
    task: VideoGenerationTask,
    packet: ContinuationPacket
  ): VideoGenerationTask {
    const updatedBindings: ReferenceBinding[] = [...task.referenceBindings];

    // Remove existing START_FRAME if present
    const existingStartIdx = updatedBindings.findIndex((b) => b.role === 'START_FRAME');
    if (existingStartIdx !== -1) {
      updatedBindings.splice(existingStartIdx, 1);
    }

    // Add new START_FRAME reference
    updatedBindings.push({
      role: 'START_FRAME',
      assetId: packet.terminalFrameAssetId,
      weight: 1.0,
      slot: 'continuation_seed',
      antiBleedRules: packet.antiBleedDirectives,
    });

    return {
      ...task,
      startFrameAssetId: packet.terminalFrameAssetId,
      referenceBindings: updatedBindings,
      promptPacket: {
        ...task.promptPacket,
        negativePrompt: this.combineNegativePrompts(
          task.promptPacket.negativePrompt,
          'jump cut, flickering, disconnected lighting, disappearing characters'
        ),
      },
    };
  }

  private gazeToAngle(gaze?: string): number {
    switch (gaze) {
      case 'screen_left':
        return 180;
      case 'screen_right':
        return 0;
      case 'look_up':
        return 90;
      case 'look_down':
        return 270;
      case 'direct_to_camera':
      default:
        return 45;
    }
  }

  private combineNegativePrompts(existing: string, addition: string): string {
    if (!existing) return addition;
    if (existing.includes(addition)) return existing;
    return `${existing}, ${addition}`;
  }
}
