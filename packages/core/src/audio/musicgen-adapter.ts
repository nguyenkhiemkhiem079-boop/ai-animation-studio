import {
  IProvider,
  ProviderMetadata,
  ProviderTask,
  ProviderResult,
} from '../providers/index.js';
import { MusicTrack } from '../domain/audio.js';

export interface MusicGenPayload {
  prompt: string;
  duration_seconds: number;
  tempo_bpm: number;
  model: string;
}

export type MusicGenRequestExecutor = (payload: MusicGenPayload) => Promise<{
  audioUri: string;
}>;

export interface MusicGenAdapterOptions {
  apiKey?: string;
  executor?: MusicGenRequestExecutor;
  costEstimateUsd?: number;
  latencyMs?: number;
}

export class MusicGenAdapter implements IProvider {
  public readonly metadata: ProviderMetadata;
  private executor?: MusicGenRequestExecutor;

  constructor(options: MusicGenAdapterOptions = {}) {
    this.metadata = {
      id: 'meta-musicgen',
      name: 'Meta MusicGen Score Adapter',
      version: '1.0.0',
      capabilities: ['audio_gen'],
      isLocal: false,
      costEstimateUsdPerInvocation: options.costEstimateUsd ?? 0.15,
      averageLatencyMs: options.latencyMs ?? 50,
    };
    this.executor = options.executor;
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const sceneId = input?.sceneId ?? 'SCENE_01';
    const mood = input?.mood ?? 'suspenseful';
    const genre = input?.genre ?? 'cinematic_orchestral';
    const tempoBpm = input?.tempoBpm ?? 100;
    const durationSeconds = input?.durationSeconds ?? 10.0;

    const prompt = `${genre}, ${mood} mood, tempo ${tempoBpm} bpm, dramatic cinematic score`;

    const payload: MusicGenPayload = {
      prompt,
      duration_seconds: durationSeconds,
      tempo_bpm: tempoBpm,
      model: 'musicgen-melody',
    };

    let audioUri: string;

    if (this.executor) {
      const response = await this.executor(payload);
      audioUri = response.audioUri;
    } else {
      audioUri = `.studio/audio/music/${sceneId}_score.mp3`;
    }

    const trackId = input?.id ?? `music_${sceneId}_${Date.now()}`;
    const musicTrack: MusicTrack = {
      id: trackId,
      sceneId,
      title: `${genre} (${mood})`,
      genre,
      mood,
      tempoBpm,
      musicalKey: input?.musicalKey ?? 'A Minor',
      startTimeSeconds: input?.startTimeSeconds ?? 0.0,
      durationSeconds,
      volume: input?.volume ?? 0.7,
      fadeInSeconds: input?.fadeInSeconds ?? 1.0,
      fadeOutSeconds: input?.fadeOutSeconds ?? 1.5,
      audioAssetId: `ASSET_MUSIC_${trackId}`,
      audioUri,
    };

    return {
      output: {
        musicTrack,
        payload,
        audioUri,
      } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime + this.metadata.averageLatencyMs,
      providerId: this.metadata.id,
    };
  }
}
