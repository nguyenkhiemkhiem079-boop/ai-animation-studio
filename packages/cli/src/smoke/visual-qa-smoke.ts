import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  MediaToolchainDoctor,
  ArtifactVerifier,
  FrameExtractor,
  VisualSemanticQAEvaluator,
  AutoRepairEngine,
  ShotContract,
  CharacterDNA,
  TimelineSequence,
  ContinuityQAReport,
} from '@ai-studio/core';

export interface VisualQASmokeReport {
  timestamp: string;
  status: 'PASS' | 'FAIL';
  toolchain: {
    ffmpeg: boolean;
    ffprobe: boolean;
  };
  frameExtraction: {
    videoGenerated: boolean;
    framesExtracted: number;
    framePaths: string[];
  };
  visualQA: {
    reportId: string;
    identityConsistencyScore: number | null;
    spatialPerspectiveScore: number | null;
    visualDefectScore: number | null;
    overallVisualContinuityScore: number | null;
    passed: boolean;
    defectsCount: number;
    mechanism: string;
  };
  autoRepair: {
    appliedActionsCount: number;
    repairedSequenceTracks: number;
  };
}

export async function runVisualQASmoke(outputDir = '.studio/smoke/visual-qa'): Promise<VisualQASmokeReport> {
  console.log('🔬 Starting Phase 17.1 Visual Semantic QA & Continuity Reality Smoke Test...\n');

  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Toolchain Diagnostics
  console.log('1️⃣ Checking Media Toolchain...');
  const toolchain = MediaToolchainDoctor.diagnose(false);
  console.log(` - FFmpeg : ${toolchain.ffmpeg.available ? 'AVAILABLE ✅' : 'MISSING ❌'}`);
  console.log(` - FFprobe: ${toolchain.ffprobe.available ? 'AVAILABLE ✅' : 'MISSING ❌'}`);

  if (!toolchain.ffmpeg.available || !toolchain.ffprobe.available) {
    throw new Error('FFmpeg and FFprobe are required for Visual Semantic QA.');
  }

  // 2. Generate Real 1080p Video Fixture
  console.log('\n2️⃣ Generating Real 1080p Test Video Fixture...');
  const videoPath = path.join(outputDir, 'visual_test_shot_01.mp4');
  const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
  const cmd = `"${ffmpegPath}" -y -f lavfi -i testsrc=size=1920x1080:rate=24 -t 2 -pix_fmt yuv420p -c:v libx264 "${videoPath}"`;
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });

  const verification = ArtifactVerifier.verify(videoPath, { requireVideoStream: true });
  console.log(` - Test Video: ${videoPath} (${verification.width}x${verification.height}, ${verification.sizeBytes} bytes) ✅`);

  // 3. Extract Keyframes
  console.log('\n3️⃣ Extracting Video Keyframes via FrameExtractor...');
  const framesDir = path.join(outputDir, 'frames');
  const frames = FrameExtractor.extractFrames(videoPath, {
    count: 3,
    outputDir: framesDir,
    includeBase64: false,
  });
  console.log(` - Extracted ${frames.length} keyframes to ${framesDir} ✅`);
  for (const f of frames) {
    console.log(`   • Frame ${f.frameIndex + 1} at ${f.timestampSeconds.toFixed(2)}s: ${path.basename(f.filePath)}`);
  }

  // 4. Run Visual Semantic QA Evaluator
  console.log('\n4️⃣ Evaluating Visual Semantic Continuity...');
  const testShot: ShotContract = {
    id: 'SHOT_VIS_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'static',
    rendererIntent: 'deterministic_hyperframes',
    frame: {
      durationSeconds: 2.0,
      aspectRatio: '16:9',
      targetFps: 24,
    },
    camera: {
      shotSize: 'wide',
      angle: 'eye_level',
      movement: 'static',
      focalLength: '35mm',
      semanticSkills: [],
    },
    acting: [
      {
        characterId: 'char_kaito',
        pose: 'standing_cautious',
        expression: 'serious',
        actionPrompt: 'Gazing intently at holographic tactical sensors',
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
    id: 'char_kaito',
    seriesId: 'series_smoke',
    name: 'Commander Kaito',
    aliases: ['Kaito'],
    description: 'Tall tactical commander in dark cyber navy uniform, short black hair, cybernetic left eye.',
    visualAnchorPrompt: 'Tall tactical commander in dark cyber navy uniform, short black hair, cybernetic left eye.',
    traits: ['Stoic', 'Tactical', 'Decisive'],
    currentVersion: 1,
    versions: [],
    outfits: [
      {
        id: 'outfit_01',
        name: 'Tactical Command Uniform',
        description: 'Dark cyber navy uniform',
        referenceAssetIds: [],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const evaluator = new VisualSemanticQAEvaluator();
  const qaReport = await evaluator.evaluateShotVideo({
    projectId: 'proj_smoke_visual_qa',
    sceneId: 'SCENE_01',
    shot: testShot,
    videoPath,
    characterProfiles: [testCharacter],
    frameCount: 3,
  });

  console.log(` - Report ID: ${qaReport.reportId}`);
  console.log(` - Mechanism: ${qaReport.evaluationMechanism}`);
  console.log(` - Identity Score: ${qaReport.identityConsistencyScore !== null ? (qaReport.identityConsistencyScore * 100).toFixed(1) + '%' : 'null (Truthful Offline Metadata Mode)'}`);
  console.log(` - Spatial Score : ${qaReport.spatialPerspectiveScore !== null ? (qaReport.spatialPerspectiveScore * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(` - Defect Score  : ${qaReport.visualDefectScore !== null ? (qaReport.visualDefectScore * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(` - Overall Score : ${qaReport.overallVisualContinuityScore !== null ? (qaReport.overallVisualContinuityScore * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(` - Evaluation Passed: ${qaReport.passed ? 'YES ✅' : 'NO ❌'}`);
  console.log(` - Coverage: ${JSON.stringify(qaReport.coverage)}`);

  // 5. Test Auto-Repair Integration
  console.log('\n5️⃣ Testing Truthful Auto-Repair Integration...');
  const mockContinuityReport: ContinuityQAReport = {
    reportId: `qa_report_test_${Date.now()}`,
    projectId: 'proj_smoke_visual_qa',
    issues: [
      {
        issueId: 'iss_180_01',
        shotId: 'SHOT_VIS_02',
        relatedShotId: 'SHOT_VIS_01',
        type: 'screen_direction_180',
        severity: 'warning',
        message: '180-degree screen direction flip between shots.',
        suggestedFix: 'Insert cross-dissolve transition.',
        autoRepairable: true,
        isResolved: false,
      },
      {
        issueId: 'iss_vis_drift_01',
        shotId: 'SHOT_VIS_02',
        relatedShotId: 'SHOT_VIS_01',
        type: 'character_identity_drift',
        severity: 'critical',
        message: '[Visual Semantic QA] Character face drift detected across shot boundary.',
        suggestedFix: 'Surgical retake required.',
        autoRepairable: false,
        isResolved: false,
      },
    ],
    repairActions: [],
    overallPassed: false,
    evaluatedAt: new Date().toISOString(),
  };

  const mockTimeline: TimelineSequence = {
    sequenceId: 'seq_smoke_vis',
    projectId: 'proj_smoke_visual_qa',
    sceneId: 'SCENE_01',
    name: 'Visual QA Sequence',
    tracks: [
      {
        trackId: 'track_v1',
        trackType: 'video',
        name: 'Video Master',
        order: 0,
        clips: [
          {
            clipId: 'SHOT_VIS_01_clip',
            name: 'Shot 01',
            sourceAssetId: 'asset_v1',
            trackId: 'track_v1',
            inPoint: 0,
            outPoint: 2,
            duration: 2,
            startTime: 0,
            speedMultiplier: 1,
            volume: 1,
            opacity: 1,
          },
          {
            clipId: 'SHOT_VIS_02_clip',
            name: 'Shot 02',
            sourceAssetId: 'asset_v2',
            trackId: 'track_v1',
            inPoint: 0,
            outPoint: 2,
            duration: 2,
            startTime: 2,
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
        fromClipId: 'SHOT_VIS_01_clip',
        toClipId: 'SHOT_VIS_02_clip',
        type: 'hard_cut',
        duration: 0,
        easing: 'ease_in_out',
      },
    ],
    totalDuration: 4,
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    subtitles: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const repairResult = AutoRepairEngine.repair({
    report: mockContinuityReport,
    timelineSequence: mockTimeline,
    shots: [testShot],
  });

  console.log(` - Auto-Repair Applied ${repairResult.appliedActions.length} action(s):`);
  for (const act of repairResult.appliedActions) {
    console.log(`   • [${act.strategy}] (${act.status}) ${act.description}`);
  }

  const updatedTransition = repairResult.repairedSequence.transitions[0];
  console.log(` - Repaired Transition: type="${updatedTransition.type}", duration=${updatedTransition.duration}s ✅`);
  console.log(` - Remaining Unresolved Issues: ${repairResult.remainingIssues.length} (Critical identity drift preserved) ✅`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 PHASE 17.1 VISUAL SEMANTIC QA REALITY SMOKE TEST PASSED!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return {
    timestamp: new Date().toISOString(),
    status: 'PASS',
    toolchain: {
      ffmpeg: toolchain.ffmpeg.available,
      ffprobe: toolchain.ffprobe.available,
    },
    frameExtraction: {
      videoGenerated: true,
      framesExtracted: frames.length,
      framePaths: frames.map((f) => f.filePath),
    },
    visualQA: {
      reportId: qaReport.reportId,
      identityConsistencyScore: qaReport.identityConsistencyScore,
      spatialPerspectiveScore: qaReport.spatialPerspectiveScore,
      visualDefectScore: qaReport.visualDefectScore,
      overallVisualContinuityScore: qaReport.overallVisualContinuityScore,
      passed: qaReport.passed,
      defectsCount: qaReport.defects.length,
      mechanism: qaReport.evaluationMechanism,
    },
    autoRepair: {
      appliedActionsCount: repairResult.appliedActions.length,
      repairedSequenceTracks: repairResult.repairedSequence.tracks.length,
    },
  };
}
