import { ShotContract } from '../domain/director.js';
import { AudioMixContract } from '../domain/audio.js';
import {
  SubtitleItem,
  TimelineClip,
  TimelineSequence,
  TimelineTrack,
  TimelineTransition,
} from '../domain/timeline.js';
import { CutTransitionEngine } from './cut-transition-engine.js';

export interface VideoAssetBinding {
  assetId: string;
  uri?: string;
  duration?: number;
}

export interface AssembleTimelineOptions {
  projectId: string;
  sceneId?: string;
  name?: string;
  shots: ShotContract[];
  videoAssetMap?: Map<string, VideoAssetBinding>;
  audioMix?: AudioMixContract;
  fps?: number;
  resolution?: { width: number; height: number };
}

export class TimelineAssembler {
  /**
   * Assembles multi-track TimelineSequence from shot contracts, video assets, and audio mix.
   */
  public static assemble(options: AssembleTimelineOptions): TimelineSequence {
    const {
      projectId,
      sceneId,
      name = `Timeline Sequence ${sceneId ? `[${sceneId}]` : `[${projectId}]`}`,
      shots,
      videoAssetMap = new Map(),
      audioMix,
      fps = 24,
      resolution = { width: 1920, height: 1080 },
    } = options;

    // 1. Build Video Track (V1) and Transitions
    const videoClips: TimelineClip[] = [];
    const transitions: TimelineTransition[] = [];
    let currentVideoPlayhead = 0;

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const videoAsset = videoAssetMap.get(shot.id);
      const shotDuration =
        videoAsset?.duration ?? shot.frame?.durationSeconds ?? (shot as any).duration ?? 3.5;

      const clipId = `clip_v1_${shot.id}`;
      const videoClip: TimelineClip = {
        clipId,
        trackId: 'track_video_v1',
        name: `Shot ${shot.id}`,
        startTime: currentVideoPlayhead,
        duration: shotDuration,
        sourceAssetId: videoAsset?.assetId ?? `ASSET_SHOT_${shot.id}`,
        inPoint: 0,
        outPoint: shotDuration,
        speedMultiplier: 1,
        volume: 1,
        opacity: 1,
        metadata: {
          shotId: shot.id,
          shotPurpose: shot.purpose,
          cameraMovement: shot.camera?.movement,
          shotSize: shot.camera?.shotSize,
        },
      };

      videoClips.push(videoClip);

      // Create transition to next shot if available
      if (i < shots.length - 1) {
        const nextShot = shots[i + 1];
        const nextClipId = `clip_v1_${nextShot.id}`;
        const rawTransType = shot.transition?.type ?? (shot as any).transitionOut?.type;
        const transitionType = CutTransitionEngine.resolveTransitionType(rawTransType);
        const transitionDuration =
          transitionType === 'hard_cut'
            ? 0
            : (shot.transition?.durationSeconds ?? (shot as any).transitionOut?.duration ?? 0.5);

        transitions.push({
          transitionId: `trans_${shot.id}_to_${nextShot.id}`,
          fromClipId: clipId,
          toClipId: nextClipId,
          type: transitionType,
          duration: transitionDuration,
          easing: 'ease_in_out',
        });
      }

      currentVideoPlayhead += shotDuration;
    }

    const videoTrack: TimelineTrack = {
      trackId: 'track_video_v1',
      trackType: 'video',
      name: 'Video Track 1',
      order: 0,
      clips: videoClips,
      isMuted: false,
      isLocked: false,
      volume: 1,
      pan: 0,
    };

    // 2. Build Audio Tracks (A1: Dialogue, A2: Music, A3: SFX)
    const dialogueClips: TimelineClip[] = [];
    const musicClips: TimelineClip[] = [];
    const sfxClips: TimelineClip[] = [];
    const subtitles: SubtitleItem[] = [];

    if (audioMix) {
      // Dialogue
      if (audioMix.dialogueTracks && audioMix.dialogueTracks.length > 0) {
        audioMix.dialogueTracks.forEach((line, idx) => {
          const lineStart = line.startTimeSeconds ?? (line as any).startTime ?? 0;
          const lineDuration = line.durationSeconds ?? (line as any).duration ?? 2.0;
          const assetId = line.audioAssetId ?? `ASSET_AUDIO_DIAL_${line.id ?? idx + 1}`;

          dialogueClips.push({
            clipId: `clip_a1_dial_${idx + 1}`,
            trackId: 'track_audio_a1',
            name: `${line.characterId}: "${line.text.slice(0, 20)}..."`,
            startTime: lineStart,
            duration: lineDuration,
            sourceAssetId: assetId,
            inPoint: 0,
            outPoint: lineDuration,
            speedMultiplier: 1,
            volume: audioMix.dialogueVolume ?? 1,
            opacity: 1,
            metadata: {
              characterId: line.characterId,
              shotId: line.shotId,
              text: line.text,
            },
          });

          subtitles.push({
            id: `sub_${idx + 1}`,
            startTime: lineStart,
            endTime: lineStart + lineDuration,
            speaker: line.characterId,
            text: line.text,
          });
        });
      }

      // Music
      if (audioMix.musicTracks && audioMix.musicTracks.length > 0) {
        audioMix.musicTracks.forEach((music, idx) => {
          const musicStart = music.startTimeSeconds ?? (music as any).startTime ?? 0;
          const musicDuration = music.durationSeconds ?? (music as any).duration ?? 10.0;
          const assetId = music.audioAssetId ?? `ASSET_AUDIO_MUSIC_${music.id ?? idx + 1}`;

          musicClips.push({
            clipId: `clip_a2_music_${idx + 1}`,
            trackId: 'track_audio_a2',
            name: music.title ?? `Music Theme ${idx + 1}`,
            startTime: musicStart,
            duration: musicDuration,
            sourceAssetId: assetId,
            inPoint: 0,
            outPoint: musicDuration,
            speedMultiplier: 1,
            volume: audioMix.musicVolume ?? 0.7,
            opacity: 1,
            metadata: {
              genre: music.genre,
              mood: music.mood,
              bpm: music.tempoBpm ?? (music as any).bpm,
            },
          });
        });
      }

      // SFX
      if (audioMix.sfxCues && audioMix.sfxCues.length > 0) {
        audioMix.sfxCues.forEach((cue, idx) => {
          const cueStart = cue.timestampSeconds ?? (cue as any).timestamp ?? 0;
          const cueDuration = cue.durationSeconds ?? (cue as any).duration ?? 1.0;
          const assetId = cue.audioAssetId ?? `ASSET_AUDIO_SFX_${cue.id ?? idx + 1}`;

          sfxClips.push({
            clipId: `clip_a3_sfx_${idx + 1}`,
            trackId: 'track_audio_a3',
            name: cue.name ?? `SFX ${idx + 1}`,
            startTime: cueStart,
            duration: cueDuration,
            sourceAssetId: assetId,
            inPoint: 0,
            outPoint: cueDuration,
            speedMultiplier: 1,
            volume: (cue.volume ?? 0.8) * (audioMix.sfxVolume ?? 0.8),
            opacity: 1,
            metadata: {
              shotId: cue.shotId,
              category: cue.category,
            },
          });
        });
      }
    }

    const dialogueTrack: TimelineTrack = {
      trackId: 'track_audio_a1',
      trackType: 'audio_dialogue',
      name: 'Dialogue (A1)',
      order: 1,
      clips: dialogueClips,
      isMuted: false,
      isLocked: false,
      volume: audioMix?.dialogueVolume ?? 1,
      pan: 0,
    };

    const musicTrack: TimelineTrack = {
      trackId: 'track_audio_a2',
      trackType: 'audio_music',
      name: 'Score & Music (A2)',
      order: 2,
      clips: musicClips,
      isMuted: false,
      isLocked: false,
      volume: audioMix?.musicVolume ?? 0.7,
      pan: 0,
    };

    const sfxTrack: TimelineTrack = {
      trackId: 'track_audio_a3',
      trackType: 'audio_sfx',
      name: 'Foley & SFX (A3)',
      order: 3,
      clips: sfxClips,
      isMuted: false,
      isLocked: false,
      volume: audioMix?.sfxVolume ?? 0.8,
      pan: 0,
    };

    // 3. Build Subtitle Track (S1)
    const subtitleClips: TimelineClip[] = subtitles.map((sub, idx) => ({
      clipId: `clip_s1_${idx + 1}`,
      trackId: 'track_subtitle_s1',
      name: `Sub: ${sub.text.slice(0, 15)}...`,
      startTime: sub.startTime,
      duration: Math.max(0.1, sub.endTime - sub.startTime),
      sourceAssetId: `ASSET_SUB_${sub.id}`,
      inPoint: 0,
      outPoint: Math.max(0.1, sub.endTime - sub.startTime),
      speedMultiplier: 1,
      volume: 0,
      opacity: 1,
    }));

    const subtitleTrack: TimelineTrack = {
      trackId: 'track_subtitle_s1',
      trackType: 'subtitle',
      name: 'Subtitles (S1)',
      order: 4,
      clips: subtitleClips,
      isMuted: false,
      isLocked: false,
      volume: 0,
      pan: 0,
    };

    // 4. Calculate Total Duration
    const maxClipEnd = Math.max(
      currentVideoPlayhead,
      ...dialogueClips.map((c) => c.startTime + c.duration),
      ...musicClips.map((c) => c.startTime + c.duration),
      ...sfxClips.map((c) => c.startTime + c.duration),
      ...subtitles.map((s) => s.endTime)
    );
    const totalDuration = Math.max(
      currentVideoPlayhead,
      maxClipEnd,
      audioMix?.totalDurationSeconds ?? (audioMix as any)?.totalDuration ?? 0
    );

    return {
      sequenceId: `seq_${sceneId ?? projectId}_${Date.now()}`,
      projectId,
      sceneId,
      name,
      tracks: [videoTrack, dialogueTrack, musicTrack, sfxTrack, subtitleTrack],
      transitions,
      subtitles,
      totalDuration,
      fps,
      resolution,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
