import {
  IProvider,
  ProviderMetadata,
  ProviderTask,
  ProviderResult,
} from '../providers/index.js';
import { SfxCue, SfxCategory } from '../domain/audio.js';

export interface FoleyAdapterOptions {
  costEstimateUsd?: number;
  latencyMs?: number;
}

export class FoleySfxAdapter implements IProvider {
  public readonly metadata: ProviderMetadata;

  constructor(options: FoleyAdapterOptions = {}) {
    this.metadata = {
      id: 'foley-sfx',
      name: 'Foley & Sound Effects Adapter',
      version: '1.0.0',
      capabilities: ['audio_gen'],
      isLocal: true,
      costEstimateUsdPerInvocation: options.costEstimateUsd ?? 0.02,
      averageLatencyMs: options.latencyMs ?? 20,
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
    const shotId = task.shotId ?? input?.shotId ?? 'SHOT_01';
    const name = input?.name ?? 'footstep';
    const category: SfxCategory = input?.category ?? this.inferCategory(name);
    const cueId = input?.id ?? `sfx_${shotId}_${name}_${Date.now()}`;
    const durationSeconds = input?.durationSeconds ?? 1.0;
    const audioAssetId = `ASSET_SFX_${cueId}`;
    const audioUri = `.studio/audio/sfx/${cueId}.wav`;

    const sfxCue: SfxCue = {
      id: cueId,
      shotId,
      name,
      category,
      timestampSeconds: input?.timestampSeconds ?? 0.0,
      durationSeconds,
      volume: input?.volume ?? 0.8,
      audioAssetId,
      audioUri,
    };

    return {
      output: {
        sfxCue,
        audioAssetId,
        audioUri,
      } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime + this.metadata.averageLatencyMs,
      providerId: this.metadata.id,
    };
  }

  private inferCategory(name: string): SfxCategory {
    const n = name.toLowerCase();
    if (n.includes('step') || n.includes('cloth') || n.includes('touch') || n.includes('door')) {
      return 'foley';
    }
    if (n.includes('wind') || n.includes('rain') || n.includes('room') || n.includes('hum')) {
      return 'ambient';
    }
    if (n.includes('punch') || n.includes('crash') || n.includes('hit') || n.includes('boom')) {
      return 'impact';
    }
    if (n.includes('laser') || n.includes('beep') || n.includes('glitch') || n.includes('synth')) {
      return 'electronic';
    }
    if (n.includes('whoosh') || n.includes('swoosh') || n.includes('swipe')) {
      return 'transition';
    }
    return 'action';
  }
}
