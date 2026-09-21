import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';

export interface ExtractedFrame {
  frameIndex: number;
  timestampSeconds: number;
  filePath: string;
  width?: number;
  height?: number;
  base64Data?: string;
}

export interface FrameExtractionOptions {
  count?: number; // Number of keyframes (e.g. 3 = 10%, 50%, 90%)
  timestamps?: number[]; // Explicit timestamps in seconds
  outputDir?: string;
  includeBase64?: boolean;
}

export class FrameExtractor {
  /**
   * Extracts keyframes from a physical video file on disk using FFmpeg.
   */
  public static extractFrames(videoPath: string, options: FrameExtractionOptions = {}): ExtractedFrame[] {
    const verification = ArtifactVerifier.verify(videoPath, { requireVideoStream: true });
    if (!verification.exists || !verification.hasVideoStream) {
      throw new Error(`Cannot extract frames: invalid video file at "${videoPath}". Error: ${verification.error ?? 'No video stream'}`);
    }

    const duration = verification.durationSeconds && verification.durationSeconds > 0 ? verification.durationSeconds : 1.0;
    const outputDir = options.outputDir || path.join(path.dirname(videoPath), '.frames');
    fs.mkdirSync(outputDir, { recursive: true });

    let timestamps: number[] = [];
    if (options.timestamps && options.timestamps.length > 0) {
      timestamps = options.timestamps;
    } else {
      const count = options.count ?? 3;
      if (count === 1) {
        timestamps = [duration / 2];
      } else {
        for (let i = 0; i < count; i++) {
          // Sample across 10% to 90% of duration to avoid black initial/final frames
          const ratio = count === 1 ? 0.5 : 0.1 + (i / (count - 1)) * 0.8;
          timestamps.push(Math.min(duration, Math.max(0, ratio * duration)));
        }
      }
    }

    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const results: ExtractedFrame[] = [];

    for (let idx = 0; idx < timestamps.length; idx++) {
      const ts = timestamps[idx];
      const frameFileName = `${baseName}_frame_${idx + 1}_${ts.toFixed(2)}s.jpg`;
      const frameFilePath = path.join(outputDir, frameFileName);

      try {
        const cmd = `"${ffmpegPath}" -y -ss ${ts.toFixed(3)} -i "${videoPath}" -vframes 1 -q:v 2 "${frameFilePath}"`;
        execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });

        if (fs.existsSync(frameFilePath) && fs.statSync(frameFilePath).size > 0) {
          let base64Data: string | undefined;
          if (options.includeBase64) {
            base64Data = fs.readFileSync(frameFilePath).toString('base64');
          }

          results.push({
            frameIndex: idx,
            timestampSeconds: ts,
            filePath: frameFilePath,
            width: verification.width,
            height: verification.height,
            base64Data,
          });
        }
      } catch (err: any) {
        // Fallback: If FFmpeg timestamp seeking fails on short video, try extracting frame 1
        if (!fs.existsSync(frameFilePath)) {
          try {
            const fallbackCmd = `"${ffmpegPath}" -y -i "${videoPath}" -vframes 1 -q:v 2 "${frameFilePath}"`;
            execSync(fallbackCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
            if (fs.existsSync(frameFilePath) && fs.statSync(frameFilePath).size > 0) {
              results.push({
                frameIndex: idx,
                timestampSeconds: ts,
                filePath: frameFilePath,
                width: verification.width,
                height: verification.height,
                base64Data: options.includeBase64 ? fs.readFileSync(frameFilePath).toString('base64') : undefined,
              });
            }
          } catch {
            // Frame extraction failed for this index
          }
        }
      }
    }

    return results;
  }
}
