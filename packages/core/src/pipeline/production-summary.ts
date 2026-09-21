import { TimelineSequence } from '../domain/timeline.js';
import { ContinuityQAReport } from '../domain/qa.js';
import { ExportManifest } from '../domain/export.js';

export interface ProductionCostBreakdown {
  deterministicAnimationCostUsd: number;
  generativeVideoCostUsd: number;
  audioDialogueCostUsd: number;
  audioMusicCostUsd: number;
  audioSfxCostUsd: number;
  totalActualCostUsd: number;
  pureGenerativeEstimatedCostUsd: number;
  totalSavedUsd: number;
  savingsPercentage: number;
}

export interface ProductionSummaryReport {
  projectId: string;
  seriesId: string;
  totalDurationSeconds: number;
  totalShots: number;
  totalTracks: number;
  totalTransitions: number;
  costBreakdown: ProductionCostBreakdown;
  qaReport: {
    overallPassed: boolean;
    issuesCount: number;
    repairsApplied: number;
  };
  deliverables: {
    html5PlayerUri?: string;
    otioUri?: string;
    edlUri?: string;
    videoManifestUri?: string;
  };
  completedAt: string;
}

export class ProductionSummaryCalculator {
  /**
   * Calculates comprehensive production statistics, costs, and financial savings.
   */
  public static calculate(
    projectId: string,
    seriesId: string,
    sequence?: TimelineSequence,
    qaReport?: ContinuityQAReport,
    exportManifest?: ExportManifest,
    costOverrides?: {
      generativeShots?: number;
      deterministicShots?: number;
      dialogueLines?: number;
      musicTracks?: number;
      sfxCues?: number;
    }
  ): ProductionSummaryReport {
    const videoTrack = sequence?.tracks.find((t) => t.trackType === 'video');
    const genShots = costOverrides?.generativeShots ?? 1;
    const detShots = costOverrides?.deterministicShots ?? 1;
    const totalShots =
      videoTrack?.clips.length ??
      (costOverrides
        ? (costOverrides.generativeShots ?? 0) + (costOverrides.deterministicShots ?? 0)
        : genShots + detShots);

    const dialLines = sequence?.tracks.find((t) => t.trackType === 'audio_dialogue')?.clips.length ?? costOverrides?.dialogueLines ?? 1;
    const musicCount = sequence?.tracks.find((t) => t.trackType === 'audio_music')?.clips.length ?? costOverrides?.musicTracks ?? 1;
    const sfxCount = sequence?.tracks.find((t) => t.trackType === 'audio_sfx')?.clips.length ?? costOverrides?.sfxCues ?? 1;

    // Costs
    const deterministicCost = 0.0; // 100% free deterministic animation!
    const generativeCost = genShots * 0.50;
    const dialCost = dialLines * 0.05;
    const musicCost = musicCount * 0.05;
    const sfxCost = sfxCount * 0.05;

    const totalActual = deterministicCost + generativeCost + dialCost + musicCost + sfxCost;

    // Benchmark: if all shots had been rendered using expensive generative video
    const pureGenerativeEstimate = totalShots * 0.75 + dialCost + musicCost + sfxCost;
    const totalSaved = Math.max(0, pureGenerativeEstimate - totalActual);
    const savingsPct = pureGenerativeEstimate > 0 ? (totalSaved / pureGenerativeEstimate) * 100 : 0;

    return {
      projectId,
      seriesId,
      totalDurationSeconds: sequence?.totalDuration ?? 0,
      totalShots,
      totalTracks: sequence?.tracks.length ?? 0,
      totalTransitions: sequence?.transitions.length ?? 0,
      costBreakdown: {
        deterministicAnimationCostUsd: deterministicCost,
        generativeVideoCostUsd: generativeCost,
        audioDialogueCostUsd: dialCost,
        audioMusicCostUsd: musicCost,
        audioSfxCostUsd: sfxCost,
        totalActualCostUsd: Number(totalActual.toFixed(4)),
        pureGenerativeEstimatedCostUsd: Number(pureGenerativeEstimate.toFixed(4)),
        totalSavedUsd: Number(totalSaved.toFixed(4)),
        savingsPercentage: Number(savingsPct.toFixed(1)),
      },
      qaReport: {
        overallPassed: qaReport?.overallPassed ?? true,
        issuesCount: qaReport?.issues.length ?? 0,
        repairsApplied: qaReport?.repairActions.length ?? 0,
      },
      deliverables: {
        html5PlayerUri: `.studio/exports/${projectId}_player.html`,
        otioUri: `.studio/exports/${projectId}.otio`,
        edlUri: `.studio/exports/${projectId}.edl`,
        videoManifestUri: `.studio/exports/${projectId}_render_manifest.json`,
      },
      completedAt: new Date().toISOString(),
    };
  }
}
