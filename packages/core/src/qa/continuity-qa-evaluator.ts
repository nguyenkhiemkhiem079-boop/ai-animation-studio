import { ShotContract } from '../domain/director.js';
import { TimelineSequence } from '../domain/timeline.js';
import {
  ContinuityCheckResult,
  ContinuityQAReport,
} from '../domain/qa.js';

export interface EvaluateContinuityOptions {
  projectId: string;
  sceneId?: string;
  shots: ShotContract[];
  timelineSequence?: TimelineSequence;
}

export class ContinuityQAEvaluator {
  /**
   * Evaluates shot-to-shot boundaries and timeline consistency for continuity violations.
   */
  public static evaluate(options: EvaluateContinuityOptions): ContinuityQAReport {
    const { projectId, sceneId, shots, timelineSequence } = options;
    const issues: ContinuityCheckResult[] = [];

    // 1. Evaluate adjacent shots
    for (let i = 0; i < shots.length - 1; i++) {
      const shotA = shots[i];
      const shotB = shots[i + 1];

      // Check 1: 180-Degree Rule & Screen Direction Eyeline
      this.checkScreenDirection(shotA, shotB, issues);

      // Check 2: Lighting & Color Temperature Continuity
      this.checkLightingContinuity(shotA, shotB, issues);

      // Check 3: Prop Persistence
      this.checkPropPersistence(shotA, shotB, issues);

      // Check 4: Wardrobe Continuity
      this.checkWardrobeContinuity(shotA, shotB, issues);
    }

    // Check 5: Pacing & Rhythm Stalling (3+ identical consecutive shot sizes with static camera)
    this.checkPacingStalling(shots, issues);

    // Check 6: Audio Lip-Sync Alignment in TimelineSequence
    if (timelineSequence) {
      this.checkAudioAlignment(timelineSequence, issues);
    }

    const hasCritical = issues.some((iss) => iss.severity === 'critical');

    return {
      reportId: `qa_report_${sceneId ?? projectId}_${Date.now()}`,
      projectId,
      sceneId,
      issues,
      repairActions: [],
      overallPassed: !hasCritical,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private static checkScreenDirection(
    shotA: ShotContract,
    shotB: ShotContract,
    issues: ContinuityCheckResult[]
  ): void {
    if (!shotA.acting || !shotB.acting) return;

    for (const actA of shotA.acting) {
      const actB = shotB.acting.find((b) => b.characterId === actA.characterId);
      if (actB) {
        // Character is in both adjacent shots
        const gazeA = actA.gazeDirection;
        const gazeB = actB.gazeDirection;

        // Abrupt flip from left to right without neutral eyeline or camera move
        if (
          (gazeA === 'screen_left' && gazeB === 'screen_right') ||
          (gazeA === 'screen_right' && gazeB === 'screen_left')
        ) {
          const hasCameraMovement =
            shotB.camera?.movement &&
            shotB.camera.movement !== 'static' &&
            shotB.camera.movement.includes('orbit');

          if (!hasCameraMovement) {
            issues.push({
              issueId: `iss_180_${shotA.id}_${shotB.id}`,
              shotId: shotB.id,
              relatedShotId: shotA.id,
              type: 'screen_direction_180',
              severity: 'warning',
              message: `Character "${actA.characterId}" abruptly flipped gaze direction from ${gazeA} in ${shotA.id} to ${gazeB} in ${shotB.id} without camera repositioning.`,
              suggestedFix:
                'Insert a neutral reaction/cutaway buffer shot, or soften with a cross dissolve or match cut.',
              autoRepairable: true,
              metadata: { characterId: actA.characterId, gazeA, gazeB },
            });
          }
        }
      }
    }
  }

  private static checkLightingContinuity(
    shotA: ShotContract,
    shotB: ShotContract,
    issues: ContinuityCheckResult[]
  ): void {
    // Only compare if in same environment/zone
    if (
      shotA.environmentLocationId &&
      shotB.environmentLocationId &&
      shotA.environmentLocationId === shotB.environmentLocationId
    ) {
      const colorA = shotA.lighting?.colorTemperature;
      const colorB = shotB.lighting?.colorTemperature;

      if (colorA && colorB && colorA !== colorB) {
        const isJarring =
          (colorA === 'warm' && colorB === 'cool') || (colorA === 'cool' && colorB === 'warm');

        if (isJarring) {
          issues.push({
            issueId: `iss_light_${shotA.id}_${shotB.id}`,
            shotId: shotB.id,
            relatedShotId: shotA.id,
            type: 'lighting_jump',
            severity: 'warning',
            message: `Color temperature shift from "${colorA}" in ${shotA.id} to "${colorB}" in ${shotB.id} within the same location.`,
            suggestedFix: 'Harmonize lighting color temperature or apply cross-dissolve color grade transition.',
            autoRepairable: true,
            metadata: { colorA, colorB },
          });
        }
      }
    }
  }

  private static checkPropPersistence(
    shotA: ShotContract,
    shotB: ShotContract,
    issues: ContinuityCheckResult[]
  ): void {
    if (!shotA.acting || !shotB.acting) return;

    for (const actA of shotA.acting) {
      const actB = shotB.acting.find((b) => b.characterId === actA.characterId);
      if (actB) {
        // Detect if shot A indicates holding a prop (e.g. pose: "holding_key" or action: "holding plasma rifle")
        const holdingA =
          actA.pose?.includes('hold') ||
          actA.actionPrompt?.toLowerCase().includes('holding') ||
          actA.actionPrompt?.toLowerCase().includes('carrying');

        const droppedB =
          actB.actionPrompt?.toLowerCase().includes('dropped') ||
          actB.actionPrompt?.toLowerCase().includes('put down');

        if (holdingA && !droppedB) {
          const stillHoldingB =
            actB.pose?.includes('hold') ||
            actB.actionPrompt?.toLowerCase().includes('holding') ||
            actB.actionPrompt?.toLowerCase().includes('carrying');

          if (!stillHoldingB) {
            issues.push({
              issueId: `iss_prop_${shotA.id}_${shotB.id}`,
              shotId: shotB.id,
              relatedShotId: shotA.id,
              type: 'prop_persistence',
              severity: 'info',
              message: `Character "${actA.characterId}" was holding a prop in ${shotA.id} but prop state is unspecified in ${shotB.id}.`,
              suggestedFix: 'Explicitly anchor prop in character pose or specify drop/stow action.',
              autoRepairable: false,
              metadata: { characterId: actA.characterId },
            });
          }
        }
      }
    }
  }

  private static checkWardrobeContinuity(
    shotA: ShotContract,
    shotB: ShotContract,
    issues: ContinuityCheckResult[]
  ): void {
    if (!shotA.acting || !shotB.acting) return;

    for (const actA of shotA.acting) {
      const actB = shotB.acting.find((b) => b.characterId === actA.characterId);
      if (actB && actA.outfitId && actB.outfitId && actA.outfitId !== actB.outfitId) {
        issues.push({
          issueId: `iss_outfit_${shotA.id}_${shotB.id}`,
          shotId: shotB.id,
          relatedShotId: shotA.id,
          type: 'wardrobe_mismatch',
          severity: 'critical',
          message: `Character "${actA.characterId}" changed outfit from "${actA.outfitId}" in ${shotA.id} to "${actB.outfitId}" in ${shotB.id} without an intervening scene transition.`,
          suggestedFix: 'Lock character outfit across consecutive shots in the same scene.',
          autoRepairable: true,
          metadata: { characterId: actA.characterId, outfitA: actA.outfitId, outfitB: actB.outfitId },
        });
      }
    }
  }

  private static checkPacingStalling(shots: ShotContract[], issues: ContinuityCheckResult[]): void {
    let consecutiveSame = 1;

    for (let i = 0; i < shots.length - 1; i++) {
      const current = shots[i];
      const next = shots[i + 1];

      const sameSize =
        current.camera?.shotSize &&
        next.camera?.shotSize &&
        current.camera.shotSize === next.camera.shotSize;

      const isStatic =
        (!current.camera?.movement || current.camera.movement === 'static') &&
        (!next.camera?.movement || next.camera.movement === 'static');

      if (sameSize && isStatic) {
        consecutiveSame++;
        if (consecutiveSame >= 3) {
          issues.push({
            issueId: `iss_pacing_${current.id}_${next.id}`,
            shotId: next.id,
            type: 'pacing_stalling',
            severity: 'info',
            message: `Three or more consecutive shots share identical shot size "${current.camera?.shotSize}" with static camera.`,
            suggestedFix: 'Vary camera shot size (e.g. cut to wide or over-the-shoulder) or introduce dynamic camera movement.',
            autoRepairable: true,
            metadata: { consecutiveCount: consecutiveSame, shotSize: current.camera?.shotSize },
          });
        }
      } else {
        consecutiveSame = 1;
      }
    }
  }

  private static checkAudioAlignment(
    sequence: TimelineSequence,
    issues: ContinuityCheckResult[]
  ): void {
    const videoTrack = sequence.tracks.find((t) => t.trackType === 'video');
    const dialogueTrack = sequence.tracks.find((t) => t.trackType === 'audio_dialogue');

    if (!videoTrack || !dialogueTrack) return;

    for (const dialClip of dialogueTrack.clips) {
      const matchingVideo = videoTrack.clips.find(
        (v) =>
          dialClip.startTime >= v.startTime &&
          dialClip.startTime < v.startTime + v.duration
      );

      if (matchingVideo) {
        const videoEnd = matchingVideo.startTime + matchingVideo.duration;
        const dialEnd = dialClip.startTime + dialClip.duration;

        // Dialogue extends past video clip by more than 0.5s into next shot
        if (dialEnd > videoEnd + 0.5) {
          issues.push({
            issueId: `iss_audio_desync_${dialClip.clipId}`,
            shotId: matchingVideo.clipId,
            type: 'lip_sync_desync',
            severity: 'warning',
            message: `Dialogue clip "${dialClip.name}" extends ${(dialEnd - videoEnd).toFixed(2)}s beyond shot "${matchingVideo.name}" boundary.`,
            suggestedFix: 'Extend shot duration or trim/re-time dialogue clip to preserve lip-sync boundary.',
            autoRepairable: true,
            metadata: { overhangSeconds: dialEnd - videoEnd },
          });
        }
      }
    }
  }
}
