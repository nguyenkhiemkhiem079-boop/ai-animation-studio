import { describe, it, expect, beforeEach } from 'vitest';
import {
  SubtitleGenerator,
  CutTransitionEngine,
  TimelineAssembler,
  TimelineEditingPipelineStep,
  TimelineClip,
  TimelineTransition,
  ShotContract,
  AudioMixContract,
  PipelineContext,
  PipelineStep,
  IAssetRegistry,
  InMemoryAssetRegistry,
  defaultLogger,
} from '../src/index.js';

describe('Phase 11 — Multi-Track Timeline & Editing Engine', () => {
  describe('SubtitleGenerator', () => {
    it('formats SRT and VTT timestamps with millisecond accuracy', () => {
      const srtTime = SubtitleGenerator.formatSrtTimestamp(65.432);
      expect(srtTime).toBe('00:01:05,432');

      const vttTime = SubtitleGenerator.formatVttTimestamp(3661.05);
      expect(vttTime).toBe('01:01:01.050');
    });

    it('generates standard SRT format from subtitle items', () => {
      const items = [
        { id: 'sub_1', startTime: 0.5, endTime: 2.2, speaker: 'kaito', text: 'Engines online.' },
        { id: 'sub_2', startTime: 2.5, endTime: 4.8, speaker: 'elena', text: 'Plotting vector.' },
      ];

      const srt = SubtitleGenerator.generateSrt(items);
      expect(srt).toContain('1\n00:00:00,500 --> 00:00:02,200\nKAITO: Engines online.');
      expect(srt).toContain('2\n00:00:02,500 --> 00:00:04,800\nELENA: Plotting vector.');
    });

    it('generates standard WebVTT format from subtitle items', () => {
      const items = [
        { id: 'sub_1', startTime: 1.0, endTime: 3.0, speaker: 'kaito', text: 'We have visual.' },
      ];

      const vtt = SubtitleGenerator.generateVtt(items);
      expect(vtt).toContain('WEBVTT');
      expect(vtt).toContain('1\n00:00:01.000 --> 00:00:03.000\n<v kaito>We have visual.</v>');
    });

    it('parses SRT back into SubtitleItem array', () => {
      const srt = `1
00:00:01,000 --> 00:00:03,500
COMMANDER: Hold position!

2
00:00:04,000 --> 00:00:06,200
Understood.`;

      const parsed = SubtitleGenerator.parseSrt(srt);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].speaker).toBe('COMMANDER');
      expect(parsed[0].text).toBe('Hold position!');
      expect(parsed[0].startTime).toBe(1.0);
      expect(parsed[0].endTime).toBe(3.5);

      expect(parsed[1].speaker).toBeUndefined();
      expect(parsed[1].text).toBe('Understood.');
      expect(parsed[1].startTime).toBe(4.0);
      expect(parsed[1].endTime).toBe(6.2);
    });
  });

  describe('CutTransitionEngine', () => {
    it('resolves transition types from director cues', () => {
      expect(CutTransitionEngine.resolveTransitionType('cut')).toBe('hard_cut');
      expect(CutTransitionEngine.resolveTransitionType('cross_dissolve')).toBe('cross_dissolve');
      expect(CutTransitionEngine.resolveTransitionType('whip_pan_right')).toBe('whip_pan');
      expect(CutTransitionEngine.resolveTransitionType('fade_to_black')).toBe('fade_black');
      expect(CutTransitionEngine.resolveTransitionType('fade_to_white')).toBe('fade_white');
      expect(CutTransitionEngine.resolveTransitionType('match_cut')).toBe('match_cut');
      expect(CutTransitionEngine.resolveTransitionType(undefined)).toBe('hard_cut');
    });

    it('validates transition temporal compatibility', () => {
      const fromClip: TimelineClip = {
        clipId: 'clip_1',
        trackId: 'track_v1',
        name: 'Clip 1',
        startTime: 0,
        duration: 2.0,
        sourceAssetId: 'asset_1',
        inPoint: 0,
        outPoint: 2.0,
        speedMultiplier: 1,
        volume: 1,
        opacity: 1,
      };

      const toClip: TimelineClip = {
        clipId: 'clip_2',
        trackId: 'track_v1',
        name: 'Clip 2',
        startTime: 2.0,
        duration: 0.4, // Short clip
        sourceAssetId: 'asset_2',
        inPoint: 0,
        outPoint: 0.4,
        speedMultiplier: 1,
        volume: 1,
        opacity: 1,
      };

      // Valid 0.5s transition (requires 0.25s each, both clips > 0.25s)
      const validTrans: TimelineTransition = {
        transitionId: 't1',
        fromClipId: 'clip_1',
        toClipId: 'clip_2',
        type: 'cross_dissolve',
        duration: 0.5,
        easing: 'ease_in_out',
      };
      expect(CutTransitionEngine.validateTransition(validTrans, fromClip, toClip).valid).toBe(true);

      // Invalid 1.0s transition (requires 0.5s each, but toClip is only 0.4s)
      const invalidTrans: TimelineTransition = {
        transitionId: 't2',
        fromClipId: 'clip_1',
        toClipId: 'clip_2',
        type: 'cross_dissolve',
        duration: 1.0,
        easing: 'ease_in_out',
      };
      const result = CutTransitionEngine.validateTransition(invalidTrans, fromClip, toClip);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('shorter than half');
    });

    it('generates transition CSS keyframes for web/HTML5 playback', () => {
      const dissolveCss = CutTransitionEngine.generateTransitionCss({
        transitionId: 't1',
        fromClipId: 'c1',
        toClipId: 'c2',
        type: 'cross_dissolve',
        duration: 0.8,
        easing: 'ease_in_out',
      });
      expect(dissolveCss).toContain('fadeOut 0.8s ease_in_out');
      expect(dissolveCss).toContain('fadeIn 0.8s ease_in_out');

      const blackCss = CutTransitionEngine.generateTransitionCss({
        transitionId: 't2',
        fromClipId: 'c1',
        toClipId: 'c2',
        type: 'fade_black',
        duration: 1.0,
        easing: 'linear',
      });
      expect(blackCss).toContain('dipToColor 1s linear');
    });
  });

  describe('TimelineAssembler', () => {
    const dummyShots: ShotContract[] = [
      {
        id: 'SHOT_01',
        purpose: 'establishing',
        duration: 3.5,
        camera: { movement: 'pan_right', framing: 'wide_shot' },
        transitionOut: { type: 'dissolve', duration: 0.6 },
      } as ShotContract,
      {
        id: 'SHOT_02',
        purpose: 'dialogue_coverage',
        duration: 2.5,
        camera: { movement: 'static', framing: 'medium_close_up' },
        transitionOut: { type: 'cut', duration: 0 },
      } as ShotContract,
    ];

    const dummyAudioMix: AudioMixContract = {
      mixContractId: 'mix_test_01',
      projectId: 'proj_timeline_test',
      dialogueTracks: [
        {
          dialogueLineId: 'line_01',
          characterId: 'char_kaito',
          shotId: 'SHOT_02',
          text: 'We are in position.',
          startTime: 3.8,
          duration: 1.5,
          audioAssetId: 'ASSET_AUDIO_DIAL_01',
        },
      ],
      musicTracks: [
        {
          musicTrackId: 'music_01',
          sceneId: 'SCENE_01',
          title: 'Suspense Theme',
          genre: 'cinematic_orchestral',
          mood: 'suspenseful',
          bpm: 120,
          startTime: 0,
          duration: 6.0,
          audioAssetId: 'ASSET_AUDIO_MUSIC_01',
          fadeInDuration: 1.0,
          fadeOutDuration: 1.0,
        },
      ],
      sfxCues: [
        {
          cueId: 'sfx_01',
          shotId: 'SHOT_01',
          name: 'wind_howl',
          category: 'ambient',
          timestamp: 0.5,
          duration: 2.0,
          volume: 0.8,
          audioAssetId: 'ASSET_AUDIO_SFX_01',
        },
      ],
      masterVolume: 1.0,
      dialogueVolume: 1.0,
      musicVolume: 0.7,
      sfxVolume: 0.8,
      duckingConfig: {
        enabled: true,
        duckAmountDb: -6,
        attackMs: 100,
        releaseMs: 300,
        duckingIntervals: [{ startTime: 3.7, endTime: 5.4, duckDb: -6 }],
      },
      totalDuration: 6.0,
      createdAt: new Date().toISOString(),
    };

    it('assembles a synchronized multi-track TimelineSequence', () => {
      const sequence = TimelineAssembler.assemble({
        projectId: 'proj_timeline_test',
        sceneId: 'SCENE_01',
        shots: dummyShots,
        audioMix: dummyAudioMix,
      });

      expect(sequence.tracks).toHaveLength(5);

      // Track 0: Video
      const videoTrack = sequence.tracks[0];
      expect(videoTrack.trackType).toBe('video');
      expect(videoTrack.clips).toHaveLength(2);
      expect(videoTrack.clips[0].startTime).toBe(0);
      expect(videoTrack.clips[0].duration).toBe(3.5);
      expect(videoTrack.clips[1].startTime).toBe(3.5);
      expect(videoTrack.clips[1].duration).toBe(2.5);

      // Transitions
      expect(sequence.transitions).toHaveLength(1);
      expect(sequence.transitions[0].type).toBe('cross_dissolve');
      expect(sequence.transitions[0].duration).toBe(0.6);

      // Track 1: Dialogue
      const dialTrack = sequence.tracks[1];
      expect(dialTrack.trackType).toBe('audio_dialogue');
      expect(dialTrack.clips).toHaveLength(1);
      expect(dialTrack.clips[0].startTime).toBe(3.8);

      // Track 2: Music
      const musicTrack = sequence.tracks[2];
      expect(musicTrack.trackType).toBe('audio_music');
      expect(musicTrack.clips).toHaveLength(1);
      expect(musicTrack.clips[0].duration).toBe(6.0);

      // Track 3: SFX
      const sfxTrack = sequence.tracks[3];
      expect(sfxTrack.trackType).toBe('audio_sfx');
      expect(sfxTrack.clips).toHaveLength(1);

      // Track 4: Subtitles
      const subTrack = sequence.tracks[4];
      expect(subTrack.trackType).toBe('subtitle');
      expect(subTrack.clips).toHaveLength(1);
      expect(sequence.subtitles).toHaveLength(1);
      expect(sequence.subtitles[0].speaker).toBe('char_kaito');
      expect(sequence.subtitles[0].text).toBe('We are in position.');

      // Total Duration
      expect(sequence.totalDuration).toBe(6.0);
    });
  });

  describe('TimelineEditingPipelineStep', () => {
    it('executes in DAG pipeline and registers timeline and subtitle assets', async () => {
      const assetRegistry: IAssetRegistry = new InMemoryAssetRegistry();
      const step = new TimelineEditingPipelineStep(assetRegistry);

      const context: PipelineContext = {
        executionId: 'exec_timeline_01',
        state: {
          projectId: 'proj_pipeline_timeline',
          shotContracts: [
            {
              id: 'SHOT_PIPE_01',
              purpose: 'establishing',
              duration: 4.0,
            } as ShotContract,
          ],
          audioMix: {
            mixContractId: 'mix_pipe_01',
            projectId: 'proj_pipeline_timeline',
            dialogueTracks: [
              {
                dialogueLineId: 'line_p1',
                characterId: 'kaito',
                shotId: 'SHOT_PIPE_01',
                text: 'Target acquired.',
                startTime: 1.0,
                duration: 2.0,
                audioAssetId: 'ASSET_DIAL_P1',
              },
            ],
            musicTracks: [],
            sfxCues: [],
            totalDuration: 4.0,
          },
        },
        logger: defaultLogger,
      };

      const result = await step.run(context);
      expect(result.timelineSequence).toBeDefined();
      expect(result.srtContent).toContain('1\n00:00:01,000 --> 00:00:03,000\nKAITO: Target acquired.');
      expect(result.vttContent).toContain('WEBVTT');

      // Verify asset registration in AssetRegistry
      const registered = await assetRegistry.query({ seriesId: 'default_series' });
      expect(registered.some((a) => a.tags.includes('timeline'))).toBe(true);
      expect(registered.some((a) => a.tags.includes('srt'))).toBe(true);
      expect(registered.some((a) => a.tags.includes('vtt'))).toBe(true);

      // Verify pipeline state updated
      expect(context.state.timelineSequence).toBeDefined();
      expect(context.state.subtitlesSrt).toBeDefined();
    });
  });
});
