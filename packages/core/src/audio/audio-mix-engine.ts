import {
  AudioMixContract,
  AudioDialogueTrack,
  MusicTrack,
  SfxCue,
  AudioDuckingConfig,
} from '../domain/audio.js';

export interface DuckingInterval {
  startSeconds: number;
  endSeconds: number;
  duckDb: number;
}

export class AudioMixEngine {
  /**
   * Compiles dialogue lines, musical score tracks, and sound effect cues into a master
   * AudioMixContract with automatic dialogue ducking and master balance.
   */
  public compileAudioMix(
    projectId: string,
    seriesId: string,
    dialogueTracks: AudioDialogueTrack[],
    musicTracks: MusicTrack[],
    sfxCues: SfxCue[],
    totalDurationSeconds: number,
    options: {
      masterVolume?: number;
      dialogueVolume?: number;
      musicVolume?: number;
      sfxVolume?: number;
      ducking?: Partial<AudioDuckingConfig>;
    } = {}
  ): AudioMixContract {
    const ducking: AudioDuckingConfig = {
      enabled: options.ducking?.enabled ?? true,
      duckMusicOnDialogueDb: options.ducking?.duckMusicOnDialogueDb ?? -6.0,
      duckSfxOnDialogueDb: options.ducking?.duckSfxOnDialogueDb ?? -3.0,
      attackMs: options.ducking?.attackMs ?? 100,
      releaseMs: options.ducking?.releaseMs ?? 300,
    };

    return {
      projectId,
      seriesId,
      totalDurationSeconds,
      masterVolume: options.masterVolume ?? 1.0,
      dialogueVolume: options.dialogueVolume ?? 1.0,
      musicVolume: options.musicVolume ?? 0.7,
      sfxVolume: options.sfxVolume ?? 0.8,
      ducking,
      dialogueTracks,
      musicTracks,
      sfxCues,
      compiledAt: new Date().toISOString(),
    };
  }

  /**
   * Calculates ducking intervals across the timeline where music should be ducked.
   */
  public calculateDuckingIntervals(mix: AudioMixContract): DuckingInterval[] {
    if (!mix.ducking.enabled) return [];

    return mix.dialogueTracks.map((d) => ({
      startSeconds: Math.max(0, d.startTimeSeconds - mix.ducking.attackMs / 1000),
      endSeconds: d.startTimeSeconds + d.durationSeconds + mix.ducking.releaseMs / 1000,
      duckDb: mix.ducking.duckMusicOnDialogueDb,
    }));
  }

  /**
   * Generates a declarative Web Audio API script snippet for playback in browser
   * or headless environments.
   */
  public generateWebAudioScript(mix: AudioMixContract): string {
    const duckingIntervals = this.calculateDuckingIntervals(mix);

    return `
// AI Animation Studio Web Audio Mix Graph
(function() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();

  const masterGain = ctx.createGain();
  masterGain.gain.value = ${mix.masterVolume};
  masterGain.connect(ctx.destination);

  const dialogueGain = ctx.createGain();
  dialogueGain.gain.value = ${mix.dialogueVolume};
  dialogueGain.connect(masterGain);

  const musicGain = ctx.createGain();
  musicGain.gain.value = ${mix.musicVolume};
  musicGain.connect(masterGain);

  const sfxGain = ctx.createGain();
  sfxGain.gain.value = ${mix.sfxVolume};
  sfxGain.connect(masterGain);

  // Dynamic Ducking Automation
  const duckingIntervals = ${JSON.stringify(duckingIntervals)};
  duckingIntervals.forEach(interval => {
    const targetGain = Math.pow(10, interval.duckDb / 20) * ${mix.musicVolume};
    musicGain.gain.setValueAtTime(${mix.musicVolume}, interval.startSeconds);
    musicGain.gain.linearRampToValueAtTime(targetGain, interval.startSeconds + 0.1);
    musicGain.gain.setValueAtTime(targetGain, interval.endSeconds);
    musicGain.gain.linearRampToValueAtTime(${mix.musicVolume}, interval.endSeconds + 0.3);
  });

  window.__studioAudioMix = { ctx, masterGain, dialogueGain, musicGain, sfxGain };
})();
    `.trim();
  }
}
