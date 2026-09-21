import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  FrameExtractor,
  VisualSemanticQAEvaluator,
  AutoRepairEngine,
  VisualSemanticQAPipelineStep,
  ShotContract,
  CharacterDNA,
  ContinuityQAReport,
  TimelineSequence,
  MediaToolchainDoctor,
  InMemoryAssetRegistry,
} from '../src/index.js';

describe('Phase 17 — Multimodal Visual Semantic Continuity QA', () => {
  const testDir = path.resolve('.studio', 'tests', 'visual-qa');
  const validMp4 = path.join(testDir, 'valid_test.mp4');
  const portraitMp4 = path.join(testDir, 'portrait_test.mp4');

  const testShot: ShotContract = {
    id: 'SHOT_VQA_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'static',
    rendererIntent: 'deterministic_hyperframes',
    frame: {
      durationSeconds: 1.0,
      aspectRatio: '16:9',
      targetFps: 24,
    },
    camera: {
      shotSize: 'medium',
      angle: 'eye_level',
      movement: 'static',
      focalLength: '50mm',
      semanticSkills: [],
    },
    acting: [
      {
        characterId: 'char_elena',
        pose: 'standing_cautious',
        expression: 'watchful',
        actionPrompt: 'Elena stands watchful at viewport',
        gazeDirection: 'screen_right',
      },
    ],
    lighting: {
      mood: 'noir_cyberpunk',
      colorTemperature: 'cool',
      keyLightDirection: 'left',
      fogAtmosphere: false,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: { foreground: [], midground: [], background: [] },
    },
    transition: {
      type: 'cut',
      durationSeconds: 0,
    },
    audioCue: { sfx: [] },
    requiredAssetIds: [],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: true,
      isFramingLocked: true,
      isRendererLocked: true,
      isActingLocked: true,
    },
    provenance: {
      decidedAt: new Date().toISOString(),
    },
  };

  const testCharacter: CharacterDNA = {
    id: 'char_elena',
    seriesId: 'series_cyber',
    name: 'Elena',
    aliases: ['Elena'],
    description: 'Athletic cyber operative with crimson braided hair and tactical trench coat.',
    visualAnchorPrompt: 'Athletic cyber operative with crimson braided hair and tactical trench coat.',
    traits: ['Alert', 'Determined'],
    currentVersion: 1,
    versions: [],
    outfits: [
      {
        id: 'outfit_01',
        name: 'Tactical Trench Coat',
        description: 'Tactical trench coat',
        referenceAssetIds: [],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();

    // Generate valid 16:9 MP4 (320x180)
    execSync(`"${ffmpeg}" -y -f lavfi -i testsrc=size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${validMp4}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Generate portrait MP4 (180x320)
    execSync(`"${ffmpeg}" -y -f lavfi -i testsrc=size=180x320:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${portraitMp4}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // 1. Keyframe Extraction
  it('1. extracts keyframes from valid MP4 video', () => {
    const frames = FrameExtractor.extractFrames(validMp4, { count: 3 });
    expect(frames.length).toBe(3);
    for (const f of frames) {
      expect(fs.existsSync(f.filePath)).toBe(true);
      expect(f.width).toBe(320);
      expect(f.height).toBe(180);
      expect(f.timestampSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it('2. throws error when extracting frames from non-existent video', () => {
    expect(() => {
      FrameExtractor.extractFrames(path.join(testDir, 'missing.mp4'));
    }).toThrow(/Cannot extract frames: invalid video file/);
  });

  // 2. Evaluator Local Analysis
  it('3. evaluates valid landscape video with passing score in local mode', async () => {
    const evaluator = new VisualSemanticQAEvaluator();
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_test',
      shot: testShot,
      videoPath: validMp4,
      characterProfiles: [testCharacter],
    });

    expect(report.passed).toBe(true);
    expect(report.evaluationMechanism).toBe('DETERMINISTIC_LOCAL');
    expect(report.overallVisualContinuityScore).toBeGreaterThanOrEqual(0.85);
    expect(report.identityConsistencyScore).toBeGreaterThanOrEqual(0.85);
    expect(report.spatialPerspectiveScore).toBeGreaterThanOrEqual(0.85);
    expect(report.evaluatedFramesCount).toBe(3);
    expect(report.defects.length).toBe(0);
  });

  it('4. detects spatial perspective defect on portrait video in landscape context', async () => {
    const evaluator = new VisualSemanticQAEvaluator();
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_test',
      shot: testShot,
      videoPath: portraitMp4,
      characterProfiles: [testCharacter],
    });

    expect(report.defects.length).toBeGreaterThan(0);
    const aspectDefect = report.defects.find((d) => d.issueType === 'spatial_perspective_mismatch');
    expect(aspectDefect).toBeDefined();
    expect(aspectDefect?.severity).toBe('warning');
    expect(report.retakeRecommendations.length).toBeGreaterThan(0);
  });

  it('5. returns failing report with critical defect when video is missing', async () => {
    const evaluator = new VisualSemanticQAEvaluator();
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_test',
      shot: testShot,
      videoPath: path.join(testDir, 'does_not_exist.mp4'),
    });

    expect(report.passed).toBe(false);
    expect(report.overallVisualContinuityScore).toBe(0.0);
    expect(report.defects.some((d) => d.severity === 'critical')).toBe(true);
    expect(report.retakeRecommendations.some((r) => r.strategy === 'surgical_retake')).toBe(true);
  });

  // 3. Mock Multimodal Gemini Provider
  it('6. evaluates video using mock multimodal LLM structured response', async () => {
    const mockLlm: any = {
      metadata: { id: 'mock-gemini', name: 'Mock Gemini' },
      isConfigured: () => true,
      getLastModelUsed: () => 'gemini-2.0-flash',
      generateStructured: async () => ({
        data: {
          identityConsistencyScore: 0.94,
          spatialPerspectiveScore: 0.91,
          visualDefectScore: 0.96,
          overallVisualContinuityScore: 0.94,
          passed: true,
          defects: [],
          retakeRecommendations: [],
        },
        usage: { latencyMs: 320 },
      }),
    };

    const evaluator = new VisualSemanticQAEvaluator(mockLlm);
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_test',
      shot: testShot,
      videoPath: validMp4,
      characterProfiles: [testCharacter],
    });

    expect(report.passed).toBe(true);
    expect(report.evaluationMechanism).toBe('MULTIMODAL_GEMINI');
    expect(report.overallVisualContinuityScore).toBe(0.94);
    expect(report.metadata?.modelUsed).toBe('gemini-2.0-flash');
  });

  // 4. Auto-Repair Engine Integration
  it('7. AutoRepairEngine repairs character_identity_drift with cross dissolve', () => {
    const mockReport: ContinuityQAReport = {
      reportId: 'rep_drift',
      projectId: 'proj_test',
      issues: [
        {
          issueId: 'iss_drift_01',
          shotId: 'SHOT_02',
          relatedShotId: 'SHOT_01',
          type: 'character_identity_drift',
          severity: 'warning',
          message: 'Face drift detected',
          suggestedFix: 'Insert cross dissolve',
          autoRepairable: true,
        },
      ],
      repairActions: [],
      overallPassed: false,
      evaluatedAt: new Date().toISOString(),
    };

    const mockSequence: TimelineSequence = {
      sequenceId: 'seq_01',
      projectId: 'proj_test',
      name: 'Test Sequence',
      tracks: [
        {
          trackId: 'v1',
          trackType: 'video',
          name: 'Video',
          order: 0,
          clips: [
            { clipId: 'SHOT_01_clip', name: 'S1', sourceAssetId: 'a1', trackId: 'v1', inPoint: 0, outPoint: 2, duration: 2, startTime: 0, speedMultiplier: 1, volume: 1, opacity: 1 },
            { clipId: 'SHOT_02_clip', name: 'S2', sourceAssetId: 'a2', trackId: 'v1', inPoint: 0, outPoint: 2, duration: 2, startTime: 2, speedMultiplier: 1, volume: 1, opacity: 1 },
          ],
          isMuted: false,
          isLocked: false,
          volume: 1,
          pan: 0,
        },
      ],
      transitions: [
        { transitionId: 't1', fromClipId: 'SHOT_01_clip', toClipId: 'SHOT_02_clip', type: 'hard_cut', duration: 0, easing: 'ease_in_out' },
      ],
      totalDuration: 4,
      fps: 24,
      resolution: { width: 1920, height: 1080 },
      subtitles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = AutoRepairEngine.repair({
      report: mockReport,
      timelineSequence: mockSequence,
      shots: [testShot],
    });

    expect(result.appliedActions.length).toBe(1);
    expect(result.appliedActions[0].strategy).toBe('insert_transition');
    expect(result.repairedSequence.transitions[0].type).toBe('cross_dissolve');
    expect(result.repairedSequence.transitions[0].duration).toBe(0.5);
  });

  // 5. Pipeline Step Integration
  it('8. VisualSemanticQAPipelineStep evaluates shots, persists reports, and registers assets', async () => {
    const assetRegistry = new InMemoryAssetRegistry();
    const step = new VisualSemanticQAPipelineStep(undefined, assetRegistry);

    const context: any = {
      state: {
        projectId: 'proj_pipeline_test',
        seriesId: 'series_test',
        shotContracts: [testShot],
        shotVideoMap: {
          SHOT_VQA_01: validMp4,
        },
        resolvedCharacters: [testCharacter],
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    };

    const result = await step.run(context);

    expect(result.summary).toBeDefined();
    expect((result.summary as any).evaluatedShotsCount).toBe(1);
    expect((result.summary as any).passedShotsCount).toBe(1);
    expect(context.state.visualQAReports.length).toBe(1);

    // Verify asset registered in registry
    const registered = await assetRegistry.query({ seriesId: 'series_test' });
    const qaAsset = registered.find((a) => a.type === 'qa_report' && a.id.includes('ASSET_VIS_QA_'));
    expect(qaAsset).toBeDefined();
    expect(qaAsset?.tags).toContain('visual_semantic');
  });
});
