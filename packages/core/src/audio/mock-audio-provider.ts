import {
  IProvider,
  ProviderMetadata,
  ProviderTask,
  ProviderResult,
} from '../providers/index.js';
import {
  CharacterVoiceProfile,
  AudioDialogueTrack,
  MusicTrack,
  SfxCue,
} from '../domain/audio.js';

export interface MockAudioProviderOptions {
  id?: string;
  costEstimateUsd?: number;
  latencyMs?: number;
}

export class MockAudioProvider implements IProvider {
  public readonly metadata: ProviderMetadata;

  constructor(options: MockAudioProviderOptions = {}) {
    this.metadata = {
      id: options.id ?? 'mock-audio-provider',
      name: 'Mock Audio Synthesis Provider',
      version: '1.0.0',
      capabilities: ['audio_gen'],
      isLocal: true,
      costEstimateUsdPerInvocation: options.costEstimateUsd ?? 0.05,
      averageLatencyMs: options.latencyMs ?? 15,
    };
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const taskType = task.taskType;

    let output: any;

    if (taskType === 'voice_synth') {
      const text = input?.text ?? 'Hello world';
      const characterId = input?.characterId ?? 'char_default';
      const shotId = task.shotId ?? input?.shotId ?? 'SHOT_01';
      const lineId = input?.id ?? `line_${shotId}_${characterId}_${Date.now()}`;

      // Calculate realistic duration: approx 0.3s per word, minimum 1.2s
      const wordCount = text.trim().split(/\s+/).length;
      const durationSeconds = Math.max(1.2, Number((wordCount * 0.32).toFixed(2)));
      const audioAssetId = `ASSET_VOICE_${lineId}`;

      const dialogueLine: AudioDialogueTrack = {
        id: lineId,
        shotId,
        characterId,
        text,
        emotion: input?.emotion ?? 'neutral',
        startTimeSeconds: input?.startTimeSeconds ?? 0.0,
        durationSeconds,
        audioAssetId,
        audioUri: `.studio/audio/dialogue/${lineId}.wav`,
        loudnessDb: -14.0,
      };

      output = {
        dialogueLine,
        audioAssetId,
        durationSeconds,
        audioUri: dialogueLine.audioUri,
      };
    } else if (taskType === 'music_score') {
      const sceneId = input?.sceneId ?? 'SCENE_01';
      const mood = input?.mood ?? 'suspenseful';
      const genre = input?.genre ?? 'cinematic_orchestral';
      const tempoBpm = input?.tempoBpm ?? 100;
      const durationSeconds = input?.durationSeconds ?? 10.0;
      const trackId = input?.id ?? `music_${sceneId}_${Date.now()}`;
      const audioAssetId = `ASSET_MUSIC_${trackId}`;

      const musicTrack: MusicTrack = {
        id: trackId,
        sceneId,
        title: `Theme for ${sceneId} (${mood})`,
        genre,
        mood,
        tempoBpm,
        musicalKey: input?.musicalKey ?? 'D Minor',
        startTimeSeconds: input?.startTimeSeconds ?? 0.0,
        durationSeconds,
        volume: input?.volume ?? 0.7,
        fadeInSeconds: input?.fadeInSeconds ?? 1.0,
        fadeOutSeconds: input?.fadeOutSeconds ?? 1.5,
        audioAssetId,
        audioUri: `.studio/audio/music/${trackId}.mp3`,
      };

      output = {
        musicTrack,
        audioAssetId,
        durationSeconds,
        audioUri: musicTrack.audioUri,
      };
    } else if (taskType === 'sfx_gen') {
      const shotId = task.shotId ?? input?.shotId ?? 'SHOT_01';
      const name = input?.name ?? 'footstep';
      const category = input?.category ?? 'foley';
      const cueId = input?.id ?? `sfx_${shotId}_${name}_${Date.now()}`;
      const audioAssetId = `ASSET_SFX_${cueId}`;
      const durationSeconds = input?.durationSeconds ?? 1.0;

      const sfxCue: SfxCue = {
        id: cueId,
        shotId,
        name,
        category,
        timestampSeconds: input?.timestampSeconds ?? 0.0,
        durationSeconds,
        volume: input?.volume ?? 0.8,
        audioAssetId,
        audioUri: `.studio/audio/sfx/${cueId}.wav`,
      };

      output = {
        sfxCue,
        audioAssetId,
        durationSeconds,
        audioUri: sfxCue.audioUri,
      };
    } else {
      output = {
        processed: true,
        receivedInput: input,
      };
    }

    return {
      output: output as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime + this.metadata.averageLatencyMs,
      providerId: this.metadata.id,
    };
  }
}
