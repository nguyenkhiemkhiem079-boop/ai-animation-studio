import { CharacterVoiceProfile, AudioDialogueTrack } from '../domain/audio.js';
import { ProviderRegistry, IProvider } from '../providers/index.js';
import { LipSyncEngine, TimedViseme } from '../character-animation/lip-sync.js';
import { IStorageProvider } from '../storage/index.js';

export class VoiceStudio {
  private voiceProfiles = new Map<string, CharacterVoiceProfile>(); // key: `${seriesId}:${characterId}`
  private lipSyncEngine: LipSyncEngine;

  constructor(
    private providerRegistry: ProviderRegistry,
    private storage?: IStorageProvider
  ) {
    this.lipSyncEngine = new LipSyncEngine();
  }

  public getOrCreateVoiceProfile(
    seriesId: string,
    characterId: string,
    defaults?: Partial<CharacterVoiceProfile>
  ): CharacterVoiceProfile {
    const key = `${seriesId}:${characterId}`;
    let profile = this.voiceProfiles.get(key);

    if (!profile) {
      profile = {
        characterId,
        voiceId: defaults?.voiceId ?? `voice_${characterId}`,
        provider: defaults?.provider ?? 'elevenlabs',
        gender: defaults?.gender ?? 'neutral',
        age: defaults?.age ?? 'adult',
        pitch: defaults?.pitch ?? 0.0,
        speakingRate: defaults?.speakingRate ?? 1.0,
        stability: defaults?.stability ?? 0.75,
        claritySimilarity: defaults?.claritySimilarity ?? 0.85,
        accent: defaults?.accent,
        updatedAt: new Date().toISOString(),
      };
      this.voiceProfiles.set(key, profile);
    }

    return profile;
  }

  public setVoiceProfile(seriesId: string, profile: CharacterVoiceProfile): void {
    const key = `${seriesId}:${profile.characterId}`;
    this.voiceProfiles.set(key, profile);
  }

  public listVoiceProfiles(seriesId: string): CharacterVoiceProfile[] {
    const result: CharacterVoiceProfile[] = [];
    const prefix = `${seriesId}:`;
    for (const [k, v] of this.voiceProfiles.entries()) {
      if (k.startsWith(prefix)) {
        result.push(v);
      }
    }
    return result;
  }

  /**
   * Synthesizes dialogue text using character voice profile, returning the audio line
   * along with synchronized mouth visemes for digital actor lip-sync.
   */
  public async synthesizeDialogue(options: {
    seriesId?: string;
    shotId: string;
    characterId: string;
    text: string;
    emotion?: string;
    startTimeSeconds?: number;
    providerId?: string;
  }): Promise<{
    dialogueLine: AudioDialogueTrack;
    visemes: TimedViseme[];
    actualCostUsd: number;
  }> {
    const seriesId = options.seriesId ?? 'default_series';
    const profile = this.getOrCreateVoiceProfile(seriesId, options.characterId);

    const providerId = options.providerId ?? 'mock-audio-provider';
    let provider: IProvider;
    if (this.providerRegistry.has(providerId)) {
      provider = this.providerRegistry.get(providerId);
    } else {
      const audioProviders = this.providerRegistry.findByCapability('audio_gen');
      provider = audioProviders[0];
    }

    if (!provider) {
      throw new Error(`No audio provider available for voice synthesis (requested: ${providerId})`);
    }

    const task = {
      taskType: 'voice_synth',
      input: {
        shotId: options.shotId,
        characterId: options.characterId,
        text: options.text,
        emotion: options.emotion ?? 'neutral',
        startTimeSeconds: options.startTimeSeconds ?? 0.0,
        voiceProfile: profile,
      },
      shotId: options.shotId,
    };

    const result = await provider.execute(task);
    const out = (result.output as any)?.dialogueLine ?? (result.output as any);

    const dialogueLine: AudioDialogueTrack = {
      id: out.id ?? `line_${options.shotId}_${options.characterId}`,
      shotId: options.shotId,
      characterId: options.characterId,
      text: options.text,
      emotion: options.emotion ?? 'neutral',
      startTimeSeconds: options.startTimeSeconds ?? 0.0,
      durationSeconds: out.durationSeconds ?? 2.0,
      audioAssetId: out.audioAssetId ?? `ASSET_VOICE_${options.shotId}_${options.characterId}`,
      audioUri: out.audioUri ?? `.studio/audio/dialogue/${options.shotId}_${options.characterId}.wav`,
      loudnessDb: out.loudnessDb ?? -14.0,
    };

    // Synchronize visemes with the exact synthesized duration
    const visemes = this.lipSyncEngine.generateVisemes(
      dialogueLine.text,
      dialogueLine.durationSeconds
    );

    return {
      dialogueLine,
      visemes,
      actualCostUsd: result.actualCostUsd,
    };
  }
}
