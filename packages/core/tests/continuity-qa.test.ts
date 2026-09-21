import { describe, it, expect } from 'vitest';
import {
  ContinuityQAEvaluator,
  AutoRepairEngine,
  ContinuityQAPipelineStep,
  ShotContract,
  TimelineSequence,
  PipelineContext,
  InMemoryAssetRegistry,
  defaultLogger,
} from '../src/index.js';

describe('Phase 12 — Continuity QA & Automated Repair Engine', () => {
  const createBaseShot = (id: string, overrides: Partial<ShotContract> = {}): ShotContract =>
    ({
      id,
      sceneId: 'SCENE_01',
      shotNumber: 1,
      purpose: 'dialogue_coverage',
      complexity: 'static',
      rendererIntent: 'deterministic_hyperframes',
      frame: { durationSeconds: 3.0, aspectRatio: '16:9', targetFps: 24 },
      camera: {
        focalLength: '35mm',
        shotSize: 'medium_close_up',
        angle: 'eye_level',
        movement: 'static',
        semanticSkills: [],
      },
      lighting: {
        keyLightDirection: 'left',
        mood: 'tense',
        colorTemperature: 'neutral',
        fogAtmosphere: false,
      },
      composition: {
        rule: 'rule_of_thirds',
        subjectPlacement: 'center',
        depthLayers: { foreground: [], midground: [], background: [] },
      },
      acting: [],
      transition: { type: 'cut', durationSeconds: 0 },
      audioCue: { sfx: [] },
      requiredAssetIds: [],
      dependsOnShotIds: [],
      directorLocks: {},
      provenance: { decidedAt: new Date().toISOString() },
      ...overrides,
    } as ShotContract);

  describe('ContinuityQAEvaluator', () => {
    it('detects 180-degree rule / screen direction flip without camera move', () => {
      const shotA = createBaseShot('SHOT_01', {
        acting: [
          {
            characterId: 'kaito',
            pose: 'standing',
            expression: 'focused',
            gazeDirection: 'screen_right',
          },
        ],
      });

      const shotB = createBaseShot('SHOT_02', {
        acting: [
          {
            characterId: 'kaito',
            pose: 'standing',
            expression: 'focused',
            gazeDirection: 'screen_left', // Abrupt flip!
          },
        ],
        camera: {
          focalLength: '35mm',
          shotSize: 'close_up',
          angle: 'eye_level',
          movement: 'static',
          semanticSkills: [],
        },
      });

      const report = ContinuityQAEvaluator.evaluate({
        projectId: 'proj_qa_test',
        shots: [shotA, shotB],
      });

      expect(report.issues.some((i) => i.type === 'screen_direction_180')).toBe(true);
      const issue = report.issues.find((i) => i.type === 'screen_direction_180')!;
      expect(issue.severity).toBe('warning');
      expect(issue.autoRepairable).toBe(true);
    });

    it('detects jarring lighting color temperature shift in same location', () => {
      const shotA = createBaseShot('SHOT_01', {
        environmentLocationId: 'loc_bridge',
        lighting: {
          keyLightDirection: 'left',
          mood: 'warm',
          colorTemperature: 'warm',
          fogAtmosphere: false,
        },
      });

      const shotB = createBaseShot('SHOT_02', {
        environmentLocationId: 'loc_bridge',
        lighting: {
          keyLightDirection: 'left',
          mood: 'cold',
          colorTemperature: 'cool', // Jarring shift in same room!
          fogAtmosphere: false,
        },
      });

      const report = ContinuityQAEvaluator.evaluate({
        projectId: 'proj_qa_test',
        shots: [shotA, shotB],
      });

      expect(report.issues.some((i) => i.type === 'lighting_jump')).toBe(true);
      const issue = report.issues.find((i) => i.type === 'lighting_jump')!;
      expect(issue.autoRepairable).toBe(true);
    });

    it('detects wardrobe mismatch across shots in the same scene', () => {
      const shotA = createBaseShot('SHOT_01', {
        acting: [
          {
            characterId: 'elena',
            outfitId: 'uniform_tactical',
            pose: 'standing',
            expression: 'neutral',
            gazeDirection: 'direct_to_camera',
          },
        ],
      });

      const shotB = createBaseShot('SHOT_02', {
        acting: [
          {
            characterId: 'elena',
            outfitId: 'dress_casual', // Incompatible wardrobe switch!
            pose: 'standing',
            expression: 'neutral',
            gazeDirection: 'direct_to_camera',
          },
        ],
      });

      const report = ContinuityQAEvaluator.evaluate({
        projectId: 'proj_qa_test',
        shots: [shotA, shotB],
      });

      expect(report.issues.some((i) => i.type === 'wardrobe_mismatch')).toBe(true);
      const issue = report.issues.find((i) => i.type === 'wardrobe_mismatch')!;
      expect(issue.severity).toBe('critical');
      expect(report.overallPassed).toBe(false);
    });

    it('detects pacing stalling when 3+ consecutive shots share identical shot size', () => {
      const shotA = createBaseShot('SHOT_01', {
        camera: { focalLength: '50mm', shotSize: 'close_up', angle: 'eye_level', movement: 'static', semanticSkills: [] },
      });
      const shotB = createBaseShot('SHOT_02', {
        camera: { focalLength: '50mm', shotSize: 'close_up', angle: 'eye_level', movement: 'static', semanticSkills: [] },
      });
      const shotC = createBaseShot('SHOT_03', {
        camera: { focalLength: '50mm', shotSize: 'close_up', angle: 'eye_level', movement: 'static', semanticSkills: [] },
      });

      const report = ContinuityQAEvaluator.evaluate({
        projectId: 'proj_qa_test',
        shots: [shotA, shotB, shotC],
      });

      expect(report.issues.some((i) => i.type === 'pacing_stalling')).toBe(true);
    });
  });

  describe('AutoRepairEngine', () => {
    it('applies automated repairs for 180-rule, lighting, wardrobe, and pacing issues', () => {
      const shotA = createBaseShot('SHOT_01', {
        environmentLocationId: 'loc_hangar',
        lighting: { keyLightDirection: 'left', mood: 'warm', colorTemperature: 'warm', fogAtmosphere: false },
        acting: [
          {
            characterId: 'kaito',
            outfitId: 'pilot_suit',
            pose: 'standing',
            expression: 'alert',
            gazeDirection: 'screen_right',
          },
        ],
      });

      const shotB = createBaseShot('SHOT_02', {
        environmentLocationId: 'loc_hangar',
        lighting: { keyLightDirection: 'left', mood: 'cold', colorTemperature: 'cool', fogAtmosphere: false },
        acting: [
          {
            characterId: 'kaito',
            outfitId: 'casual_vest', // Mismatch!
            pose: 'standing',
            expression: 'alert',
            gazeDirection: 'screen_left', // 180 flip!
          },
        ],
      });

      const timelineSequence: TimelineSequence = {
        sequenceId: 'seq_repair_01',
        projectId: 'proj_repair_test',
        name: 'Test Sequence',
        tracks: [
          {
            trackId: 'track_v1',
            trackType: 'video',
            name: 'Video',
            order: 0,
            clips: [
              {
                clipId: 'clip_v1_SHOT_01',
                trackId: 'track_v1',
                name: 'Shot 1',
                startTime: 0,
                duration: 3.0,
                sourceAssetId: 'a1',
                inPoint: 0,
                outPoint: 3.0,
                speedMultiplier: 1,
                volume: 1,
                opacity: 1,
              },
              {
                clipId: 'clip_v1_SHOT_02',
                trackId: 'track_v1',
                name: 'Shot 2',
                startTime: 3.0,
                duration: 3.0,
                sourceAssetId: 'a2',
                inPoint: 0,
                outPoint: 3.0,
                speedMultiplier: 1,
                volume: 1,
                opacity: 1,
              },
            ],
            isMuted: false,
            isLocked: false,
            volume: 1,
            pan: 0,
          },
        ],
        transitions: [
          {
            transitionId: 'trans_01',
            fromClipId: 'clip_v1_SHOT_01',
            toClipId: 'clip_v1_SHOT_02',
            type: 'hard_cut',
            duration: 0,
            easing: 'ease_in_out',
          },
        ],
        subtitles: [],
        totalDuration: 6.0,
        fps: 24,
        resolution: { width: 1920, height: 1080 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const initialReport = ContinuityQAEvaluator.evaluate({
        projectId: 'proj_repair_test',
        shots: [shotA, shotB],
        timelineSequence,
      });

      expect(initialReport.issues.length).toBeGreaterThan(0);

      const result = AutoRepairEngine.repair({
        report: initialReport,
        timelineSequence,
        shots: [shotA, shotB],
      });

      expect(result.appliedActions.length).toBeGreaterThan(0);

      // Verify wardrobe mismatch synchronized
      const repairedShotB = result.repairedShots.find((s) => s.id === 'SHOT_02');
      expect(repairedShotB?.acting[0].outfitId).toBe('pilot_suit');

      // Verify transition converted to cross dissolve to soften 180 / lighting jump
      const trans = result.repairedSequence.transitions[0];
      expect(trans.type).toBe('cross_dissolve');
    });
  });

  describe('ContinuityQAPipelineStep', () => {
    it('executes in DAG pipeline, repairs issues, and registers QA report asset', async () => {
      const assetRegistry = new InMemoryAssetRegistry();
      const step = new ContinuityQAPipelineStep(true, assetRegistry);

      const shotA = createBaseShot('SHOT_PIPE_01', {
        acting: [
          {
            characterId: 'kaito',
            outfitId: 'armor_mk1',
            pose: 'standing',
            expression: 'calm',
            gazeDirection: 'screen_right',
          },
        ],
      });

      const shotB = createBaseShot('SHOT_PIPE_02', {
        acting: [
          {
            characterId: 'kaito',
            outfitId: 'armor_mk2', // Mismatch!
            pose: 'standing',
            expression: 'calm',
            gazeDirection: 'screen_left', // 180 flip!
          },
        ],
      });

      const context: PipelineContext = {
        executionId: 'exec_qa_01',
        state: {
          projectId: 'proj_pipeline_qa',
          shotContracts: [shotA, shotB],
          timelineSequence: {
            sequenceId: 'seq_pipe_qa',
            projectId: 'proj_pipeline_qa',
            name: 'Pipeline Sequence',
            tracks: [
              {
                trackId: 'track_v1',
                trackType: 'video',
                name: 'Video',
                order: 0,
                clips: [
                  {
                    clipId: 'clip_v1_SHOT_PIPE_01',
                    trackId: 'track_v1',
                    name: 'Shot 1',
                    startTime: 0,
                    duration: 3.0,
                    sourceAssetId: 'a1',
                    inPoint: 0,
                    outPoint: 3.0,
                    speedMultiplier: 1,
                    volume: 1,
                    opacity: 1,
                  },
                  {
                    clipId: 'clip_v1_SHOT_PIPE_02',
                    trackId: 'track_v1',
                    name: 'Shot 2',
                    startTime: 3.0,
                    duration: 3.0,
                    sourceAssetId: 'a2',
                    inPoint: 0,
                    outPoint: 3.0,
                    speedMultiplier: 1,
                    volume: 1,
                    opacity: 1,
                  },
                ],
                isMuted: false,
                isLocked: false,
                volume: 1,
                pan: 0,
              },
            ],
            transitions: [
              {
                transitionId: 'trans_pipe_01',
                fromClipId: 'clip_v1_SHOT_PIPE_01',
                toClipId: 'clip_v1_SHOT_PIPE_02',
                type: 'hard_cut',
                duration: 0,
                easing: 'ease_in_out',
              },
            ],
            subtitles: [],
            totalDuration: 6.0,
            fps: 24,
            resolution: { width: 1920, height: 1080 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        logger: defaultLogger,
      };

      const result = await step.run(context);
      expect(result.report).toBeDefined();

      // State updated
      expect(context.state.continuityReport).toBeDefined();

      // Asset registered in AssetRegistry
      const assets = await assetRegistry.query({ seriesId: 'default_series' });
      expect(assets.some((a) => a.tags.includes('continuity'))).toBe(true);
    });
  });
});
