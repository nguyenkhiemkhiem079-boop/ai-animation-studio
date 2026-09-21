import { ShotContract } from '../domain/director.js';
import { SfxCue, SfxCategory } from '../domain/audio.js';
import { ProviderRegistry, IProvider } from '../providers/index.js';

export class FoleyMixer {
  constructor(private providerRegistry: ProviderRegistry) {}

  /**
   * Generates or retrieves sound effect cues for a shot, mapping audioCue.sfx items
   * and action events to timed audio cues.
   */
  public async generateShotSfx(
    shot: ShotContract,
    options: {
      providerId?: string;
      shotStartTimeSeconds?: number;
    } = {}
  ): Promise<{ sfxCues: SfxCue[]; actualCostUsd: number }> {
    const sfxNames = [...shot.audioCue.sfx];

    // If no SFX specified in audioCue, infer default ambient/foley
    if (sfxNames.length === 0) {
      if (shot.acting.length > 0 && shot.acting[0].actionPrompt) {
        sfxNames.push('action_movement');
      } else {
        sfxNames.push('ambient_room_tone');
      }
    }

    const providerId = options.providerId ?? 'mock-audio-provider';
    let provider: IProvider;
    if (this.providerRegistry.has(providerId)) {
      provider = this.providerRegistry.get(providerId);
    } else {
      const audioProviders = this.providerRegistry.findByCapability('audio_gen');
      provider = audioProviders[0];
    }

    if (!provider) {
      throw new Error(`No audio provider available for SFX generation (requested: ${providerId})`);
    }

    const sfxCues: SfxCue[] = [];
    let totalCostUsd = 0.0;
    const shotStart = options.shotStartTimeSeconds ?? 0.0;

    for (let i = 0; i < sfxNames.length; i++) {
      const sfxName = sfxNames[i];
      // Stagger SFX cues across shot duration
      const cueOffset = Number((i * 0.8).toFixed(2));
      const timestampSeconds = Math.min(
        shotStart + cueOffset,
        shotStart + shot.frame.durationSeconds - 0.5
      );

      const task = {
        taskType: 'sfx_gen',
        input: {
          shotId: shot.id,
          name: sfxName,
          timestampSeconds,
          durationSeconds: 1.5,
        },
        shotId: shot.id,
      };

      const result = await provider.execute(task);
      totalCostUsd += result.actualCostUsd;
      const out = (result.output as any)?.sfxCue ?? (result.output as any);

      sfxCues.push({
        id: out.id ?? `sfx_${shot.id}_${i}`,
        shotId: shot.id,
        name: sfxName,
        category: out.category ?? 'foley',
        timestampSeconds,
        durationSeconds: out.durationSeconds ?? 1.5,
        volume: out.volume ?? 0.8,
        audioAssetId: out.audioAssetId ?? `ASSET_SFX_${shot.id}_${i}`,
        audioUri: out.audioUri ?? `.studio/audio/sfx/${shot.id}_${sfxName}.wav`,
      });
    }

    return {
      sfxCues,
      actualCostUsd: Number(totalCostUsd.toFixed(4)),
    };
  }
}
