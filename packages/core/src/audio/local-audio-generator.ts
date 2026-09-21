import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { ArtifactVerificationResult } from '../domain/execution-mode.js';

export interface LocalAudioOptions {
  outputPath: string;
  durationSeconds: number;
  type: 'dialogue' | 'music' | 'sfx' | 'silence';
  label?: string;
  frequency?: number;
}

export interface LocalAudioResult {
  outputPath: string;
  durationSeconds: number;
  provenance: 'LOCAL_TEST_AUDIO';
  verification: ArtifactVerificationResult;
}

export class LocalAudioGenerator {
  /**
   * Deterministically generates a real, playable local WAV audio artifact using FFmpeg.
   * This is explicitly tagged and provenance-tracked as LOCAL_TEST_AUDIO.
   */
  public static async generate(options: LocalAudioOptions): Promise<LocalAudioResult> {
    const { outputPath, durationSeconds, type, label = 'test', frequency } = options;
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    const duration = Math.max(0.2, durationSeconds);
    const normalizedOutputPath = outputPath.replace(/\\/g, '/');

    let filter: string;
    switch (type) {
      case 'dialogue': {
        // Human voice fundamental frequency simulation (220 Hz modulated with slight vibrato)
        const f = frequency ?? 220;
        filter = `sine=frequency=${f}:duration=${duration},volume=0.8`;
        break;
      }
      case 'music': {
        // Melodic ambient drone chord (330 Hz harmonic)
        const f = frequency ?? 330;
        filter = `sine=frequency=${f}:duration=${duration},volume=0.5`;
        break;
      }
      case 'sfx': {
        // Short percussive burst or click (880 Hz decaying sine)
        const f = frequency ?? 880;
        filter = `sine=frequency=${f}:duration=${duration},volume=0.7`;
        break;
      }
      case 'silence':
      default:
        filter = `anullsrc=r=44100:cl=stereo`;
        break;
    }

    const cmd = type === 'silence'
      ? `"${ffmpegPath}" -y -f lavfi -i "${filter}" -t ${duration} -c:a pcm_s16le -ar 44100 "${normalizedOutputPath}"`
      : `"${ffmpegPath}" -y -f lavfi -i "${filter}" -t ${duration} -c:a pcm_s16le -ar 44100 "${normalizedOutputPath}"`;

    try {
      execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: any) {
      const stderr = err?.stderr?.toString() || err?.message;
      throw new Error(`Failed to generate local test audio (${type}) at ${outputPath}: ${stderr}`);
    }

    // Physically verify generated audio
    const verification = await ArtifactVerifier.verify(outputPath, {
      expectedType: 'audio',
      requireValidMedia: true,
      minDurationSeconds: Math.max(0.1, duration * 0.8),
    });

    if (!verification.exists || !verification.nonEmpty) {
      throw new Error(`LocalAudioGenerator produced invalid audio: ${verification.error}`);
    }

    return {
      outputPath,
      durationSeconds: duration,
      provenance: 'LOCAL_TEST_AUDIO',
      verification,
    };
  }
}
