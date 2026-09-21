import { ShotContract } from '../domain/director.js';
import { TimelineSequence } from '../domain/timeline.js';
import {
  ContinuityCheckResult,
  ContinuityQAReport,
  RepairAction,
  RepairStrategy,
} from '../domain/qa.js';

export interface AutoRepairOptions {
  report: ContinuityQAReport;
  timelineSequence: TimelineSequence;
  shots: ShotContract[];
}

export interface AutoRepairResult {
  repairedSequence: TimelineSequence;
  repairedShots: ShotContract[];
  appliedActions: RepairAction[];
  remainingIssues: ContinuityCheckResult[];
}

export class AutoRepairEngine {
  /**
   * Automatically applies targeted repairs for auto-repairable continuity issues.
   */
  public static repair(options: AutoRepairOptions): AutoRepairResult {
    const { report, timelineSequence, shots } = options;

    // Clone sequence and shots to avoid unexpected mutation
    const seq: TimelineSequence = JSON.parse(JSON.stringify(timelineSequence));
    const modifiedShots: ShotContract[] = JSON.parse(JSON.stringify(shots));

    const appliedActions: RepairAction[] = [];
    const remainingIssues: ContinuityCheckResult[] = [];

    for (const issue of report.issues) {
      if (!issue.autoRepairable) {
        remainingIssues.push(issue);
        continue;
      }

      let repaired = false;

      switch (issue.type) {
        case 'screen_direction_180': {
          // Soften 180-degree flip by converting transition to match cut or cross dissolve
          if (issue.relatedShotId && issue.shotId) {
            const trans = seq.transitions.find(
              (t) =>
                t.fromClipId.includes(issue.relatedShotId!) &&
                t.toClipId.includes(issue.shotId)
            );

            if (trans) {
              trans.type = 'cross_dissolve';
              trans.duration = 0.5;
              appliedActions.push({
                actionId: `act_repair_${issue.issueId}`,
                issueId: issue.issueId,
                strategy: 'insert_transition',
                description: `Softened 180-degree jump between ${issue.relatedShotId} and ${issue.shotId} with a 0.5s cross dissolve.`,
                applied: true,
                timestamp: new Date().toISOString(),
              });
              repaired = true;
            }
          }
          break;
        }

        case 'lighting_jump': {
          // Soften color temperature shift with cross-dissolve transition
          if (issue.relatedShotId && issue.shotId) {
            const trans = seq.transitions.find(
              (t) =>
                t.fromClipId.includes(issue.relatedShotId!) &&
                t.toClipId.includes(issue.shotId)
            );

            if (trans) {
              trans.type = 'cross_dissolve';
              trans.duration = 0.6;
              appliedActions.push({
                actionId: `act_repair_${issue.issueId}`,
                issueId: issue.issueId,
                strategy: 'match_lighting',
                description: `Mitigated lighting jump between ${issue.relatedShotId} and ${issue.shotId} using a 0.6s cross dissolve blend.`,
                applied: true,
                timestamp: new Date().toISOString(),
              });
              repaired = true;
            }
          }
          break;
        }

        case 'wardrobe_mismatch': {
          // Lock character outfit in the subsequent shot
          const meta = issue.metadata as { characterId?: string; outfitA?: string } | undefined;
          if (meta?.characterId && meta.outfitA) {
            const shotB = modifiedShots.find((s) => s.id === issue.shotId);
            if (shotB && shotB.acting) {
              const actB = shotB.acting.find((a) => a.characterId === meta.characterId);
              if (actB) {
                actB.outfitId = meta.outfitA;
                appliedActions.push({
                  actionId: `act_repair_${issue.issueId}`,
                  issueId: issue.issueId,
                  strategy: 'trigger_retake',
                  description: `Synchronized character "${meta.characterId}" outfit in shot ${issue.shotId} to canonical "${meta.outfitA}".`,
                  applied: true,
                  timestamp: new Date().toISOString(),
                });
                repaired = true;
              }
            }
          }
          break;
        }

        case 'pacing_stalling': {
          // Apply subtle digital camera push_in transform to the stalled clip
          const videoTrack = seq.tracks.find((t) => t.trackType === 'video');
          if (videoTrack) {
            const clip = videoTrack.clips.find((c) => c.clipId.includes(issue.shotId));
            if (clip) {
              clip.transform = { scale: 1.08, x: 0, y: 0, rotation: 0 };
              appliedActions.push({
                actionId: `act_repair_${issue.issueId}`,
                issueId: issue.issueId,
                strategy: 'insert_buffer_shot',
                description: `Applied 8% digital push-in transform to shot "${issue.shotId}" to break visual monotony.`,
                applied: true,
                timestamp: new Date().toISOString(),
              });
              repaired = true;
            }
          }
          break;
        }

        case 'lip_sync_desync': {
          // Adjust dialogue timing or extend video clip
          const videoTrack = seq.tracks.find((t) => t.trackType === 'video');
          const dialogueTrack = seq.tracks.find((t) => t.trackType === 'audio_dialogue');

          if (videoTrack && dialogueTrack) {
            const vClip = videoTrack.clips.find((v) => v.clipId === issue.shotId);
            const dClip = dialogueTrack.clips.find((d) => issue.issueId.includes(d.clipId));

            if (vClip && dClip) {
              const overhang = (issue.metadata?.overhangSeconds as number) ?? 0.5;
              vClip.duration += overhang;
              vClip.outPoint += overhang;
              appliedActions.push({
                actionId: `act_repair_${issue.issueId}`,
                issueId: issue.issueId,
                strategy: 'adjust_audio_duck',
                description: `Extended video clip "${vClip.name}" by ${overhang.toFixed(2)}s to contain dialogue audio.`,
                applied: true,
                timestamp: new Date().toISOString(),
              });
              repaired = true;
            }
          }
          break;
        }

        default:
          break;
      }

      if (!repaired) {
        remainingIssues.push(issue);
      }
    }

    return {
      repairedSequence: seq,
      repairedShots: modifiedShots,
      appliedActions,
      remainingIssues,
    };
  }
}
