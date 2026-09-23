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
} from '../src/index.js';

describe('Phase 18.3 — Production Truth Closure Test Suite', () => {
  const testDir = path.resolve('.studio', 'content', 'phase18-truth-closure');
  let storage: FileSystemStorage;
  let assetRegistry: FileSystemAssetRegistry;
  let evidenceStore: EvidenceStore;
  let realShotVideo: string;
  let realShotVideo2: string;
  let realMasterVideo: string;
  let realSha256: string;
  let realSha256_2: string;
  let masterSha256: string;

  const baseShotContract: ShotContract = {
    shotId: 'SHOT_01',
    sceneId: 'SCENE_01',
    sequenceNumber: 1,
    durationSeconds: 1.0,
    shotType: 'MEDIUM_CLOSE_UP',
    cameraMovement: 'STATIC',
    lens: 'STANDARD_50MM',
    lighting: 'NATURAL_OVERCAST',
    motionIntensity: 'MODERATE',
    complexity: 'MEDIUM',
    focalPoint: 'Minh',
    characterPresence: ['CHAR_MINH'],
    locationSetting: 'LOC_ROOM',
    actionDescription: 'Minh enters dark room',
    dialogueLine: null,
    audioAtmosphere: 'Eerie silence',
    musicMood: 'Tense anticipation',
    soundEffects: ['Door creak'],
    renderingStrategy: 'GENERATIVE_VIDEO',
    generationPrompt: 'Minh enters dark room cinematic 4k',
    compositionLayers: [],
    cinematicSkills: [],
    directorNotes: 'Maintain focus on candle',
    estimatedCostUsd: 0.1,
  };

  const shotContract2: ShotContract = {
    ...baseShotContract,
    shotId: 'SHOT_02',
    sequenceNumber: 2,
    actionDescription: 'Minh sees white butterfly',
  };

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    assetRegistry = new FileSystemAssetRegistry(storage);
    evidenceStore = new EvidenceStore(storage);

    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    realShotVideo = path.join(testDir, 'shot_01.mp4');
    realShotVideo2 = path.join(testDir, 'shot_02.mp4');
    realMasterVideo = path.join(testDir, 'master.mp4');

    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=blue:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo}"`,
      { stdio: 'ignore' }
    );
    realSha256 = ArtifactVerifier.verify(realShotVideo, { requireVideoStream: true }).checksumSha256!;

    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=yellow:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo2}"`,
      { stdio: 'ignore' }
    );
    realSha256_2 = ArtifactVerifier.verify(realShotVideo2, { requireVideoStream: true }).checksumSha256!;

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

  async function setupRun(projectId = 'proj_closure', runId = 'run_closure'): Promise<{
    orchestrator: ProductionOrchestrator;
    run: ProductionRun;
  }> {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_closure',
      rawScript: 'Minh enters dark room. He sees a white butterfly.',
      mode: 'PRODUCTION',
    });

    // Populate planned shots
    await storage.writeJson(`.studio/production/${projectId}/${run.runId}/planned_shots.json`, [
      baseShotContract,
      shotContract2,
    ]);

    // Populate media evidence for SHOT_01
    run.mediaEvidence['SHOT_01'] = {
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
      approvalStatus: 'PENDING',
    };

    // Populate QA evidence for SHOT_01
    run.qaEvidence['SHOT_01'] = {
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
    };    run.status = 'APPROVAL_REQUIRED';
    await orchestrator['repository'].save(run);
    return { orchestrator, run };
  }

  // 1. Programmatic boolean interactive=true cannot create HUMAN approval
  it('1. proves programmatic boolean interactive=true cannot create HUMAN approval without challenge', async () => {
    const { orchestrator, run } = await setupRun();

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Attacker', 'Spoof attempt', {
        approvalType: 'HUMAN',
        interactive: true,
      })
    ).rejects.toThrow(/Cannot record approvalType="HUMAN" without an explicit approval challenge/);
  });

  // 2. Fake confirmation object cannot create HUMAN approval
  it('2. proves fake confirmation object with nonexistent challenge cannot create HUMAN approval', async () => {
    const { orchestrator, run } = await setupRun();

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Attacker', 'Spoof attempt', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: 'fake-challenge-id-999',
        challengeNonce: 'AABBCCDDEEFF',
      })
    ).rejects.toThrow(/Approval challenge.*not found/);
  });

  // 3. Wrong challenge nonce fails
  it('3. proves wrong challenge nonce fails', async () => {
    const { orchestrator, run } = await setupRun();

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Operator', 'Approval', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: '000000000000', // incorrect nonce
      })
    ).rejects.toThrow(/Approval challenge nonce mismatch/);
  });

  // 4. Expired challenge fails
  it('4. proves expired challenge fails', async () => {
    const { orchestrator, run } = await setupRun();

    const challenge = await orchestrator.issueApprovalChallenge(
      run.projectId,
      run.runId,
      'SHOT_01',
      'APPROVE',
      1 // 1 second TTL
    );

    // Manually backdate the challenge in the repository to simulate expiration
    const currentRun = await orchestrator['repository'].findById(run.projectId, run.runId);
    expect(currentRun).toBeDefined();
    currentRun!.approvalChallenges![challenge.challengeId].expiresAt = new Date(Date.now() - 5000).toISOString();
    await orchestrator['evidenceStore'].saveApprovalChallenges(run.projectId, run.runId, currentRun!.approvalChallenges!);
    await orchestrator['repository'].save(currentRun!);

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Operator', 'Approval', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(/expired/);
  });

  // 5. Reused challenge fails (single-use enforcement)
  it('5. proves reused challenge fails', async () => {
    const { orchestrator, run } = await setupRun();

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // First use succeeds
    const approvedRun = await orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Operator', 'First approval', {
      approvalType: 'HUMAN',
      interactive: true,
      challengeId: challenge.challengeId,
      challengeNonce: challenge.nonce,
    });
    expect(approvedRun.approvalEvidence['SHOT_01'].approvalType).toBe('HUMAN');

    // Second use of same challenge fails
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Operator', 'Replay approval', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(/has already been consumed/);
  });

  // 6. Challenge for another shot fails
  it('6. proves challenge issued for another shot fails', async () => {
    const { orchestrator, run } = await setupRun();

    // Populate media and QA for SHOT_02 as well
    run.mediaEvidence['SHOT_02'] = {
      shotId: 'SHOT_02',
      assetId: 'ASSET_02',
      physicalPath: realShotVideo2,
      sha256: realSha256_2,
      sizeBytes: fs.statSync(realShotVideo2).size,
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
      approvalStatus: 'PENDING',
    };
    run.qaEvidence['SHOT_02'] = {
      ...run.qaEvidence['SHOT_01'],
      shotId: 'SHOT_02',
      reportId: 'rep_02',
      mediaSha256: realSha256_2,
      candidateAssetId: 'ASSET_02',
    };
    await orchestrator['repository'].save(run);

    // Issue challenge for SHOT_01
    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Attempt to use SHOT_01 challenge to approve SHOT_02
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_02', 'Operator', 'Cross-shot approval', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(/does not match target run\/shot/);
  });

  // 7. Media modification on disk invalidates challenge
  it('7. proves media modification on disk invalidates challenge', async () => {
    const { orchestrator, run } = await setupRun();

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Modify the media on disk before approval confirmation
    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=red:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo}"`,
      { stdio: 'ignore' }
    );

    // Approval must fail because current physical media SHA does not match challenge
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Operator', 'Approval after disk change', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(/Media on disk.*has changed/);
  });

  // 8. Media re-import invalidates previous challenges
  it('8. proves media re-import invalidates previous challenges', async () => {
    const { orchestrator, run } = await setupRun();

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Re-import a new media file for SHOT_01 with options object
    const importedRun = await orchestrator.importShotMedia(
      run.projectId,
      run.runId,
      'SHOT_01',
      realShotVideo2,
      {
        generationSource: 'GOOGLE_FLOW_REAL',
        realExternal: true,
      }
    );

    // The previous challenge must be invalidated/consumed
    const storedChallenge = importedRun.approvalChallenges?.[challenge.challengeId];
    expect(storedChallenge?.consumedAt).toBeDefined();

    // Ensure QA is marked passed so the test specifically exercises challenge consumption check
    importedRun.qaEvidence['SHOT_01'].passed = true;
    await orchestrator['repository'].save(importedRun);

    // Trying to use it fails
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Operator', 'Approval with old challenge', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(/has already been consumed/);
  });

  // 9. QA replacement invalidates challenge
  it('9. proves QA replacement invalidates challenge', async () => {
    const { orchestrator, run } = await setupRun();

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Replace the QA report for SHOT_01
    const currentRun = await orchestrator['repository'].findById(run.projectId, run.runId);
    currentRun!.qaEvidence['SHOT_01'].reportId = 'rep_01_replaced';
    await orchestrator['repository'].save(currentRun!);

    // Attempting to approve must fail because bound QA report changed
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Operator', 'Approval with replaced QA', {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(/Approval challenge QA report ID.*does not match current QA report ID/);
  });

  // 10. Automated approval stays AUTOMATED_TEST
  it('10. proves automated approval stays AUTOMATED_TEST and interactive=false', async () => {
    const { orchestrator, run } = await setupRun();

    const approvedRun = await orchestrator.approveShot(
      run.projectId,
      run.runId,
      'SHOT_01',
      'Automated CI Runner',
      'Automated smoke test approval'
    );

    const approval = approvedRun.approvalEvidence['SHOT_01'];
    expect(approval.approvalType).toBe('AUTOMATED_TEST');
    expect(approval.interactive).toBe(false);

    // Verify that AUTOMATED_TEST approval blocks MASTER_PRODUCTION_VERIFIED
    const verifierResult = ProductionMasterVerifier.verify({
      run: approvedRun,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: {
        projectId: run.projectId,
        evaluatedAt: new Date().toISOString(),
        score: 0.95,
        passed: true,
        criticalDefects: 0,
        checks: [],
      },
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
    });

    expect(verifierResult.passed).toBe(false);
    expect(verifierResult.status).toBe('FAILED_VERIFICATION');
    expect(verifierResult.reasons.some((r) => r.includes('requires HUMAN approval'))).toBe(true);
  });

  // 11. Real interactive challenge flow records HUMAN with verified binding
  it('11. proves real interactive challenge ceremony records genuine HUMAN approval', async () => {
    const { orchestrator, run } = await setupRun();

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    const approvedRun = await orchestrator.approveShot(
      run.projectId,
      run.runId,
      'SHOT_01',
      'Director Sarah',
      'Framing, lighting, and acting approved',
      {
        approvalType: 'HUMAN',
        interactive: true,
        actorDisplayName: 'Director Sarah',
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      }
    );

    const approval = approvedRun.approvalEvidence['SHOT_01'];
    expect(approval.approvalType).toBe('HUMAN');
    expect(approval.interactive).toBe(true);
    expect(approval.challengeId).toBe(challenge.challengeId);
    expect(approval.challengeNonce).toBe(challenge.nonce);
    expect(approval.mediaSha256).toBe(realSha256);
  });

  // 12. Offline rehearsal can never become MASTER_PRODUCTION_VERIFIED
  it('12. proves offline rehearsal can never become MASTER_PRODUCTION_VERIFIED', async () => {
    const { run } = await setupRun();

    // Set offline double / rehearsal characteristics
    run.qaEvidence['SHOT_01'].mechanism = 'OFFLINE_TEST_DOUBLE';
    run.qaEvidence['SHOT_01'].isSynthetic = true;
    run.qaEvidence['SHOT_01'].providerTrust = 'MOCK_TEST_DOUBLE';
    run.mediaEvidence['SHOT_01'].generationSource = 'SIMULATED_FLOW';
    run.approvalEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      candidateAssetId: 'ASSET_01',
      canonicalAssetId: 'CANON_SHOT_01',
      mediaSha256: realSha256,
      status: 'APPROVED',
      approvalType: 'AUTOMATED_TEST',
      decidedBy: 'Rehearsal Bot',
      decidedAt: new Date().toISOString(),
      interactive: false,
      confirmedByOperator: false,
    };

    const verifierResult = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      continuityReport: {
        projectId: run.projectId,
        evaluatedAt: new Date().toISOString(),
        score: 0.95,
        passed: true,
        criticalDefects: 0,
        checks: [],
      },
      shotVideoMap: { SHOT_01: realShotVideo },
      shots: [baseShotContract],
      acceptanceBundle: { valid: true },
      allowRehearsal: true,
    });

    expect(verifierResult.passed).toBe(true);
    // Crucial: Must be OFFLINE_REHEARSAL_VERIFIED, NEVER MASTER_PRODUCTION_VERIFIED
    expect(verifierResult.status).toBe('OFFLINE_REHEARSAL_VERIFIED');
    expect(verifierResult.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
  });

  // 13. Documentation truth agrees with verifier semantics
  it('13. proves README and pilot reports do not falsely claim MASTER_PRODUCTION_VERIFIED', () => {
    const readmeContent = fs.readFileSync(path.resolve('README.md'), 'utf-8');
    const pilotReportContent = fs.readFileSync(
      path.resolve('docs', 'reports', 'phase18-production-pilot-report.md'),
      'utf-8'
    );

    // In README, Phase 18 must report Master Production: NOT VERIFIED (OFFLINE_REHEARSAL_VERIFIED)
    expect(readmeContent).toContain('Master Production: `NOT VERIFIED (OFFLINE_REHEARSAL_VERIFIED)`');
    expect(readmeContent).not.toMatch(/Master Production:\s*`MASTER_PRODUCTION_VERIFIED`/);

    // In pilot report, MASTER PRODUCTION VERIFIED must be NOT VERIFIED
    expect(pilotReportContent).toContain('| **MASTER PRODUCTION VERIFIED** | **NOT VERIFIED** |');
  });
});
