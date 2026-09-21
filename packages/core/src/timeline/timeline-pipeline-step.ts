import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene, ShotContract } from '../domain/director.js';
import { AudioMixContract } from '../domain/audio.js';
import { TimelineSequence } from '../domain/timeline.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { TimelineAssembler, VideoAssetBinding } from './timeline-assembler.js';
import { SubtitleGenerator } from './subtitle-generator.js';

export interface TimelineStepSummary {
  sequenceId: string;
  totalTracks: number;
  totalClips: number;
  totalTransitions: number;
  totalDurationSeconds: number;
  subtitleCount: number;
  [key: string]: unknown;
}

export class TimelineEditingPipelineStep implements PipelineStep {
  public readonly id = 'timeline_editing_step';
  public readonly name = 'Timeline Assembly & Editing';
  public readonly description =
    'Assembles multi-track timeline sequence (video, dialogue, music, SFX, subtitles) with cut transitions and generates subtitle assets.';
  public readonly saveCheckpointAfter = true;

  constructor(private assetRegistry?: IAssetRegistry) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;
    const projectId = (state.projectId as string) || 'default_project';

    logger.info('Starting Timeline Assembly step...', { projectId });

    // 1. Gather Shots from scenes or state
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    let shots: ShotContract[] = (state.shotContracts as ShotContract[]) || [];

    if (shots.length === 0 && productionScenes && Array.isArray(productionScenes)) {
      for (const sc of productionScenes) {
        if (sc.shots && Array.isArray(sc.shots)) {
          shots.push(...sc.shots);
        }
      }
    }

    logger.info(`Gathered ${shots.length} shots for timeline sequencing.`, { count: shots.length });

    // 2. Build Video Asset Map from state / registry
    const videoAssetMap = new Map<string, VideoAssetBinding>();
    const renderedVideoMap = state.renderedVideoMap as Record<string, { assetId: string; videoUri?: string; duration?: number }> | undefined;

    if (renderedVideoMap) {
      for (const [shotId, info] of Object.entries(renderedVideoMap)) {
        videoAssetMap.set(shotId, {
          assetId: info.assetId,
          uri: info.videoUri,
          duration: info.duration,
        });
      }
    }

    // Also check hyperframes compositions if present
    const hfCompositions = state.hyperFramesCompositions as Record<string, { assetId: string; duration?: number }> | undefined;
    if (hfCompositions) {
      for (const [shotId, info] of Object.entries(hfCompositions)) {
        if (!videoAssetMap.has(shotId)) {
          videoAssetMap.set(shotId, {
            assetId: info.assetId,
            duration: info.duration,
          });
        }
      }
    }

    // 3. Retrieve Audio Mix from state
    const audioMix = state.audioMix as AudioMixContract | undefined;

    // 4. Assemble Timeline Sequence
    const sequence = TimelineAssembler.assemble({
      projectId,
      sceneId: productionScenes?.[0]?.id,
      name: `Master Timeline [${projectId}]`,
      shots,
      videoAssetMap,
      audioMix,
    });

    // 5. Generate Subtitles (SRT & VTT)
    const srtContent = SubtitleGenerator.generateSrt(sequence.subtitles);
    const vttContent = SubtitleGenerator.generateVtt(sequence.subtitles);

    // 6. Register Assets in AssetRegistry if available
    if (this.assetRegistry) {
      const seriesId = (state.seriesId as string) || 'default_series';

      // Register timeline sequence metadata asset
      await this.assetRegistry.register({
        id: `ASSET_TIMELINE_${sequence.sequenceId}`,
        seriesId,
        type: 'timeline_sequence',
        status: 'approved_canon',
        name: sequence.name,
        contentHash: `hash_timeline_${sequence.sequenceId}`,
        storageUri: `.studio/timelines/${sequence.sequenceId}.json`,
        mimeType: 'application/json',
        sizeBytes: JSON.stringify(sequence).length,
        version: 1,
        tags: ['timeline', 'sequence', projectId],
        metadata: {
          sequenceId: sequence.sequenceId,
          totalDuration: sequence.totalDuration,
          trackCount: sequence.tracks.length,
          transitionCount: sequence.transitions.length,
          subtitleCount: sequence.subtitles.length,
        },
      });

      // Register Subtitle assets if dialogue exists
      if (sequence.subtitles.length > 0) {
        await this.assetRegistry.register({
          id: `ASSET_SUB_SRT_${sequence.sequenceId}`,
          seriesId,
          type: 'subtitle_file',
          status: 'approved_canon',
          name: `Subtitles SRT [${sequence.sequenceId}]`,
          contentHash: `hash_srt_${sequence.sequenceId}`,
          storageUri: `.studio/subtitles/${sequence.sequenceId}.srt`,
          mimeType: 'application/x-subrip',
          sizeBytes: srtContent.length,
          version: 1,
          tags: ['subtitles', 'srt', projectId],
          metadata: {
            format: 'srt',
          },
        });

        await this.assetRegistry.register({
          id: `ASSET_SUB_VTT_${sequence.sequenceId}`,
          seriesId,
          type: 'subtitle_file',
          status: 'approved_canon',
          name: `Subtitles VTT [${sequence.sequenceId}]`,
          contentHash: `hash_vtt_${sequence.sequenceId}`,
          storageUri: `.studio/subtitles/${sequence.sequenceId}.vtt`,
          mimeType: 'text/vtt',
          sizeBytes: vttContent.length,
          version: 1,
          tags: ['subtitles', 'vtt', projectId],
          metadata: {
            format: 'vtt',
          },
        });
      }
    }

    // 7. Store results in pipeline state
    state.timelineSequence = sequence;
    state.subtitlesSrt = srtContent;
    state.subtitlesVtt = vttContent;

    const totalClips = sequence.tracks.reduce((acc, t) => acc + t.clips.length, 0);
    const summary: TimelineStepSummary = {
      sequenceId: sequence.sequenceId,
      totalTracks: sequence.tracks.length,
      totalClips,
      totalTransitions: sequence.transitions.length,
      totalDurationSeconds: sequence.totalDuration,
      subtitleCount: sequence.subtitles.length,
    };

    logger.info('Timeline Assembly completed successfully.', summary);

    return {
      timelineSequence: sequence,
      srtContent,
      vttContent,
      summary,
    };
  }
}
