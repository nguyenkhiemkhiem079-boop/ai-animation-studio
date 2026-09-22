import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  FrameExtractor,
  VisualSemanticQAEvaluator,
  AutoRepairEngine,
  VisualSemanticQAPipelineStep,
  ContinuityQAPipelineStep,
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
    expect(report.evaluationMechanism).toBe('LOCAL_MEDIA_METADATA');
    expect(report.overallVisualContinuityScore).toBeGreaterThanOrEqual(0.85);
    // LOCAL_MEDIA_METADATA CANNOT verify pixel-level identity — identityConsistencyScore must be null
    expect(report.identityConsistencyScore).toBeNull();
    expect(report.spatialPerspectiveScore).toBeGreaterThanOrEqual(0.85);
    expect(report.evaluatedFramesCount).toBe(3);
    expect(report.defects.filter((d) => d.severity === 'critical').length).toBe(0);
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
      metadata: { id: 'mock-gemini', name: 'Mock Gemini', supportsImages: true },
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
    // Genuine multimodal: MULTIMODAL_PROVIDER (provider-neutral) — not MULTIMODAL_GEMINI
    expect(report.evaluationMechanism).toBe('MULTIMODAL_PROVIDER');
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

    // Phase 17.1: character_identity_drift CANNOT be resolved by cross dissolve.
    // A retake must be PROPOSED but the issue remains UNRESOLVED.
    expect(result.appliedActions.length).toBe(1);
    expect(result.appliedActions[0].strategy).toBe('trigger_retake');
    expect(result.appliedActions[0].status).toBe('PROPOSED');
    // The issue is still present in remainingIssues — NOT resolved
    expect(result.remainingIssues.length).toBe(1);
    expect(result.remainingIssues[0].type).toBe('character_identity_drift');
    // isResolved is still false
    expect(result.remainingIssues[0].isResolved ?? false).toBe(false);
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
    expect(qaAsset?.status).toBe('approved_canon');
  });

  it('9 & 10 & 11: characterReferencePackets resolve canonical identity and outfit references into evaluator', async () => {
    let capturedOptions: any;
    const mockEvaluator = {
      evaluateShotVideo: async (opts: any) => {
        capturedOptions = opts;
        return {
          reportId: 'vis_qa_test',
          projectId: opts.projectId,
          shotId: opts.shot.id,
          videoUri: opts.videoPath,
          passed: true,
          status: 'PASS',
          overallVisualContinuityScore: 0.95,
          defects: [],
          retakeRecommendations: [],
          evaluatedFramesCount: 3,
          evaluatedAt: new Date().toISOString(),
          evaluationMechanism: 'MULTIMODAL_PROVIDER',
          coverage: {
            artifactIntegrity: 'VERIFIED',
            spatialFormat: 'VERIFIED',
            identityVisual: 'VERIFIED',
            temporalArtifactVisual: 'VERIFIED',
            semanticAction: 'VERIFIED',
          },
        };
      },
    };

    const step = new VisualSemanticQAPipelineStep();
    (step as any).evaluator = mockEvaluator;

    const shotWithActor: ShotContract = {
      ...testShot,
      id: 'SHOT_CHAR_PACKET_01',
      acting: [{ characterId: 'char_elena', outfitId: 'outfit_01' }],
    };

    const context: any = {
      state: {
        projectId: 'proj_char_packet_test',
        seriesId: 'series_test',
        executionMode: 'PRODUCTION',
        shotContracts: [shotWithActor],
        shotVideoMap: {
          SHOT_CHAR_PACKET_01: validMp4,
        },
        resolvedCharacters: [testCharacter],
        characterReferencePackets: {
          SHOT_CHAR_PACKET_01: {
            shotId: 'SHOT_CHAR_PACKET_01',
            bindings: [
              {
                characterId: 'char_elena',
                characterName: 'Elena',
                roles: {
                  CHARACTER_IDENTITY: {
                    id: 'asset_elena_front',
                    seriesId: 'series_test',
                    type: 'character_turnaround',
                    status: 'approved_canon',
                    storageUri: validMp4,
                    metadata: { base64: 'fakeBase64ElenaIdentity' },
                  },
                  OUTFIT: {
                    id: 'asset_elena_outfit',
                    seriesId: 'series_test',
                    type: 'character_outfit',
                    status: 'approved_canon',
                    storageUri: validMp4,
                    metadata: { base64: 'fakeBase64ElenaOutfit' },
                  },
                },
              },
            ],
          },
        },
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    await step.run(context);

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.referenceImages).toBeDefined();
    expect(capturedOptions.referenceImages.length).toBeGreaterThan(0);

    const idRef = capturedOptions.referenceImages.find((r: any) => r.entityId === 'char_elena' && (r.role === 'turnaround_front' || r.role === 'CHARACTER_IDENTITY'));
    expect(idRef).toBeDefined();
    expect(idRef.base64Data).toBe('fakeBase64ElenaIdentity');
    expect(idRef.status).toBe('approved_canon');

    const outfitRef = capturedOptions.referenceImages.find((r: any) => r.entityId === 'char_elena' && r.role.includes('outfit'));
    expect(outfitRef).toBeDefined();
    expect(outfitRef.base64Data).toBe('fakeBase64ElenaOutfit');
  });

  it('14 & 15: environment reference is resolved correctly per shot and multi-scene shots do not all use Scene 1', async () => {
    let capturedOptions: any[] = [];
    const mockEvaluator = {
      evaluateShotVideo: async (opts: any) => {
        capturedOptions.push(opts);
        return {
          reportId: `vis_qa_${opts.shot.id}`,
          projectId: opts.projectId,
          shotId: opts.shot.id,
          videoUri: opts.videoPath,
          passed: true,
          status: 'PASS',
          overallVisualContinuityScore: 0.95,
          defects: [],
          retakeRecommendations: [],
          evaluatedFramesCount: 3,
          evaluatedAt: new Date().toISOString(),
          evaluationMechanism: 'LOCAL_MEDIA_METADATA',
          coverage: {
            artifactIntegrity: 'VERIFIED',
            spatialFormat: 'VERIFIED',
            identityVisual: 'NOT_EVALUATED',
            temporalArtifactVisual: 'NOT_EVALUATED',
            semanticAction: 'NOT_EVALUATED',
          },
        };
      },
    };

    const step = new VisualSemanticQAPipelineStep();
    (step as any).evaluator = mockEvaluator;

    const shotScene1: ShotContract = { ...testShot, id: 'SHOT_SC1_01', sceneId: 'SCENE_01', environmentLocationId: 'loc_bar' };
    const shotScene2: ShotContract = { ...testShot, id: 'SHOT_SC2_01', sceneId: 'SCENE_02', environmentLocationId: 'loc_rooftop' };

    const context: any = {
      state: {
        projectId: 'proj_scenes_test',
        seriesId: 'series_test',
        productionScenes: [
          { id: 'SCENE_01', locationId: 'loc_bar', shots: [shotScene1] },
          { id: 'SCENE_02', locationId: 'loc_rooftop', shots: [shotScene2] },
        ],
        resolvedLocations: {
          loc_bar: { id: 'loc_bar', name: 'Cyberpunk Bar', atmospherePrompt: 'Moody neon' },
          loc_rooftop: { id: 'loc_rooftop', name: 'Rainy Rooftop', atmospherePrompt: 'Wet pavement and lightning' },
        },
        shotVideoMap: {
          SHOT_SC1_01: validMp4,
          SHOT_SC2_01: validMp4,
        },
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    await step.run(context);

    expect(capturedOptions.length).toBe(2);
    expect(capturedOptions[0].sceneId).toBe('SCENE_01');
    expect(capturedOptions[0].locationProfile?.name).toBe('Cyberpunk Bar');

    expect(capturedOptions[1].sceneId).toBe('SCENE_02');
    expect(capturedOptions[1].locationProfile?.name).toBe('Rainy Rooftop');
    // Verify Scene 2 did NOT fall back to Scene 1
    expect(capturedOptions[1].locationProfile?.name).not.toBe('Cyberpunk Bar');
  });

  it('16 & 17 & 18: PRODUCTION ignores .studio/smoke/media and .studio/smoke/golden, strictly using authoritative shotVideoMap', async () => {
    const step = new VisualSemanticQAPipelineStep();

    const shot: ShotContract = { ...testShot, id: 'SHOT_PROD_NO_SMOKE' };

    const context: any = {
      state: {
        projectId: 'proj_smoke_test',
        executionMode: 'PRODUCTION',
        shotContracts: [shot],
        shotVideoMap: {
          // Empty or non-existent in authoritative map
          SHOT_PROD_NO_SMOKE: '.studio/smoke/media/SHOT_PROD_NO_SMOKE.mp4',
        },
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    const result = await step.run(context);
    const summary = result.summary as any;

    // Must be flagged as missing artifact in PRODUCTION
    expect(summary.missingArtifacts).toBe(1);
    expect(summary.overallStatus).toBe('FAILED');
    expect(result.reports[0].status).toBe('MISSING_ARTIFACT');
  });

  it('29 & 30: color_palette_drift remains PROPOSED and unresolved in AutoRepairEngine', () => {
    const mockReport: ContinuityQAReport = {
      reportId: 'rep_color_drift',
      projectId: 'proj_test',
      timestamp: new Date().toISOString(),
      issues: [
        {
          issueId: 'iss_color_01',
          shotId: 'SHOT_01',
          type: 'color_palette_drift',
          severity: 'warning',
          message: 'Color temperature shifted from 5500K to 3200K.',
          suggestedFix: 'Re-balance color curves.',
          autoRepairable: true,
        },
      ],
      repairActions: [],
      overallPassed: false,
    };

    const mockSequence: TimelineSequence = {
      sequenceId: 'seq_color',
      projectId: 'proj_test',
      name: 'Seq',
      tracks: [
        {
          trackId: 'v1',
          trackType: 'video',
          name: 'Video',
          order: 0,
          clips: [
            { clipId: 'SHOT_01', name: 'S1', sourceAssetId: 'a1', trackId: 'v1', inPoint: 0, outPoint: 2, duration: 2, startTime: 0, speedMultiplier: 1, volume: 1, opacity: 1 },
          ],
          isMuted: false,
          isLocked: false,
          volume: 1,
          pan: 0,
        },
      ],
      transitions: [],
      totalDuration: 2,
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
    expect(result.appliedActions[0].strategy).toBe('color_grade_compensation');
    expect(result.appliedActions[0].status).toBe('PROPOSED');
    expect(result.appliedActions[0].applied).toBe(false);
    expect(result.remainingIssues.length).toBe(1);
    expect(result.remainingIssues[0].type).toBe('color_palette_drift');
  });

  it('33: spatial cross-dissolve mitigation does not resolve underlying spatial perspective mismatch', () => {
    const mockReport: ContinuityQAReport = {
      reportId: 'rep_spatial_mismatch',
      projectId: 'proj_test',
      timestamp: new Date().toISOString(),
      issues: [
        {
          issueId: 'iss_spatial_01',
          shotId: 'SHOT_02',
          relatedShotId: 'SHOT_01',
          type: 'spatial_perspective_mismatch',
          severity: 'warning',
          message: 'Camera angle flipped from eye_level to extreme low angle.',
          suggestedFix: 'Insert transition mitigation or re-render.',
          autoRepairable: true,
        },
      ],
      repairActions: [],
      overallPassed: false,
    };

    const mockSequence: TimelineSequence = {
      sequenceId: 'seq_spatial',
      projectId: 'proj_test',
      name: 'Seq',
      tracks: [
        {
          trackId: 'v1',
          trackType: 'video',
          name: 'Video',
          order: 0,
          clips: [
            { clipId: 'SHOT_01', name: 'S1', sourceAssetId: 'a1', trackId: 'v1', inPoint: 0, outPoint: 2, duration: 2, startTime: 0, speedMultiplier: 1, volume: 1, opacity: 1 },
            { clipId: 'SHOT_02', name: 'S2', sourceAssetId: 'a2', trackId: 'v1', inPoint: 0, outPoint: 2, duration: 2, startTime: 2, speedMultiplier: 1, volume: 1, opacity: 1 },
          ],
          isMuted: false,
          isLocked: false,
          volume: 1,
          pan: 0,
        },
      ],
      transitions: [
        { transitionId: 'trans_01', fromClipId: 'SHOT_01', toClipId: 'SHOT_02', type: 'hard_cut', duration: 0, easing: 'linear' },
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

    // Cross dissolve transition is inserted as editorial mitigation,
    // BUT underlying spatial defect is NOT resolved
    expect(result.appliedActions.length).toBe(1);
    expect(result.remainingIssues.length).toBe(1);
    expect(result.remainingIssues[0].type).toBe('spatial_perspective_mismatch');
  });

  it('34 & 35: temporal flicker and visual defect retakes remain PROPOSED and unresolved', () => {
    const mockReport: ContinuityQAReport = {
      reportId: 'rep_defects',
      projectId: 'proj_test',
      timestamp: new Date().toISOString(),
      issues: [
        {
          issueId: 'iss_flicker_01',
          shotId: 'SHOT_01',
          type: 'temporal_visual_flicker',
          severity: 'warning',
          message: 'Temporal frame flicker detected.',
          autoRepairable: true,
        },
        {
          issueId: 'iss_artifact_01',
          shotId: 'SHOT_01',
          type: 'visual_artifact_defect',
          severity: 'critical',
          message: 'Severe visual defect in background.',
          autoRepairable: true,
        },
      ],
      repairActions: [],
      overallPassed: false,
    };

    const mockSequence: TimelineSequence = {
      sequenceId: 'seq_defects',
      projectId: 'proj_test',
      name: 'Seq',
      tracks: [{ trackId: 'v1', trackType: 'video', name: 'V', order: 0, clips: [], isMuted: false, isLocked: false, volume: 1, pan: 0 }],
      transitions: [],
      totalDuration: 2,
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

    expect(result.appliedActions.length).toBe(2);
    expect(result.appliedActions[0].status).toBe('PROPOSED');
    expect(result.appliedActions[0].applied).toBe(false);
    expect(result.appliedActions[1].status).toBe('PROPOSED');
    expect(result.appliedActions[1].applied).toBe(false);
    expect(result.remainingIssues.length).toBe(2);
  });

  it('36 & 37: critical visual issue survives continuity merge and blocks overallPassed', async () => {
    const registry = new InMemoryAssetRegistry();
    const step = new ContinuityQAPipelineStep(true, registry);

    const context: any = {
      state: {
        projectId: 'proj_merge_test',
        seriesId: 'series_merge_test',
        shotContracts: [testShot],
        timelineSequence: {
          sequenceId: 'seq_m',
          tracks: [{ trackId: 'v1', trackType: 'video', clips: [{ clipId: 'SHOT_VQA_01' }] }],
          transitions: [],
          totalDuration: 2,
          fps: 24,
          resolution: { width: 1920, height: 1080 },
        },
        visualQAReports: [
          {
            shotId: 'SHOT_VQA_01',
            defects: [
              {
                defectId: 'def_crit_01',
                severity: 'critical',
                issueType: 'character_identity_drift',
                description: 'Critical facial identity divergence.',
                suggestedFix: 'Regenerate face turnaround.',
              },
            ],
          },
        ],
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    const result = await step.run(context);
    const summary = result.summary as any;

    expect(summary.overallPassed).toBe(false);
    expect(summary.criticalIssues).toBeGreaterThanOrEqual(1);

    // 39: Failed continuity report registered as candidate in AssetRegistry, NOT approved_canon
    const registered = await registry.query({ seriesId: 'series_merge_test' });
    const qaAsset = registered.find((a) => a.type === 'qa_report');
    expect(qaAsset).toBeDefined();
    expect(qaAsset?.status).toBe('candidate');
  });
});
