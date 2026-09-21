import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { LocalAudioGenerator } from './local-audio-generator.js';
import { ArtifactVerificationResult } from '../domain/execution-mode.js';

export interface AudioStemInput {
  filePath: string;
  startTimeSeconds: number;
  volume?: number;
  stemType: 'dialogue' | 'music' | 'sfx';
}

export interface RealAudioMixOptions {
  projectId: string;
  outputDir?: string;
  totalDurationSeconds: number;
  stems: AudioStemInput[];
}

export interface RealAudioMixResult {
  masterAudioPath: string;
  totalDurationSeconds: number;
  stemCount: number;
  verification: ArtifactVerificationResult;
}

export class RealAudioMixer {
  /**
   * Mixes multiple real audio stems (dialogue, music, SFX) into a master PCM WAV file
   * using FFmpeg audio delay and amix filtergraph.
   */
  public static async mix(options: RealAudioMixOptions): Promise<RealAudioMixResult> {
    const {
      projectId,
      outputDir = path.join('.studio', 'audio', projectId),
      totalDurationSeconds,
      stems,
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const masterAudioPath = path.join(outputDir, 'master-audio.wav');
    const validStems = stems.filter((s) => fs.existsSync(s.filePath) && fs.statSync(s.filePath).size > 0);

    const duration = Math.max(0.5, totalDurationSeconds);

    if (validStems.length === 0) {
      // Generate silent master if no active stems exist
      const silentResult = await LocalAudioGenerator.generate({
        outputPath: masterAudioPath,
        durationSeconds: duration,
        type: 'silence',
      });

      return {
        masterAudioPath,
        totalDurationSeconds: duration,
        stemCount: 0,
        verification: silentResult.verification,
      };
    }

    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    const inputArgs: string[] = [];
    const filterParts: string[] = [];
    const mixLabels: string[] = [];

    validStems.forEach((stem, index) => {
      inputArgs.push(`-i "${stem.filePath.replace(/\\/g, '/')}"`);
      const delayMs = Math.max(0, Math.round(stem.startTimeSeconds * 1000));
      const volume = stem.volume ?? 1.0;
      filterParts.push(
        `[${index}:a]adelay=${delayMs}|${delayMs},volume=${volume.toFixed(2)}[a${index}]`
      );
      mixLabels.push(`[a${index}]`);
    });

    let filterComplex = filterParts.join('; ');
    if (validStems.length > 1) {
      filterComplex += `; ${mixLabels.join('')}amix=inputs=${validStems.length}:duration=longest:dropout_transition=0,apad,atrim=0:${duration}[out]`;
    } else {
      filterComplex += `; [a0]apad,atrim=0:${duration}[out]`;
    }

    const normalizedOutputPath = masterAudioPath.replace(/\\/g, '/');
    const cmd = `"${ffmpegPath}" -y ${inputArgs.join(' ')} -filter_complex "${filterComplex}" -map "[out]" -c:a pcm_s16le -ar 44100 "${normalizedOutputPath}"`;

    try {
      execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: any) {
      const stderr = err?.stderr?.toString() || err?.message;
      throw new Error(`RealAudioMixer failed to mix audio stems: ${stderr}`);
    }

    const verification = await ArtifactVerifier.verify(masterAudioPath, {
      expectedType: 'audio',
      requireValidMedia: true,
      minDurationSeconds: Math.max(0.1, duration * 0.8),
    });

    if (!verification.exists || !verification.nonEmpty) {
      throw new Error(`RealAudioMixer produced invalid master audio: ${verification.error}`);
    }

    return {
      masterAudioPath,
      totalDurationSeconds: duration,
      stemCount: validStems.length,
      verification,
    };
  }
}
