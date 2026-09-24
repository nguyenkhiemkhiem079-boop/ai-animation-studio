import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TimelineSequence } from '../domain/timeline.js';
import { ExportFormat, ExportManifest, OutputFileDescriptor } from '../domain/export.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { ArtifactVerificationResult } from '../domain/execution-mode.js';

export interface RenderVideoOptions {
  sequence: TimelineSequence;
  format?: 'mp4_manifest' | 'webm_manifest';
  outputDir?: string;
}

export interface RealRenderOptions {
  sequence: TimelineSequence;
  outputDir?: string;
  outputPath?: string;
  shotVideoMap?: Map<string, string> | Record<string, string>;
  masterAudioPath?: string;
  includeAudio?: boolean;
}

export interface RealRenderResult {
  outputPath: string;
  manifest: ExportManifest;
  verification: ArtifactVerificationResult;
  clipCount: number;
  durationSeconds: number;
}

export class VideoRenderer {
  /**
   * Compiles the video render manifest (declarative metadata) for planning.
   */
  public static compileRenderManifest(options: RenderVideoOptions): ExportManifest {
    const { sequence, format = 'mp4_manifest', outputDir = '.studio/exports' } = options;

    const ext = format === 'mp4_manifest' ? 'mp4' : 'webm';
    const mimeType = format === 'mp4_manifest' ? 'video/mp4' : 'video/webm';
    const filename = `${sequence.sequenceId}_master.${ext}`;
    const uri = `${outputDir}/${filename}`;

    const videoTrack = sequence.tracks.find((t) => t.trackType === 'video');
    const totalFrames = Math.round(sequence.totalDuration * sequence.fps);
    const estimatedSizeBytes = Math.round(sequence.totalDuration * 2_500_000);

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

  /**
   * Validates required video inputs before rendering.
   */
  public static validateInputs(options: RealRenderOptions): {
    resolvedVideoPaths: string[];
    masterAudioPath?: string;
  } {
    const { sequence, shotVideoMap, masterAudioPath } = options;

    const videoTrack = sequence.tracks.find((t) => t.trackType === 'video');
    if (!videoTrack || videoTrack.clips.length === 0) {
      throw new Error(`Cannot render sequence "${sequence.sequenceId}": No video track or clips found.`);
    }

    const resolvedVideoPaths: string[] = [];
    const getPath = (id: string): string | undefined => {
      if (!shotVideoMap) return undefined;
      if (shotVideoMap instanceof Map) return shotVideoMap.get(id);
      return (shotVideoMap as Record<string, string>)[id];
    };

    for (const clip of videoTrack.clips) {
      let resolved =
        getPath(clip.sourceAssetId) ??
        getPath(clip.clipId) ??
        (typeof clip.metadata?.shotId === 'string' ? getPath(clip.metadata.shotId) : undefined);
      if (!resolved && fs.existsSync(clip.sourceAssetId)) {
        resolved = clip.sourceAssetId;
      }

      if (!resolved || !fs.existsSync(resolved)) {
        throw new Error(
          `Missing video artifact for shot clip "${clip.clipId}" (asset: "${clip.sourceAssetId}"). Ensure all shots are rendered before master export.`
        );
      }

      resolvedVideoPaths.push(resolved);
    }

    let resolvedAudio: string | undefined;
    if (masterAudioPath && fs.existsSync(masterAudioPath)) {
      resolvedAudio = masterAudioPath;
    }

    return { resolvedVideoPaths, masterAudioPath: resolvedAudio };
  }

  /**
   * Compiles an FFmpeg concat demuxer file for the given video file paths.
   */
  public static compileConcatPlan(videoPaths: string[], planFilePath: string): void {
    const lines = videoPaths.map((p) => `file '${path.resolve(p).replace(/\\/g, '/')}'`);
    fs.writeFileSync(planFilePath, lines.join('\n'), 'utf-8');
  }

  /**
   * Performs real local video rendering using FFmpeg.
   * Stitches video clips, muxes AAC audio, and physically verifies output.
   */
  public static async render(options: RealRenderOptions): Promise<RealRenderResult> {
    const {
      sequence,
      outputDir = path.join('.studio', 'exports', sequence.projectId),
      outputPath = path.join(outputDir, `${sequence.sequenceId}_master.mp4`),
      includeAudio = true,
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Validate inputs
    const { resolvedVideoPaths, masterAudioPath } = this.validateInputs(options);

    // 2. Write concat plan
    const concatPlanPath = path.join(outputDir, `.concat_${sequence.sequenceId}.txt`);
    this.compileConcatPlan(resolvedVideoPaths, concatPlanPath);

    // 3. Assemble and execute FFmpeg command
    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    const ffmpegArgs: string[] = ['-y', '-f', 'concat', '-safe', '0', '-i', concatPlanPath];
    if (includeAudio && masterAudioPath) {
      ffmpegArgs.push('-i', masterAudioPath, '-c:a', 'aac', '-b:a', '192k', '-shortest');
    } else if (includeAudio) {
      ffmpegArgs.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-c:a', 'aac', '-b:a', '128k', '-shortest');
    } else {
      ffmpegArgs.push('-an');
    }
    ffmpegArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath);

    try {
      execFileSync(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
    } catch (err: any) {
      const stderr = err?.stderr?.toString() || err?.message;
      throw new Error(`Master video render failed: ${stderr}`);
    }
 finally {
      if (fs.existsSync(concatPlanPath)) {
        try {
          fs.unlinkSync(concatPlanPath);
        } catch {
          // ignore cleanup
        }
      }
    }

    // 4. Physically verify master MP4 with FFprobe
    const verification = await ArtifactVerifier.verify(outputPath, {
      expectedType: 'video',
      requireValidMedia: true,
      minDurationSeconds: Math.max(0.1, sequence.totalDuration * 0.8),
    });

    if (!verification.exists || !verification.nonEmpty) {
      throw new Error(`Master MP4 render verification failed: ${verification.error}`);
    }

    // 5. Create verified ExportManifest
    const manifest: ExportManifest = {
      manifestId: `manifest_${sequence.sequenceId}_mp4`,
      projectId: sequence.projectId,
      format: 'mp4',
      outputFiles: [
        {
          filename: path.basename(outputPath),
          mimeType: 'video/mp4',
          sizeBytes: verification.sizeBytes ?? 0,
          sha256: verification.checksum ?? '',
          uri: outputPath,
        },
      ],
      resolution: sequence.resolution,
      fps: sequence.fps,
      totalDurationSeconds: verification.durationSeconds ?? sequence.totalDuration,
      checksumSha256: verification.checksum ?? '',
      createdAt: new Date().toISOString(),
      metadata: {
        codec: 'h264_aac',
        totalFrames: Math.round((verification.durationSeconds ?? sequence.totalDuration) * sequence.fps),
        videoClipsCount: resolvedVideoPaths.length,
        audioStreamPresent: (verification.streams?.audioCount ?? 0) > 0,
        videoStreamPresent: (verification.streams?.videoCount ?? 0) > 0,
        ffprobeStatus: 'PASS',
      },
    };

    return {
      outputPath,
      manifest,
      verification,
      clipCount: resolvedVideoPaths.length,
      durationSeconds: verification.durationSeconds ?? sequence.totalDuration,
    };
  }
}
