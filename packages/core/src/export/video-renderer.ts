import { TimelineSequence } from '../domain/timeline.js';
import { ExportFormat, ExportManifest, OutputFileDescriptor } from '../domain/export.js';

export interface RenderVideoOptions {
  sequence: TimelineSequence;
  format?: 'mp4_manifest' | 'webm_manifest';
  outputDir?: string;
}

export class VideoRenderer {
  /**
   * Compiles the final video render manifest and simulated output files for video rendering.
   */
  public static compileRenderManifest(options: RenderVideoOptions): ExportManifest {
    const { sequence, format = 'mp4_manifest', outputDir = '.studio/exports' } = options;

    const ext = format === 'mp4_manifest' ? 'mp4' : 'webm';
    const mimeType = format === 'mp4_manifest' ? 'video/mp4' : 'video/webm';
    const filename = `${sequence.sequenceId}_master.${ext}`;
    const uri = `${outputDir}/${filename}`;

    const videoTrack = sequence.tracks.find((t) => t.trackType === 'video');
    const totalFrames = Math.round(sequence.totalDuration * sequence.fps);

    // Mock file descriptor with simulated size
    const estimatedSizeBytes = Math.round(sequence.totalDuration * 2_500_000); // ~2.5 MB/sec at 1080p

    const primaryFile: OutputFileDescriptor = {
      filename,
      mimeType,
      sizeBytes: estimatedSizeBytes,
      sha256: `hash_render_${sequence.sequenceId}_${format}`,
      uri,
    };

    return {
      manifestId: `manifest_${sequence.sequenceId}_${format}`,
      projectId: sequence.projectId,
      format,
      outputFiles: [primaryFile],
      resolution: sequence.resolution,
      fps: sequence.fps,
      totalDurationSeconds: sequence.totalDuration,
      checksumSha256: `sha256_master_${sequence.sequenceId}`,
      createdAt: new Date().toISOString(),
      metadata: {
        codec: format === 'mp4_manifest' ? 'h264_aac' : 'vp9_opus',
        totalFrames,
        videoClipsCount: videoTrack?.clips.length ?? 0,
        transitionsCount: sequence.transitions.length,
        audioTracksCount: sequence.tracks.filter((t) => t.trackType.startsWith('audio')).length,
      },
    };
  }
}
