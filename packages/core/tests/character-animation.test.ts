import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShotContract,
  ProductionScene,
  Skeleton,
  CharacterAnimationLibrary,
  FacialSystem,
  LipSyncEngine,
  AnimationBlender,
  CharacterController,
  RigToHyperFramesCompiler,
  CharacterAnimationPipelineStep,
  Pipeline,
  MemoryStorage,
} from '../src/index.js';

describe('Character Animation System (Phase 8)', () => {
  let skeleton: Skeleton;
  let library: CharacterAnimationLibrary;
  let facialSystem: FacialSystem;
  let lipSyncEngine: LipSyncEngine;
  let blender: AnimationBlender;

  beforeEach(() => {
    skeleton = Skeleton.createStandardHumanoid();
    library = CharacterAnimationLibrary.createDefault();
    facialSystem = new FacialSystem();
    lipSyncEngine = new LipSyncEngine();
    blender = new AnimationBlender();
  });

  describe('Skeleton & Forward Kinematics (FK)', () => {
    it('initializes standard 15 humanoid bones with correct hierarchy', () => {
      const bones = skeleton.listBones();
      expect(bones).toHaveLength(15);

      const torso = skeleton.getBone('torso');
      expect(torso?.parentName).toBeUndefined();

      const head = skeleton.getBone('head');
      expect(head?.parentName).toBe('neck');

      const handL = skeleton.getBone('hand_L');
      expect(handL?.parentName).toBe('lower_arm_L');

      const footR = skeleton.getBone('foot_R');
      expect(footR?.parentName).toBe('lower_leg_R');
    });

    it('computes world coordinates using Forward Kinematics', () => {
      const defaultTransforms = skeleton.computeWorldTransforms({});

      expect(defaultTransforms.torso).toBeDefined();
      expect(defaultTransforms.torso.x).toBe(960);
      expect(defaultTransforms.torso.y).toBe(540);

      // Neck is at y = 540 - 60 = 480
      expect(defaultTransforms.neck.y).toBe(480);
      // Head is at y = 480 - 15 = 465
      expect(defaultTransforms.head.y).toBe(465);

      // Rotating torso by 90 degrees rotates child bones
      const rotated = skeleton.computeWorldTransforms({
        torso: { x: 960, y: 540, rotation: 90, scaleX: 1, scaleY: 1 },
      });

      expect(rotated.torso.rotation).toBe(90);
      expect(rotated.neck.rotation).toBe(90);
      // Child x offset rotates with torso
      expect(rotated.neck.x).toBeCloseTo(1020, 0);
    });
  });

  describe('CharacterAnimationLibrary', () => {
    it('contains all 14 standard keyframed clips', () => {
      const clips = library.listClips();
      expect(clips.length).toBe(14);

      const expected = [
        'idle', 'walk', 'run', 'sit', 'stand', 'turn',
        'look', 'point', 'wave', 'pick_up', 'hold', 'react', 'fear', 'surprise'
      ];

      for (const name of expected) {
        const clip = library.getClip(name);
        expect(clip).toBeDefined();
        expect(clip?.name).toBe(name);
        expect(clip?.keyframes.length).toBeGreaterThanOrEqual(1);
        expect(clip?.durationSeconds).toBeGreaterThan(0);
      }
    });

    it('walk and run clips are loopable with symmetric keyframes', () => {
      const walk = library.getClip('walk')!;
      expect(walk.loop).toBe(true);
      expect(walk.durationSeconds).toBe(1.0);

      const run = library.getClip('run')!;
      expect(run.loop).toBe(true);
      expect(run.durationSeconds).toBe(0.6);
    });
  });

  describe('FacialSystem & Automated Blink Cycle', () => {
    it('computes open eyes during neutral rest and blinks periodically', () => {
      // At t = 1.0s, eyes are open
      expect(facialSystem.computeBlinkState(1.0)).toBe('open');

      // Natural blink occurs around t = 2.85s - 3.0s
      expect(facialSystem.computeBlinkState(2.86)).toBe('half');
      expect(facialSystem.computeBlinkState(2.92)).toBe('closed');
      expect(facialSystem.computeBlinkState(2.97)).toBe('half');

      // Cycle resets at t = 3.05s
      expect(facialSystem.computeBlinkState(3.05)).toBe('open');
    });

    it('builds complete facial state with gaze direction and expressions', () => {
      const state = facialSystem.computeFacialState(1.5, 'determined', 'screen_left', 'A', 'raised');
      expect(state.expression).toBe('determined');
      expect(state.eyeDirection).toBe('screen_left');
      expect(state.mouthShape).toBe('A');
      expect(state.eyebrowState).toBe('raised');
      expect(state.blinkState).toBe('open');
    });
  });

  describe('LipSyncEngine', () => {
    it('translates dialogue into timed visemes finishing at rest', () => {
      const dialogue = 'We move now';
      const visemes = lipSyncEngine.generateVisemes(dialogue, 2.0);

      expect(visemes.length).toBeGreaterThan(3);
      expect(visemes[0].timeSeconds).toBe(0);
      expect(visemes[visemes.length - 1].mouthShape).toBe('rest');
      expect(visemes[visemes.length - 1].timeSeconds).toBe(2.0);

      // Verify character mapping ('w' -> 'WQ', 'm' -> 'M', 'o' -> 'O')
      const shapes = visemes.map((v) => v.mouthShape);
      expect(shapes).toContain('WQ');
      expect(shapes).toContain('M');
      expect(shapes).toContain('O');
    });

    it('samples mouth shape accurately across timeline', () => {
      const visemes = [
        { timeSeconds: 0.0, mouthShape: 'WQ' as const },
        { timeSeconds: 0.5, mouthShape: 'E' as const },
        { timeSeconds: 1.0, mouthShape: 'M' as const },
        { timeSeconds: 1.5, mouthShape: 'rest' as const },
      ];

      expect(lipSyncEngine.sampleMouthShape(visemes, 0.2)).toBe('WQ');
      expect(lipSyncEngine.sampleMouthShape(visemes, 0.7)).toBe('E');
      expect(lipSyncEngine.sampleMouthShape(visemes, 1.2)).toBe('M');
      expect(lipSyncEngine.sampleMouthShape(visemes, 2.0)).toBe('rest');
    });
  });

  describe('AnimationBlender', () => {
    it('samples keyframes at arbitrary timestamps with linear interpolation', () => {
      const walk = library.getClip('walk')!;
      const kfMid = blender.sampleClip(walk, 0.25);

      expect(kfMid.timeSeconds).toBe(0.25);
      expect(kfMid.boneTransforms.upper_leg_L).toBeDefined();
      // Should be between kf0 (25) and kf1 (-25) -> 0 degrees
      expect(kfMid.boneTransforms.upper_leg_L.rotation).toBeCloseTo(0, 0);
    });

    it('blends two keyframes together with factor', () => {
      const kfA = {
        timeSeconds: 0,
        boneTransforms: { torso: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
      };
      const kfB = {
        timeSeconds: 0,
        boneTransforms: { torso: { x: 10, y: 20, rotation: 30, scaleX: 1, scaleY: 1 } },
      };

      const blended = blender.blendKeyframes(kfA as any, kfB as any, 0.5);
      expect(blended.boneTransforms.torso.x).toBe(5);
      expect(blended.boneTransforms.torso.y).toBe(10);
      expect(blended.boneTransforms.torso.rotation).toBe(15);
    });
  });

  describe('CharacterController', () => {
    it('manages full actor state: clip, speech, gaze, and prop attachment', () => {
      const controller = new CharacterController('char_kaito', skeleton, library, facialSystem, lipSyncEngine, blender);

      controller.playClip('walk', true);
      controller.setExpression('fierce');
      controller.setEyeDirection('screen_right');
      controller.speak('Halt!', 1.5);
      controller.attachProp('hand_R', 'PROP_CYBER_BLADE', { x: 0, y: 15, rotation: 45 });

      const snapshot = controller.samplePose(0.3);

      expect(snapshot.timeSeconds).toBe(0.3);
      expect(snapshot.facialState.expression).toBe('fierce');
      expect(snapshot.facialState.eyeDirection).toBe('screen_right');
      expect(snapshot.worldJoints.head).toBeDefined();
      expect(snapshot.props).toHaveLength(1);
      expect(snapshot.props[0].propId).toBe('PROP_CYBER_BLADE');
    });
  });

  describe('RigToHyperFramesCompiler', () => {
    it('compiles digital actor tracks into HyperFrames DOM and GSAP tweens', () => {
      const compiler = new RigToHyperFramesCompiler();
      const track = {
        characterId: 'char_kaito',
        shotId: 'SHOT_01',
        clipName: 'walk',
        durationSeconds: 1.0,
        loop: true,
        dialogue: 'Go!',
        props: [],
        sampledKeyframes: [
          {
            timeSeconds: 0,
            boneTransforms: {
              upper_arm_L: { x: 0, y: 0, rotation: -20, scaleX: 1, scaleY: 1 },
              upper_arm_R: { x: 0, y: 0, rotation: 20, scaleX: 1, scaleY: 1 },
            },
            facialState: {
              expression: 'neutral',
              eyeDirection: 'direct_to_camera' as const,
              blinkState: 'open' as const,
              mouthShape: 'rest' as const,
              eyebrowState: 'neutral' as const,
            },
          },
          {
            timeSeconds: 0.5,
            boneTransforms: {
              upper_arm_L: { x: 0, y: 0, rotation: 20, scaleX: 1, scaleY: 1 },
              upper_arm_R: { x: 0, y: 0, rotation: -20, scaleX: 1, scaleY: 1 },
            },
            facialState: {
              expression: 'neutral',
              eyeDirection: 'direct_to_camera' as const,
              blinkState: 'closed' as const,
              mouthShape: 'O' as const,
              eyebrowState: 'neutral' as const,
            },
          },
        ],
      };

      const result = compiler.compileTrackToHyperFrames(track as any);

      expect(result.domHtml).toContain('id="actor_char_kaito"');
      expect(result.domHtml).toContain('id="actor_char_kaito_torso"');
      expect(result.domHtml).toContain('id="actor_char_kaito_head"');
      expect(result.gsapScript).toContain('tl.to("#actor_char_kaito_upper_arm_L"');
      expect(result.gsapScript).toContain('tl.to("#actor_char_kaito_eyes"');
      expect(result.gsapScript).toContain('tl.to("#actor_char_kaito_mouth"');
    });
  });

  describe('CharacterAnimationPipelineStep (DAG Integration)', () => {
    it('executes in DAG pipeline and synthesizes actor tracks for all shots', async () => {
      const storage = new MemoryStorage();

      const testShot: ShotContract = {
        id: 'SHOT_PIPE_ACT_01',
        sceneId: 'SC01',
        shotNumber: 1,
        purpose: 'dialogue_coverage',
        complexity: 'rigged_character_action',
        rendererIntent: 'deterministic_rigged_2d',
        frame: { durationSeconds: 3.0, targetFps: 24, aspectRatio: '16:9' },
        camera: { focalLength: '35mm', shotSize: 'medium', angle: 'eye_level', movement: 'static' },
        lighting: { keyLightDirection: 'front', mood: 'dramatic', colorTemperature: 'neutral', fogAtmosphere: false },
        composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
        acting: [
          {
            characterId: 'char_kaito',
            pose: 'walking',
            expression: 'determined',
            gazeDirection: 'screen_left',
            dialogueLine: 'We must secure the vault.',
          },
        ],
        transition: { type: 'cut', durationSeconds: 0 },
        audioCue: { sfx: [] },
        requiredAssetIds: ['ASSET_CHAR_KAITO'],
        dependsOnShotIds: [],
        directorLocks: {},
        provenance: { decidedAt: new Date().toISOString() },
      };

      const scenes: ProductionScene[] = [
        {
          id: 'SC01',
          projectId: 'PROJ_ACTOR_DAG',
          sceneNumber: 1,
          heading: 'INT. VAULT CORRIDOR - NIGHT',
          purpose: 'dialogue_coverage',
          shots: [testShot],
          coverageSummary: { totalShots: 1, estimatedDurationSeconds: 3.0, complexityScore: 2 },
          actingDirectives: [],
          directorNotes: 'Kaito walks toward vault speaking',
        },
      ];

      const step = new CharacterAnimationPipelineStep(library);
      const pipeline = new Pipeline({
        name: 'Character Animation Pipeline Test',
        steps: [step],
        storage,
      });

      const result = await pipeline.execute('PROJ_ACTOR_DAG', {
        productionScenes: scenes,
      });

      expect(result.completedStepIds).toContain('character_digital_actor_animation');
      const tracks = result.state.digitalActorTracks as Record<string, any[]>;
      expect(tracks[testShot.id]).toBeDefined();
      expect(tracks[testShot.id]).toHaveLength(1);

      const track = tracks[testShot.id][0];
      expect(track.characterId).toBe('char_kaito');
      expect(track.clipName).toBe('walk');
      expect(track.dialogue).toBe('We must secure the vault.');
      expect(track.sampledKeyframes.length).toBeGreaterThan(5);

      const summary = result.state.characterAnimationSummary as any;
      expect(summary.totalActorsAnimated).toBe(1);
      expect(summary.totalDialogueTracksLipSynced).toBe(1);
    });
  });
});
