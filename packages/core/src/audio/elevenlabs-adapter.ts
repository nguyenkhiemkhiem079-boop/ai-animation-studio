import {
  IProvider,
  ProviderMetadata,
  ProviderTask,
  ProviderResult,
} from '../providers/index.js';
import { CharacterVoiceProfile, AudioDialogueTrack } from '../domain/audio.js';

export interface ElevenLabsVoicePayload {
  voice_id: string;
  text: string;
  model_id: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
    speaking_rate?: number;
  };
}

export type ElevenLabsRequestExecutor = (payload: ElevenLabsVoicePayload) => Promise<{
  audioUri: string;
  durationSeconds: number;
}>;

export interface ElevenLabsAdapterOptions {
  apiKey?: string;
  executor?: ElevenLabsRequestExecutor;
  costEstimateUsd?: number;
  latencyMs?: number;
}

export class ElevenLabsVoiceAdapter implements IProvider {
  public readonly metadata: ProviderMetadata;
  private executor?: ElevenLabsRequestExecutor;

  constructor(options: ElevenLabsAdapterOptions = {}) {
    this.metadata = {
      id: 'elevenlabs-voice',
      name: 'ElevenLabs Voice Synthesis Adapter',
      version: '1.0.0',
      capabilities: ['audio_gen'],
      isLocal: false,
      costEstimateUsdPerInvocation: options.costEstimateUsd ?? 0.08,
      averageLatencyMs: options.latencyMs ?? 40,
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
    const text = input?.text ?? 'Spoken dialogue';
    const profile: CharacterVoiceProfile | undefined = input?.voiceProfile;
    const voiceId = profile?.voiceId ?? 'voice_eleven_default';

    const payload: ElevenLabsVoicePayload = {
      voice_id: voiceId,
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: profile?.stability ?? 0.75,
        similarity_boost: profile?.claritySimilarity ?? 0.85,
        speaking_rate: profile?.speakingRate ?? 1.0,
      },
    };

    let audioUri: string;
    let durationSeconds: number;

    if (this.executor) {
      const response = await this.executor(payload);
      audioUri = response.audioUri;
      durationSeconds = response.durationSeconds;
    } else {
      const wordCount = text.trim().split(/\s+/).length;
      durationSeconds = Math.max(1.2, Number((wordCount * 0.35).toFixed(2)));
      audioUri = `.studio/audio/dialogue/${task.shotId ?? 'shot'}_${voiceId}.wav`;
    }

    const dialogueLine: AudioDialogueTrack = {
      id: input?.id ?? `line_${Date.now()}`,
      shotId: task.shotId ?? 'SHOT_01',
      characterId: profile?.characterId ?? 'char_default',
      text,
      emotion: input?.emotion ?? 'neutral',
      startTimeSeconds: input?.startTimeSeconds ?? 0.0,
      durationSeconds,
      audioAssetId: `ASSET_VOICE_${voiceId}`,
      audioUri,
      loudnessDb: -14.0,
    };

    return {
      output: {
        dialogueLine,
        payload,
        audioUri,
      } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime + this.metadata.averageLatencyMs,
      providerId: this.metadata.id,
    };
  }
}
