import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { ArtifactVerificationResult } from '../domain/execution-mode.js';
import { MediaToolchainDoctor } from './toolchain-doctor.js';

export interface VerificationOptions {
  requireVideoStream?: boolean;
  requireAudioStream?: boolean;
  minDurationSeconds?: number;
  expectedType?: 'video' | 'audio' | 'image' | 'json' | 'text';
  requireValidMedia?: boolean;
}

export class ArtifactVerifier {
  /**
   * Verifies a physical file on disk, checking existence, non-zero size,
   * SHA-256 checksum, and FFprobe media stream analysis.
   */
  public static verify(filePath: string, options: VerificationOptions = {}): ArtifactVerificationResult {
    if (!fs.existsSync(filePath)) {
      return {
        exists: false,
        readable: false,
        nonEmpty: false,
        filePath,
        error: `File does not exist: "${filePath}"`,
      };
    }

    try {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        return {
          exists: true,
          readable: true,
          nonEmpty: false,
          filePath,
          sizeBytes: 0,
          error: `File is empty (0 bytes): "${filePath}"`,
        };
      }

      // Compute SHA-256
      const buffer = fs.readFileSync(filePath);
      const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      const result: ArtifactVerificationResult = {
        exists: true,
        readable: true,
        nonEmpty: true,
        filePath,
        sizeBytes: stats.size,
        checksumSha256,
        checksum: checksumSha256,
      };

      // Probe audio/video formats with FFprobe if available
      const isMedia = /\.(mp4|webm|mkv|mov|wav|mp3|aac|flac|ogg)$/i.test(filePath);
      if (isMedia) {
        const ffprobePath = MediaToolchainDoctor.getFfprobePath();
        try {
          const cmd = `"${ffprobePath}" -v quiet -print_format json -show_format -show_streams "${filePath}"`;
          const rawOut = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
          const probeData = JSON.parse(rawOut);

          const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
          const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');

          result.durationSeconds = parseFloat(probeData.format?.duration ?? '0');
          result.hasVideoStream = Boolean(videoStream);
          result.hasAudioStream = Boolean(audioStream);
          result.streams = {
            videoCount: videoStream ? 1 : 0,
            audioCount: audioStream ? 1 : 0,
          };

          if (videoStream) {
            result.width = videoStream.width;
            result.height = videoStream.height;
            result.videoCodec = videoStream.codec_name;
            if (videoStream.r_frame_rate) {
              const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
              if (den) result.fps = Math.round(num / den);
            }
          }

          if (audioStream) {
            result.audioCodec = audioStream.codec_name;
          }

          if (options.requireVideoStream && !result.hasVideoStream) {
            result.error = `Media file "${filePath}" does not contain a valid video stream.`;
          }

          if (options.requireAudioStream && !result.hasAudioStream) {
            result.error = `Media file "${filePath}" does not contain a valid audio stream.`;
          }
        } catch {
          // If ffprobe probe fails, still return basic stats
        }
      }

      return result;
    } catch (err: any) {
      return {
        exists: true,
        readable: false,
        nonEmpty: false,
        filePath,
        error: `Error reading file "${filePath}": ${err?.message}`,
      };
    }
  }
}
