import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockAudioProvider,
  ElevenLabsVoiceAdapter,
  MusicGenAdapter,
  FoleySfxAdapter,
  VoiceStudio,
  ScoreComposer,
  FoleyMixer,
  AudioMixEngine,
  AudioProductionPipelineStep,
  ProviderRegistry,
  ProductionScene,
  ShotContract,
  Pipeline,
  MemoryStorage,
  FileSystemAssetRegistry,
} from '../src/index.js';

describe('Voice, Music & SFX Audio Studio', () => {
  const sampleShot1: ShotContract = {
    id: 'SHOT_SC01_SH01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'dialogue_coverage',
    complexity: 'simple_transform',
    rendererIntent: 'deterministic_hyperframes',
    frame: { durationSeconds: 3.5, targetFps: 24, aspectRatio: '16:9' },
    camera: { focalLength: '50mm', shotSize: 'medium', angle: 'eye_level', movement: 'static', semanticSkills: [] },
    lighting: { keyLightDirection: 'left', mood: 'tense', colorTemperature: 'cool', fogAtmosphere: false },
    composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
    acting: [
      {
        characterId: 'char_kaito',
        pose: 'standing',
        expression: 'serious',
        gazeDirection: 'direct_to_camera',
        dialogueLine: 'We have breached the perimeter.',
      },
    ],
    transition: { type: 'cut', durationSeconds: 0 },
    environmentLocationId: 'loc_citadel',
    environmentZoneId: 'corridor',
    audioCue: { sfx: ['heavy_door_creak', 'distant_alarm'] },
    requiredAssetIds: ['ASSET_CHAR_KAITO'],
    dependsOnShotIds: [],
    directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
    provenance: { decidedAt: new Date().toISOString() },
  };

  const sampleShot2: ShotContract = {
    ...sampleShot1,
    id: 'SHOT_SC01_SH02',
    shotNumber: 2,
    acting: [
      {
        characterId: 'char_elena',
        pose: 'standing',
        expression: 'focused',
        gazeDirection: 'screen_left',
        dialogueLine: 'Proceed with caution.',
      },
    ],
    audioCue: { sfx: ['energy_blade_ignite'] },
    dependsOnShotIds: ['SHOT_SC01_SH01'],
  };

  const sampleScene: ProductionScene = {
    id: 'SCENE_01',
    projectId: 'proj_audio_test',
    sceneNumber: 1,
    heading: 'INT. CITADEL CORRIDOR - NIGHT',
    purpose: 'action',
    narrativeIntent: {
      dramaticGoal: 'Infiltrate citadel corridor',
      emotionalTone: 'tense',
      pacingPriority: 'dynamic',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shots: [sampleShot1, sampleShot2],
  };

  describe('MockAudioProvider', () => {
    it('synthesizes dialogue with realistic word duration', async () => {
      const provider = new MockAudioProvider();
      const res = await provider.execute({
        taskType: 'voice_synth',
        input: {
          shotId: 'SHOT_01',
          characterId: 'char_kaito',
          text: 'Hold your fire until my signal.',
        },
      });

      expect(res.providerId).toBe('mock-audio-provider');
      const out = (res.output as any).dialogueLine;
      expect(out.characterId).toBe('char_kaito');
      expect(out.durationSeconds).toBeGreaterThanOrEqual(1.2);
      expect(out.audioUri).toContain('.wav');
    });

    it('scores scene background music with requested duration', async () => {
      const provider = new MockAudioProvider();
      const res = await provider.execute({
        taskType: 'music_score',
        input: {
          sceneId: 'SCENE_01',
          mood: 'epic_kinetic',
          durationSeconds: 15.0,
        },
      });

      const out = (res.output as any).musicTrack;
      expect(out.sceneId).toBe('SCENE_01');
      expect(out.durationSeconds).toBe(15.0);
      expect(out.audioUri).toContain('.mp3');
    });

    it('generates SFX cues', async () => {
      const provider = new MockAudioProvider();
      const res = await provider.execute({
        taskType: 'sfx_gen',
        input: {
          shotId: 'SHOT_01',
          name: 'laser_blast',
        },
      });

      const out = (res.output as any).sfxCue;
      expect(out.name).toBe('laser_blast');
      expect(out.category).toBe('foley');
      expect(out.audioUri).toContain('.wav');
    });
  });

  describe('ElevenLabsVoiceAdapter', () => {
    it('formats request payload for ElevenLabs API', async () => {
      let capturedPayload: any;
      const adapter = new ElevenLabsVoiceAdapter({
        executor: async (payload) => {
          capturedPayload = payload;
          return { audioUri: 'custom/voice.wav', durationSeconds: 2.5 };
        },
      });

      const res = await adapter.execute({
        taskType: 'voice_synth',
        input: {
          text: 'Target acquired.',
          voiceProfile: {
            characterId: 'char_elena',
            voiceId: 'eleven_elena_v2',
            provider: 'elevenlabs',
            gender: 'female',
            age: 'adult',
            pitch: 0.0,
            speakingRate: 1.1,
            stability: 0.8,
            claritySimilarity: 0.9,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.voice_id).toBe('eleven_elena_v2');
      expect(capturedPayload.voice_settings.speaking_rate).toBe(1.1);
      expect((res.output as any).dialogueLine.audioUri).toBe('custom/voice.wav');
    });
  });

  describe('MusicGenAdapter', () => {
    it('translates scene mood and tempo into music generation prompt', async () => {
      let capturedPayload: any;
      const adapter = new MusicGenAdapter({
        executor: async (payload) => {
          capturedPayload = payload;
          return { audioUri: 'custom/score.mp3' };
        },
      });

      await adapter.execute({
        taskType: 'music_score',
        input: {
          sceneId: 'SC01',
          genre: 'cyberpunk_synthwave',
          mood: 'neon_noir',
          tempoBpm: 120,
          durationSeconds: 10.0,
        },
      });

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.prompt).toContain('cyberpunk_synthwave');
      expect(capturedPayload.prompt).toContain('neon_noir');
      expect(capturedPayload.tempo_bpm).toBe(120);
    });
  });

  describe('FoleySfxAdapter', () => {
    it('infers SFX category from cue name', async () => {
      const adapter = new FoleySfxAdapter();
      const res1 = await adapter.execute({
        taskType: 'sfx_gen',
        input: { name: 'heavy_boot_footsteps' },
      });
      expect((res1.output as any).sfxCue.category).toBe('foley');

      const res2 = await adapter.execute({
        taskType: 'sfx_gen',
        input: { name: 'distant_thunder_rain' },
      });
      expect((res2.output as any).sfxCue.category).toBe('ambient');

      const res3 = await adapter.execute({
        taskType: 'sfx_gen',
        input: { name: 'metal_impact_crash' },
      });
      expect((res3.output as any).sfxCue.category).toBe('impact');
    });
  });

  describe('VoiceStudio', () => {
    it('manages persistent voice profiles and synchronizes dialogue with LipSync visemes', async () => {
      const registry = new ProviderRegistry();
      registry.register(new MockAudioProvider());
      const studio = new VoiceStudio(registry);

      // 1. Get or create voice profile
      const profile = studio.getOrCreateVoiceProfile('series_01', 'char_kaito', {
        voiceId: 'kaito_commander',
        speakingRate: 1.05,
      });
      expect(profile.characterId).toBe('char_kaito');
      expect(profile.voiceId).toBe('kaito_commander');

      // 2. Synthesize dialogue line
      const result = await studio.synthesizeDialogue({
        seriesId: 'series_01',
        shotId: 'SHOT_01',
        characterId: 'char_kaito',
        text: 'All units fallback to secondary perimeter.',
      });

      expect(result.dialogueLine.text).toBe('All units fallback to secondary perimeter.');
      expect(result.dialogueLine.durationSeconds).toBeGreaterThan(1.0);
      expect(result.visemes.length).toBeGreaterThan(0);
      // Ensure lip-sync spans entire duration
      const lastViseme = result.visemes[result.visemes.length - 1];
      expect(lastViseme.timeSeconds).toBeLessThanOrEqual(result.dialogueLine.durationSeconds);
    });
  });

  describe('ScoreComposer', () => {
    it('composes scene score and calculates total duration from shots', async () => {
      const registry = new ProviderRegistry();
      registry.register(new MockAudioProvider());
      const composer = new ScoreComposer(registry);

      const result = await composer.composeSceneScore(sampleScene);
      expect(result.musicTrack.sceneId).toBe('SCENE_01');
      expect(result.musicTrack.durationSeconds).toBe(7.0); // 3.5s + 3.5s
      expect(result.musicTrack.tempoBpm).toBe(130); // Action scene tempo
      expect(result.musicTrack.audioAssetId).toContain('ASSET_MUSIC_');
    });
  });

  describe('FoleyMixer', () => {
    it('generates timed SFX cues and staggers them within shot duration', async () => {
      const registry = new ProviderRegistry();
      registry.register(new MockAudioProvider());
      const mixer = new FoleyMixer(registry);

      const result = await mixer.generateShotSfx(sampleShot1, { shotStartTimeSeconds: 5.0 });
      expect(result.sfxCues.length).toBe(2);
      expect(result.sfxCues[0].name).toBe('heavy_door_creak');
      expect(result.sfxCues[0].timestampSeconds).toBe(5.0);
      expect(result.sfxCues[1].name).toBe('distant_alarm');
      expect(result.sfxCues[1].timestampSeconds).toBeGreaterThan(5.0);
    });
  });

  describe('AudioMixEngine', () => {
    it('compiles master AudioMixContract and calculates dialogue ducking intervals', () => {
      const engine = new AudioMixEngine();
      const mix = engine.compileAudioMix(
        'proj_test',
        'series_test',
        [
          {
            id: 'line_01',
            shotId: 'SHOT_01',
            characterId: 'char_kaito',
            text: 'Incoming fire!',
            emotion: 'urgent',
            startTimeSeconds: 2.0,
            durationSeconds: 1.5,
            loudnessDb: -14.0,
          },
        ],
        [
          {
            id: 'music_01',
            sceneId: 'SC01',
            title: 'Action Theme',
            genre: 'orchestral',
            mood: 'action',
            tempoBpm: 120,
            startTimeSeconds: 0.0,
            durationSeconds: 10.0,
            volume: 0.7,
            fadeInSeconds: 1.0,
            fadeOutSeconds: 1.0,
          },
        ],
        [],
        10.0
      );

      expect(mix.dialogueTracks.length).toBe(1);
      expect(mix.musicTracks.length).toBe(1);
      expect(mix.ducking.enabled).toBe(true);

      const duckingWindows = engine.calculateDuckingIntervals(mix);
      expect(duckingWindows.length).toBe(1);
      expect(duckingWindows[0].startSeconds).toBeLessThan(2.0); // attack window
      expect(duckingWindows[0].endSeconds).toBeGreaterThan(3.5); // release window

      const webAudioCode = engine.generateWebAudioScript(mix);
      expect(webAudioCode).toContain('AudioContext');
      expect(webAudioCode).toContain('linearRampToValueAtTime');
    });
  });

  describe('AudioProductionPipelineStep', () => {
    it('executes audio production in DAG pipeline, populating dialogue, music, SFX, and asset registry', async () => {
      const storage = new MemoryStorage();
      const registry = new ProviderRegistry();
      registry.register(new MockAudioProvider());
      const assetRegistry = new FileSystemAssetRegistry(storage);

      const step = new AudioProductionPipelineStep(
        undefined,
        undefined,
        undefined,
        undefined,
        registry,
        assetRegistry
      );

      const pipeline = new Pipeline({
        name: 'test_audio_pipeline',
        steps: [step],
        storage,
      });

      const resultContext = await pipeline.execute('proj_audio_pipeline_test', {
        projectId: 'proj_audio_pipeline_test',
        seriesId: 'series_cyber',
        productionScenes: [sampleScene],
      });

      const state = resultContext.state;
      const mix = state.audioMixContract as any;
      expect(mix).toBeDefined();
      expect(mix.dialogueTracks.length).toBe(2);
      expect(mix.musicTracks.length).toBe(1);
      expect(mix.sfxCues.length).toBe(3); // 2 from shot1, 1 from shot2

      const visemeMap = state.actorVisemeMap as Record<string, any>;
      expect(visemeMap['SHOT_SC01_SH01_char_kaito']).toBeDefined();
      expect(visemeMap['SHOT_SC01_SH02_char_elena']).toBeDefined();

      const summary = state.audioStepSummary as any;
      expect(summary.totalDialogueLines).toBe(2);
      expect(summary.totalMusicTracks).toBe(1);
      expect(summary.totalSfxCues).toBe(3);

      // Verify assets were registered
      const allAssets = assetRegistry.getAll();
      expect(allAssets.length).toBe(6); // 1 music + 2 dialogue + 3 sfx
    });
  });
});
