import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  ProductionRun,
  ProductionMasterVerifier,
  MediaToolchainDoctor,
  ArtifactVerifier,
  DeterministicOfflineLLMDouble,
  MockLLMProvider,
  VisualSemanticQAEvaluator,
  ShotContract,
} from '../src/index.js';

describe('Phase 18.1 — Production Truth Hardening Adversarial Test Suite', () => {
  let testDir: string;
  let realShotVideo: string;
  let realMasterVideo: string;
  let realSha256: string;
  let masterSha256: string;

  beforeEach(() => {
    testDir = path.resolve('.studio', 'temp_p18_adversarial', `t_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(testDir, { recursive: true });

    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    realShotVideo = path.join(testDir, 'shot_canon.mp4');
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=blue:s=640x360:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo}"`,
      { stdio: 'ignore' }
    );
    realSha256 = ArtifactVerifier.verify(realShotVideo, { requireVideoStream: true }).checksumSha256!;

    realMasterVideo = path.join(testDir, 'master.mp4');
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=blue:s=1280x720:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realMasterVideo}"`,
      { stdio: 'ignore' }
    );
    masterSha256 = ArtifactVerifier.verify(realMasterVideo, { requireVideoStream: true }).checksumSha256!;
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  function createValidBaseRun(): ProductionRun {
    return {
      runId: 'run_truth_base',
      projectId: 'proj_truth',
      seriesId: 'series_truth',
      status: 'MASTER_QA',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'master_qa',
      completedShotIds: ['SHOT_01'],
      pendingShotIds: [],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          assetId: 'ASSET_01',
          physicalPath: realShotVideo,
          sha256: realSha256,
          sizeBytes: fs.statSync(realShotVideo).size,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 640,
          height: 360,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'HyperFrames',
          generationSource: 'HYPERFRAMES',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          coverage: {
            artifactIntegrity: 'VERIFIED',
            spatialFormat: 'VERIFIED',
            identityVisual: 'VERIFIED',
            temporalArtifactVisual: 'VERIFIED',
            semanticAction: 'VERIFIED',
          },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          canonicalAssetId: 'CANON_SHOT_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          decidedBy: 'Lead Director',
          decidedAt: new Date().toISOString(),
        },
      },
      resumeMetadata: { canResume: true },
    };
  }

  const baseShotContract: ShotContract = {
    id: 'SHOT_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'action',
    complexity: 'simple_layer_transform',
    rendererIntent: 'deterministic_hyperframes',
    frame: { durationSeconds: 1.0, aspectRatio: '16:9', targetFps: 24 },
    camera: { focalLength: '35mm', shotSize: 'medium', angle: 'eye_level', movement: 'static', semanticSkills: [] },
    lighting: { keyLightDirection: 'front', mood: 'natural', colorTemperature: 'neutral', fogAtmosphere: false },
    composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
    acting: [{ characterId: 'char_minh', actionDescription: 'Minh enters dark room' }],
    transition: { type: 'cut', durationSeconds: 0 },
    audioCue: { sfx: [] },
    requiredAssetIds: [],
    dependsOnShotIds: [],
    directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
    provenance: { decidedAt: new Date().toISOString() },
  };

  // 1. OfflineLLMDouble cannot satisfy PRODUCTION semantic truth
  it('1. proves OfflineLLMDouble cannot satisfy PRODUCTION semantic truth and marks coverage NOT_EVALUATED', async () => {
    const double = new DeterministicOfflineLLMDouble();
    const evaluator = new VisualSemanticQAEvaluator(double);
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_test',
      shot: baseShotContract,
      videoPath: realShotVideo,
      executionMode: 'PRODUCTION',
    });

    expect(report.evaluationMechanism).toBe('OFFLINE_TEST_DOUBLE');
    expect(report.coverage?.identityVisual).toBe('NOT_EVALUATED');
    expect(report.coverage?.temporalArtifactVisual).toBe('NOT_EVALUATED');
    expect(report.coverage?.semanticAction).toBe('NOT_EVALUATED');

    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].mechanism = report.evaluationMechanism;
    run.qaEvidence['SHOT_01'].providerTrust = 'OFFLINE_TEST_DOUBLE';
    run.qaEvidence['SHOT_01'].isSynthetic = true;
    run.qaEvidence['SHOT_01'].coverage = report.coverage as any;

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.checksSummary.visualSemanticCoverageEvaluated).toBe(false);
  });

  // 2. Mock provider cannot satisfy production semantic truth
  it('2. proves mock provider cannot satisfy production semantic truth and fails closed in PRODUCTION', async () => {
    const mockLlm = new MockLLMProvider();
    const evaluator = new VisualSemanticQAEvaluator(mockLlm);
    const report = await evaluator.evaluateShotVideo({
      projectId: 'proj_test',
      shot: baseShotContract,
      videoPath: realShotVideo,
      executionMode: 'PRODUCTION',
    });

    expect(report.passed).toBe(false);
    expect(report.status).toBe('FAIL');
    expect(report.evaluationMechanism).toBe('MOCK');

    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].mechanism = 'MOCK';
    run.qaEvidence['SHOT_01'].providerTrust = 'MOCK';
    run.qaEvidence['SHOT_01'].isSynthetic = true;

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.visualSemanticCoverageEvaluated).toBe(false);
  });

  // 3. LOCAL_MEDIA_METADATA cannot satisfy production master gate
  it('3. proves LOCAL_MEDIA_METADATA cannot satisfy production master gate', () => {
    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].mechanism = 'LOCAL_MEDIA_METADATA';
    run.qaEvidence['SHOT_01'].isSynthetic = true;

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.checksSummary.visualSemanticCoverageEvaluated).toBe(false);
  });

  // 4. qa.passed=false blocks master even with zero critical defects
  it('4. proves qa.passed=false blocks master even with zero critical defects', () => {
    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].passed = false;
    run.qaEvidence['SHOT_01'].overallStatus = 'FAIL';
    run.qaEvidence['SHOT_01'].criticalDefects = 0;
    run.qaEvidence['SHOT_01'].retakesRecommended = 0;

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.qaPassedAndDefectFree).toBe(false);
  });

  // 5. NOT_EVALUATED identity coverage blocks character shot
  it('5. proves NOT_EVALUATED identity coverage blocks character shot', () => {
    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].coverage!['identityVisual'] = 'NOT_EVALUATED';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.visualSemanticCoverageEvaluated).toBe(false);
  });

  // 6. NOT_EVALUATED temporal coverage blocks motion shot
  it('6. proves NOT_EVALUATED temporal coverage blocks motion shot', () => {
    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].coverage!['temporalArtifactVisual'] = 'NOT_EVALUATED';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.visualSemanticCoverageEvaluated).toBe(false);
  });

  // 7. NOT_EVALUATED semanticAction blocks acting shot
  it('7. proves NOT_EVALUATED semanticAction blocks acting shot', () => {
    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].coverage!['semanticAction'] = 'NOT_EVALUATED';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.visualSemanticCoverageEvaluated).toBe(false);
  });

  // 8. automated approval cannot satisfy human production gate
  it('8. proves automated approval cannot satisfy human production gate', () => {
    const run = createValidBaseRun();
    run.approvalEvidence['SHOT_01'].approvalType = 'AUTOMATED_TEST';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.humanApprovalVerified).toBe(false);
  });

  // 9. simulated Flow media cannot satisfy real Flow provenance
  it('9. proves simulated Flow media cannot satisfy real Flow provenance', () => {
    const run = createValidBaseRun();
    run.mediaEvidence['SHOT_01'].generationSource = 'SIMULATED_FLOW';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.noSimulatedMediaInProduction).toBe(false);
  });

  // 10. missing continuity report blocks production
  it('10. proves missing continuity report fails closed and blocks production', () => {
    const run = createValidBaseRun();

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: undefined,
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.continuityQAMeetsProductionCriteria).toBe(false);
  });

  // 11. timeline media mismatch blocks production
  it('11. proves timeline media mismatch blocks production', () => {
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    const wrongVideo = path.join(testDir, 'wrong_timeline_media.mp4');
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=red:s=640x360:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${wrongVideo}"`,
      { stdio: 'ignore' }
    );

    const run = createValidBaseRun();

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: wrongVideo },
      continuityReport: { overallPassed: true, issues: [] },
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.timelineUsesApprovedCanonMedia).toBe(false);
  });

  // 12. checksum mismatch blocks production
  it('12. proves checksum mismatch blocks production', () => {
    const run = createValidBaseRun();
    run.mediaEvidence['SHOT_01'].sha256 = '0000000000000000000000000000000000000000000000000000000000000000';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.mediaCryptographicChecksumValid).toBe(false);
  });

  // 13. approved canonical media passes timeline binding only when exact authoritative artifact matches
  it('13. proves approved canonical media passes timeline binding only when exact authoritative artifact matches', () => {
    const run = createValidBaseRun();

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(true);
    expect(result.status).toBe('MASTER_PRODUCTION_VERIFIED');
    expect(result.checksSummary.timelineUsesApprovedCanonMedia).toBe(true);
    expect(result.checksSummary.humanApprovalVerified).toBe(true);
    expect(result.checksSummary.noSimulatedMediaInProduction).toBe(true);
    expect(result.checksSummary.visualSemanticCoverageEvaluated).toBe(true);
    expect(result.checksSummary.continuityQAMeetsProductionCriteria).toBe(true);
  });
});
