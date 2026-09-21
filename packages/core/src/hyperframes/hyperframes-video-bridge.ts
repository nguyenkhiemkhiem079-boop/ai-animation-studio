import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { HyperFramesComposition } from '../domain/hyperframes.js';
import { HeadlessFrameCapture } from './headless-frame-capture.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { ArtifactVerifier, VerificationOptions } from '../media/artifact-verifier.js';
import { ArtifactVerificationResult } from '../domain/execution-mode.js';

export interface HyperFramesVideoBridgeOptions {
  fps?: number;
  width?: number;
  height?: number;
  keepFrames?: boolean;
}

export interface HyperFramesVideoBridgeResult {
  videoPath: string;
  frameCount: number;
  durationSeconds: number;
  verification: ArtifactVerificationResult;
}

export class HyperFramesVideoBridge {
  /**
   * Deterministically renders a HyperFrames composition to an MP4 video file
   * using headless browser frame capture followed by FFmpeg encoding.
   */
  public static async renderToMp4(
    composition: HyperFramesComposition,
    outputPath: string,
    options: HyperFramesVideoBridgeOptions = {}
  ): Promise<HyperFramesVideoBridgeResult> {
    const fps = options.fps ?? composition.fps ?? 24;
    const width = options.width ?? composition.width ?? 1280;
    const height = options.height ?? composition.height ?? 720;
    const durationSeconds = composition.durationSeconds;

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const framesDir = path.join(outputDir, `.frames_${composition.shotId || 'composition'}`);
    if (fs.existsSync(framesDir)) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(framesDir, { recursive: true });

    // Step 1: Capture frames deterministically via headless browser
    const captureResult = await HeadlessFrameCapture.captureFrames({
      htmlContent: composition.html,
      outputDir: framesDir,
      durationSeconds,
      fps,
      width,
      height,
    });

    // Step 2: Encode PNG sequence to MP4 with FFmpeg
    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    const inputPattern = path.join(framesDir, 'frame_%04d.png').replace(/\\/g, '/');
    const normalizedOutputPath = outputPath.replace(/\\/g, '/');

    const ffmpegCmd = `"${ffmpegPath}" -y -framerate ${fps} -i "${inputPattern}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${normalizedOutputPath}"`;

    try {
      execSync(ffmpegCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: any) {
      const stderr = err?.stderr?.toString() || err?.message;
      throw new Error(`FFmpeg video encoding failed for shot ${composition.shotId}: ${stderr}`);
    } finally {
      if (!options.keepFrames && fs.existsSync(framesDir)) {
        try {
          fs.rmSync(framesDir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    }

    // Step 3: Physically verify output MP4 with FFprobe
    const verification = await ArtifactVerifier.verify(outputPath, {
      expectedType: 'video',
      requireValidMedia: true,
      minDurationSeconds: Math.max(0.1, durationSeconds * 0.8),
    });

    if (!verification.exists || !verification.nonEmpty) {
      throw new Error(
        `HyperFramesVideoBridge produced empty or missing video at: ${outputPath} (${verification.error})`
      );
    }

    return {
      videoPath: outputPath,
      frameCount: captureResult.totalFrames,
      durationSeconds,
      verification,
    };
  }
}
