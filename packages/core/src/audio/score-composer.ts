import { ProductionScene } from '../domain/director.js';
import { MusicTrack } from '../domain/audio.js';
import { ProviderRegistry, IProvider } from '../providers/index.js';

export class ScoreComposer {
  constructor(private providerRegistry: ProviderRegistry) {}

  /**
   * Composes a musical background score for a production scene based on its purpose,
   * mood, pacing, and total shot duration.
   */
  public async composeSceneScore(
    scene: ProductionScene,
    options: {
      genre?: string;
      mood?: string;
      tempoBpm?: number;
      providerId?: string;
      startTimeSeconds?: number;
    } = {}
  ): Promise<{ musicTrack: MusicTrack; actualCostUsd: number }> {
    // 1. Calculate scene duration
    const totalDurationSeconds = scene.shots.reduce(
      (sum, s) => sum + s.frame.durationSeconds,
      0
    );

    // 2. Infer mood and tempo from scene purpose if not specified
    const mood = options.mood ?? this.inferMood(scene);
    const genre = options.genre ?? 'cinematic_orchestral';
    const tempoBpm = options.tempoBpm ?? this.inferTempo(scene);

    const providerId = options.providerId ?? 'mock-audio-provider';
    let provider: IProvider;
    if (this.providerRegistry.has(providerId)) {
      provider = this.providerRegistry.get(providerId);
    } else {
      const audioProviders = this.providerRegistry.findByCapability('audio_gen');
      provider = audioProviders[0];
    }

    if (!provider) {
      throw new Error(`No audio provider available for score composition (requested: ${providerId})`);
    }

    const task = {
      taskType: 'music_score',
      input: {
        sceneId: scene.id,
        mood,
        genre,
        tempoBpm,
        durationSeconds: Math.max(5.0, totalDurationSeconds),
        startTimeSeconds: options.startTimeSeconds ?? 0.0,
      },
      shotId: scene.shots[0]?.id ?? 'SHOT_01',
    };

    const result = await provider.execute(task);
    const out = (result.output as any)?.musicTrack ?? (result.output as any);

    const musicTrack: MusicTrack = {
      id: out.id ?? `music_${scene.id}`,
      sceneId: scene.id,
      title: out.title ?? `Theme for ${scene.id} (${mood})`,
      genre,
      mood,
      tempoBpm,
      musicalKey: out.musicalKey ?? 'D Minor',
      startTimeSeconds: options.startTimeSeconds ?? 0.0,
      durationSeconds: Math.max(5.0, totalDurationSeconds),
      volume: 0.7,
      fadeInSeconds: 1.0,
      fadeOutSeconds: 1.5,
      audioAssetId: out.audioAssetId ?? `ASSET_MUSIC_${scene.id}`,
      audioUri: out.audioUri ?? `.studio/audio/music/${scene.id}_score.mp3`,
    };

    return {
      musicTrack,
      actualCostUsd: result.actualCostUsd,
    };
  }

  private inferMood(scene: ProductionScene): string {
    switch (scene.purpose) {
      case 'action':
        return 'intense_kinetic';
      case 'climax':
        return 'epic_dramatic';
      case 'establishing':
        return 'atmospheric_mysterious';
      case 'character_intro':
        return 'intriguing_subtle';
      case 'dialogue':
        return 'tension_suspense';
      case 'conflict':
        return 'aggressive_tense';
      case 'exposition':
        return 'thoughtful_curious';
      case 'reveal':
        return 'shock_revelation';
      case 'resolution':
        return 'somber_contemplative';
      case 'transition':
      default:
        return 'ambient_calm';
    }
  }

  private inferTempo(scene: ProductionScene): number {
    switch (scene.purpose) {
      case 'action':
      case 'climax':
      case 'conflict':
        return 130;
      case 'establishing':
      case 'resolution':
        return 80;
      case 'dialogue':
      case 'exposition':
        return 95;
      default:
        return 100;
    }
  }
}
