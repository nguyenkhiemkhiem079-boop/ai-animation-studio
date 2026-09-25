import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ArtifactVerificationResult } from '../domain/execution-mode.js';
import { MediaToolchainDoctor } from './toolchain-doctor.js';

export interface VerificationOptions {
  requireVideoStream?: boolean;
  requireAudioStream?: boolean;
  minDurationSeconds?: number;
  expectedType?: 'video' | 'audio' | 'image' | 'json' | 'text';
  requireValidMedia?: boolean;
}

export interface VideoVerificationResult {
  exists: boolean;
  nonEmpty: boolean;
  hasVideoStream: boolean;
  durationSeconds?: number;
  width?: number;
  height?: number;
  codec?: string;
  fileSizeBytes?: number;
  error?: string;
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
        // Fast-path guard: detect fake text / HTML / mock payload masquerading as media
        const headerText = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8');
        const isFakeOrHtml =
          headerText.startsWith('mock_') ||
          headerText.startsWith('<!DOCTYPE html') ||
          headerText.toLowerCase().includes('<html') ||
          headerText.toLowerCase().includes('{"error"');

        if (isFakeOrHtml) {
          result.hasVideoStream = false;
          result.hasAudioStream = false;
          if (options.requireVideoStream || options.requireValidMedia) {
            result.error = `Media file "${filePath}" contains mock, HTML, or text payload masquerading as video.`;
            return result;
          }
        }

        const ffprobePath = MediaToolchainDoctor.getFfprobePath();
        if (!ffprobePath) {
          result.hasVideoStream = false;
          result.hasAudioStream = false;
          if (options.requireVideoStream || options.requireValidMedia) {
            result.error = `FFprobe toolchain unavailable to verify media stream in "${filePath}".`;
          }
        } else {
          try {
            const rawOut = execFileSync(
              ffprobePath,
              ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
              { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }
            );
            const probeData = JSON.parse(rawOut);

            const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
            const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');

            result.durationSeconds = parseFloat(probeData.format?.duration ?? videoStream?.duration ?? '0');
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
          } catch (err: any) {
            result.hasVideoStream = false;
            result.hasAudioStream = false;
            if (options.requireVideoStream || options.requireValidMedia) {
              result.error = `Media file "${filePath}" failed FFprobe inspection: invalid container or unreadable stream (${err?.message || 'probe failed'}).`;
            }
          }
        }

        if (options.requireVideoStream && !result.hasVideoStream && !result.error) {
          result.error = `Media file "${filePath}" does not contain a valid video stream.`;
        }

        if (options.requireAudioStream && !result.hasAudioStream && !result.error) {
          result.error = `Media file "${filePath}" does not contain a valid audio stream.`;
        }

        if (
          options.minDurationSeconds &&
          (result.durationSeconds ?? 0) < options.minDurationSeconds &&
          !result.error
        ) {
          result.error = `Media file duration (${result.durationSeconds}s) is shorter than minimum expected (${options.minDurationSeconds}s).`;
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

  /**
   * Canonical Video Stream Verifier: returns VideoVerificationResult contract.
   * Enforces physical existence, non-zero size, real video stream, and duration > 0.
   */
  public static verifyVideo(filePath: string): VideoVerificationResult {
    const raw = this.verify(filePath, { requireVideoStream: true, requireValidMedia: true });
    const hasValidDuration = typeof raw.durationSeconds === 'number' && raw.durationSeconds > 0;
    const hasVideoStream = Boolean(raw.hasVideoStream);
    const passes = raw.exists && raw.nonEmpty && hasVideoStream && hasValidDuration;

    return {
      exists: raw.exists,
      nonEmpty: raw.nonEmpty,
      hasVideoStream,
      durationSeconds: raw.durationSeconds,
      width: raw.width,
      height: raw.height,
      codec: raw.videoCodec,
      fileSizeBytes: raw.sizeBytes,
      error: passes
        ? undefined
        : raw.error || (!hasVideoStream ? 'No video stream present' : !hasValidDuration ? 'Video duration is 0 or negative' : 'Video verification failed'),
    };
  }
}

