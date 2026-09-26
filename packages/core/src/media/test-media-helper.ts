import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { MediaToolchainDoctor } from './toolchain-doctor.js';

export interface Mp4FixtureOptions {
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  color?: string;
}

let cachedBuffer: Buffer | null = null;

/**
 * Generates a real, physically valid, deterministic MP4 video fixture using FFmpeg.
 * Guaranteed to pass ArtifactVerifier.verifyVideo and FFprobe in both local and CI environments.
 */
export function createDeterministicMp4Fixture(
  outputPath: string,
  options: Mp4FixtureOptions = {}
): Buffer {
  const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
  const width = options.width ?? 320;
  const height = options.height ?? 180;
  const duration = options.durationSeconds ?? 1.0;
  const fps = options.fps ?? 24;
  const color = options.color ?? 'navy';

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  execFileSync(
    ffmpeg,
    [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=${color}:s=${width}x${height}:d=${duration}:r=${fps}`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ],
    { stdio: 'ignore' }
  );

  return fs.readFileSync(outputPath);
}

/**
 * Returns a valid, in-memory MP4 buffer by generating one in the OS temp directory if not already cached.
 */
export function getDeterministicMp4Buffer(options: Mp4FixtureOptions = {}): Buffer {
  if (cachedBuffer && cachedBuffer.length > 0 && !options.durationSeconds && !options.color) {
    return cachedBuffer;
  }

  const tempFile = path.join(
    os.tmpdir(),
    `studio_fixture_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp4`
  );

  try {
    const buf = createDeterministicMp4Fixture(tempFile, options);
    if (!options.durationSeconds && !options.color) {
      cachedBuffer = buf;
    }
    return buf;
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {
      // ignore temp cleanup error
    }
  }
}
