import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  EvidenceStore,
  MediaToolchainDoctor,
  ProductionAcceptanceBundle,
  ProductionMasterVerifier,
  ProductionSafetyError,
  ProductionRun,
  ShotContract,
  ArtifactVerifier,
  createTrustedHumanConfirmation,
} from '../src/index.js';

describe('Phase 18.2.2 — Final Human & Artifact Binding Lock Test Suite', () => {
  const testDir = path.resolve('.studio', 'tests', 'phase18-binding-lock');
  let storage: FileSystemStorage;
  let realShotVideo: string;
  let realMasterVideo: string;
  let realSha256: string;
  let masterSha256: string;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);

    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    realShotVideo = path.join(testDir, 'shot_01.mp4');
    realMasterVideo = path.join(testDir, 'master.mp4');

    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=blue:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo}"`,
      { stdio: 'ignore' }
    );
    realSha256 = ArtifactVerifier.verify(realShotVideo, { requireVideoStream: true }).checksumSha256!;

    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=green:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realMasterVideo}"`,
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

  function createValidRun(): ProductionRun {
    return {
      runId: 'run_lock_test',
      projectId: 'proj_lock',
      seriesId: 'series_lock',
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
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Google Flow Direct Import',
          generationSource: 'GOOGLE_FLOW_REAL',
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
    rendererIntent: 'generative',
    recommendedRoute: 'generative_video',
    frame: { durationSeconds: 1.0, fps: 24 },
  };

  const validContinuityReport = {
    overallPassed: true,
    issues: [],
    repairedActions: [],
  };

  // 1. missing qa.mediaSha256 blocks production
  it('1. proves missing qa.mediaSha256 blocks production (QA_MEDIA_SHA_MISSING)', () => {
    const run = createValidRun();
    delete (run.qaEvidence['SHOT_01'] as any).mediaSha256;

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: validContinuityReport,
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.reasons.some((r) => r.includes('QA_MEDIA_SHA_MISSING'))).toBe(true);
  });

  // 2. missing qa.candidateAssetId blocks production
  it('2. proves missing qa.candidateAssetId blocks production (QA_ASSET_BINDING_MISSING)', () => {
    const run = createValidRun();
    delete (run.qaEvidence['SHOT_01'] as any).candidateAssetId;

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: validContinuityReport,
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.reasons.some((r) => r.includes('QA_ASSET_BINDING_MISSING'))).toBe(true);
  });

  // 3. wrong qa.mediaSha256 blocks production
  it('3. proves wrong qa.mediaSha256 blocks production (QA_MEDIA_SHA_MISMATCH)', () => {
    const run = createValidRun();
    run.qaEvidence['SHOT_01'].mediaSha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: validContinuityReport,
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.reasons.some((r) => r.includes('QA_MEDIA_SHA_MISMATCH'))).toBe(true);
  });

  // 4. wrong qa.candidateAssetId blocks production
  it('4. proves wrong qa.candidateAssetId blocks production (QA_ASSET_BINDING_MISMATCH)', () => {
    const run = createValidRun();
    run.qaEvidence['SHOT_01'].candidateAssetId = 'WRONG_ASSET_ID';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: validContinuityReport,
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.reasons.some((r) => r.includes('QA_ASSET_BINDING_MISMATCH'))).toBe(true);
  });

  // 5. QA SHA vs disk SHA mismatch blocks production
  it('5. proves QA SHA vs disk SHA mismatch blocks production', () => {
    const run = createValidRun();
    // Tamper the file on disk so disk SHA doesn't match QA SHA
    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=red:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo}"`,
      { stdio: 'ignore' }
    );

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: validContinuityReport,
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.reasons.some((r) => r.includes('QA_MEDIA_SHA_MISMATCH'))).toBe(true);
  });

  // 6. QA SHA vs approval SHA mismatch blocks production
  it('6. proves QA SHA vs approval SHA mismatch blocks production', () => {
    const run = createValidRun();
    run.approvalEvidence['SHOT_01'].mediaSha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: validContinuityReport,
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.reasons.some((r) => r.includes('QA_MEDIA_SHA_MISMATCH'))).toBe(true);
  });

  // 11. automated caller cannot spoof HUMAN with boolean
  it('11. proves automated caller cannot spoof HUMAN with boolean alone', async () => {
    const assetRegistry = new FileSystemAssetRegistry(storage);
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = createValidRun();
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/production-run.json`, run);

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Test Director', undefined, {
        approvalType: 'HUMAN',
        confirmedByOperator: true,
        interactive: false,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 12. rejection cannot falsely claim HUMAN
  it('12. proves rejection cannot falsely claim HUMAN without interactive confirmation', async () => {
    const assetRegistry = new FileSystemAssetRegistry(storage);
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = createValidRun();
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/production-run.json`, run);

    // Calling rejectShot without options records SYSTEM, not HUMAN
    const updated = await orchestrator.rejectShot(
      run.projectId,
      run.runId,
      'SHOT_01',
      'Defects detected'
    );
    expect(updated.approvalEvidence['SHOT_01'].approvalType).toBe('SYSTEM');
    expect(updated.approvalEvidence['SHOT_01'].interactive).toBe(false);

    // Calling rejectShot with approvalType="HUMAN" but interactive=false throws ProductionSafetyError
    await expect(
      orchestrator.rejectShot(run.projectId, run.runId, 'SHOT_01', 'Reason', undefined, {
        approvalType: 'HUMAN',
        interactive: false,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 13. finalMasterChecksum mismatch invalidates bundle
  it('13. proves finalMasterChecksum mismatch invalidates bundle', async () => {
    const run = createValidRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 320,
      height: 180,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage, {
      expectedMasterChecksum: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('finalMasterChecksum'))).toBe(true);
  });

  // 14. verificationStatus mismatch invalidates bundle
  it('14. proves verificationStatus mismatch invalidates bundle', async () => {
    const run = createValidRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 320,
      height: 180,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage, {
      expectedVerificationStatus: 'FAILED_VERIFICATION',
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('verificationStatus'))).toBe(true);
  });

  // 15. requiredShotIds missing shot invalidates bundle
  it('15. proves requiredShotIds missing shot invalidates bundle', async () => {
    const run = createValidRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 320,
      height: 180,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage, {
      expectedRequiredShotIds: ['SHOT_01', 'SHOT_02'],
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('missing expected shot(s)'))).toBe(true);
  });

  // 16. requiredShotIds extra shot invalidates bundle
  it('16. proves requiredShotIds extra shot invalidates bundle', async () => {
    const run = createValidRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 320,
      height: 180,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01', 'SHOT_EXTRA'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage, {
      expectedRequiredShotIds: ['SHOT_01'],
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('unexpected extra shot(s)'))).toBe(true);
  });

  // 17. duplicate required shot invalidates bundle
  it('17. proves duplicate required shot invalidates bundle', async () => {
    const run = createValidRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 320,
      height: 180,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01', 'SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('duplicate shot ID'))).toBe(true);
  });

  // 18. fully consistent acceptance bundle passes
  it('18. proves fully consistent acceptance bundle passes', async () => {
    const run = createValidRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 320,
      height: 180,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage, {
      expectedRequiredShotIds: ['SHOT_01'],
      expectedMasterChecksum: masterSha256,
      expectedVerificationStatus: 'MASTER_PRODUCTION_VERIFIED',
      finalMasterVideoPath: realMasterVideo,
    });

    expect(validation.valid).toBe(true);
    expect(validation.reasons).toEqual([]);
    expect(validation.metadata).toBeDefined();
    expect(validation.manifest).toBeDefined();
  });
});
