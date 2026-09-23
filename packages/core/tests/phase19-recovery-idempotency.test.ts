import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  EvidenceStore,
  MediaToolchainDoctor,
  ArtifactVerifier,
  DeterministicOfflineLLMDouble,
  ProductionSafetyError,
  ProductionNextActionResolver,
  ProductionAcceptanceBundle,
  ProductionInvariantValidator,
} from '../src/index.js';

describe('Phase 19.20 & 19.21 & 19.23 — Recovery, Restart Idempotency, and Forensic Binding', () => {
  const testDir = path.resolve('temp_test_phase19_recovery_' + Date.now());
  let storage: FileSystemStorage;
  let assetRegistry: FileSystemAssetRegistry;
  let evidenceStore: EvidenceStore;
  let offlineDouble: DeterministicOfflineLLMDouble;
  let realShotVideo: string;
  let realShotVideoSha: string;
  let realShotVideo2: string;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    assetRegistry = new FileSystemAssetRegistry(storage);
    evidenceStore = new EvidenceStore(storage);
    offlineDouble = new DeterministicOfflineLLMDouble();

    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    realShotVideo = path.join(testDir, 'pilot_shot_01.mp4');
    realShotVideo2 = path.join(testDir, 'pilot_shot_02.mp4');

    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=navy:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo}"`,
      { stdio: 'ignore' }
    );
    realShotVideoSha = ArtifactVerifier.verify(realShotVideo, { requireVideoStream: true }).checksumSha256!;

    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=maroon:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo2}"`,
      { stdio: 'ignore' }
    );
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

  it('Scenario 1: Process crash after Flow handoff generation recovers safely upon restart without re-analyzing story', async () => {
    const projectId = 'proj_crash_1';
    const seriesId = 'series_crash_1';
    const storyScript = 'Minh nhìn thấy một con bướm trắng phát sáng bay quanh ngọn nến trong căn phòng tối tĩnh lặng.';

    // 1. First process run
    const orchestrator1 = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const run1 = await orchestrator1.createRun({
      projectId,
      seriesId,
      rawScript: storyScript,
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });

    const handoffRun = await orchestrator1.execute(projectId, run1.runId, { allowRehearsal: true });
    expect(handoffRun.status).toBe('NEEDS_USER_ACTION');
    expect(handoffRun.currentStage).toBe('generating_shot');
    const shotId = handoffRun.currentShotId!;
    expect(shotId).toBeDefined();

    const handoffManifestPath = `.studio/production/${projectId}/${run1.runId}/handoff/${shotId}/handoff-manifest.json`;
    expect(await storage.exists(handoffManifestPath)).toBe(true);
    const initialManifest = await storage.read(handoffManifestPath);

    // 2. SIMULATE HARD CRASH: Destroy all in-memory orchestrator instances
    // 3. Restart process with new instances reading from the same storage
    const freshStorage = new FileSystemStorage(testDir);
    const freshAssetRegistry = new FileSystemAssetRegistry(freshStorage);
    const freshOrchestrator = new ProductionOrchestrator(freshStorage, freshAssetRegistry, offlineDouble);

    // Re-execute without new media: should remain in NEEDS_USER_ACTION and not overwrite handoff
    const recoveredRun = await freshOrchestrator.execute(projectId, run1.runId, { allowRehearsal: true });
    expect(recoveredRun.status).toBe('NEEDS_USER_ACTION');
    expect(recoveredRun.currentShotId).toBe(shotId);

    const postRestartManifest = await freshStorage.read(handoffManifestPath);
    expect(postRestartManifest).toBe(initialManifest);
  });

  it('Scenario 2: Process crash after media import recovers media and QA evidence intact', async () => {
    const projectId = 'proj_crash_2';
    const seriesId = 'series_crash_2';
    const storyScript = 'Minh nhìn thấy một con bướm trắng phát sáng bay quanh ngọn nến trong căn phòng tối tĩnh lặng.';

    const orchestrator1 = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const run1 = await orchestrator1.createRun({
      projectId,
      seriesId,
      rawScript: storyScript,
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator1.execute(projectId, run1.runId, { allowRehearsal: true });

    const shotId = run1.currentShotId || 'SHOT_SCENE_01_SH01';
    const importedRun = await orchestrator1.importShotMedia(projectId, run1.runId, shotId, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Simulated download before crash',
    });
    expect(importedRun.status).toBe('APPROVAL_REQUIRED');
    const recordedSha = importedRun.mediaEvidence[shotId]?.sha256;
    const recordedQAReportId = importedRun.qaEvidence[shotId]?.reportId;
    expect(recordedSha).toBe(realShotVideoSha);

    // SIMULATE CRASH
    const freshStorage = new FileSystemStorage(testDir);
    const freshRegistry = new FileSystemAssetRegistry(freshStorage);
    const freshOrchestrator = new ProductionOrchestrator(freshStorage, freshRegistry, offlineDouble);

    const repoRun = await freshStorage.readJson<any>(
      `.studio/production/${projectId}/${run1.runId}/production-run.json`
    );
    expect(repoRun.status).toBe('APPROVAL_REQUIRED');
    expect(repoRun.mediaEvidence[shotId]?.sha256).toBe(recordedSha);
    expect(repoRun.qaEvidence[shotId]?.reportId).toBe(recordedQAReportId);

    // Next action resolver correctly detects approval required
    const nextAction = await ProductionNextActionResolver.resolve(repoRun, freshStorage);
    expect(nextAction.state).toBe('WAITING_FOR_HUMAN_REVIEW');
    expect(nextAction.recommendedCommand).toContain(`approve ${run1.runId} ${shotId}`);
  });

  it('Scenario 3: Interruption after challenge issuance preserves challenge; consumed challenge survives restart', async () => {
    const projectId = 'proj_crash_3';
    const seriesId = 'series_crash_3';
    const storyScript = 'Minh nhìn thấy một con bướm trắng phát sáng bay quanh ngọn nến trong căn phòng tối tĩnh lặng.';

    const orchestrator1 = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const run1 = await orchestrator1.createRun({
      projectId,
      seriesId,
      rawScript: storyScript,
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator1.execute(projectId, run1.runId, { allowRehearsal: true });
    const shotId = run1.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator1.importShotMedia(projectId, run1.runId, shotId, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Simulated Flow Download',
    });

    // Issue approval challenge
    const challenge = await orchestrator1.issueApprovalChallenge(projectId, run1.runId, shotId, 'APPROVE');
    expect(challenge.challengeId).toBeDefined();
    expect(challenge.consumedAt).toBeNull();

    // CRASH 1: restart before consumption
    const storage2 = new FileSystemStorage(testDir);
    const registry2 = new FileSystemAssetRegistry(storage2);
    const orchestrator2 = new ProductionOrchestrator(storage2, registry2, offlineDouble);

    // Approve using challenge in fresh process
    const approvedRun = await orchestrator2.approveShot(
      projectId,
      run1.runId,
      shotId,
      'Lead Operator',
      undefined,
      {
        approvalType: 'HUMAN',
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
        interactive: true,
      }
    );
    expect(approvedRun.approvalEvidence[shotId]?.status).toBe('APPROVED');
    expect(approvedRun.approvalEvidence[shotId]?.approvalType).toBe('HUMAN');
    expect(approvedRun.approvalChallenges?.[challenge.challengeId]?.consumedAt).not.toBeNull();

    // CRASH 2: restart after consumption
    const storage3 = new FileSystemStorage(testDir);
    const registry3 = new FileSystemAssetRegistry(storage3);
    const orchestrator3 = new ProductionOrchestrator(storage3, registry3, offlineDouble);

    // Attempting to reuse the consumed challenge in a new process MUST throw
    await expect(
      orchestrator3.approveShot(
        projectId,
        run1.runId,
        shotId,
        'Malicious Replayer',
        undefined,
        {
          approvalType: 'HUMAN',
          challengeId: challenge.challengeId,
          challengeNonce: challenge.nonce,
          interactive: true,
        }
      )
    ).rejects.toThrow(ProductionSafetyError);
  });

  it('Scenario 4: Completed run survives restart and repeated resume is strictly idempotent', async () => {
    const projectId = 'proj_crash_4';
    const seriesId = 'series_crash_4';
    const storyScript = 'Minh nhìn thấy một con bướm trắng phát sáng bay quanh ngọn nến trong căn phòng tối tĩnh lặng.';

    const orchestrator1 = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const run1 = await orchestrator1.createRun({
      projectId,
      seriesId,
      rawScript: storyScript,
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator1.execute(projectId, run1.runId, { allowRehearsal: true });
    const shotId = run1.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator1.importShotMedia(projectId, run1.runId, shotId, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Simulated Flow Download',
    });

    await orchestrator1.approveShot(
      projectId,
      run1.runId,
      shotId,
      'Automated Test Harness',
      undefined,
      {
        approvalType: 'AUTOMATED_TEST',
        actorId: 'test-runner',
        actorDisplayName: 'Test Runner',
        approvalSource: 'test',
        interactive: false,
      }
    );

    // Execute to completion (master render + acceptance)
    const completedRun = await orchestrator1.execute(projectId, run1.runId, { allowRehearsal: true });
    expect(completedRun.status).toBe('COMPLETED');
    expect(completedRun.masterEvidence).toBeDefined();
    const initialMasterSha = completedRun.masterEvidence!.masterSha256;
    const initialCompletedShots = [...completedRun.completedShotIds];

    // CRASH: Restart
    const freshStorage = new FileSystemStorage(testDir);
    const freshRegistry = new FileSystemAssetRegistry(freshStorage);
    const freshOrchestrator = new ProductionOrchestrator(freshStorage, freshRegistry, offlineDouble);

    // Call execute/resume again: MUST BE IDEMPOTENT
    const resumedRun = await freshOrchestrator.execute(projectId, run1.runId, { allowRehearsal: true });
    expect(resumedRun.status).toBe('COMPLETED');
    expect(resumedRun.completedShotIds).toEqual(initialCompletedShots);
    expect(resumedRun.masterEvidence!.masterSha256).toBe(initialMasterSha);

    // Invariant validator confirms zero state corruption
    const invariantCheck = ProductionInvariantValidator.validate(resumedRun);
    expect(invariantCheck.valid).toBe(true);
  });

  it('Scenario 5: Status inspection is strictly read-only and causes zero disk mutations', async () => {
    const projectId = 'proj_readonly_5';
    const seriesId = 'series_readonly_5';
    const storyScript = 'Minh nhìn thấy một con bướm trắng phát sáng bay quanh ngọn nến trong căn phòng tối tĩnh lặng.';

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const run = await orchestrator.createRun({
      projectId,
      seriesId,
      rawScript: storyScript,
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    const executedRun = await orchestrator.execute(projectId, run.runId, { allowRehearsal: true });

    const evidenceDir = `.studio/production/${projectId}/${run.runId}`;
    const filesBefore = await storage.list(evidenceDir);
    const hashesBefore: Record<string, string> = {};
    for (const f of filesBefore) {
      hashesBefore[f] = crypto.createHash('sha256').update(await storage.read(f)).digest('hex');
    }

    // Call resolve (status command implementation) 5 times
    for (let i = 0; i < 5; i++) {
      const resolved = await ProductionNextActionResolver.resolve(executedRun, storage);
      expect(resolved.state).toBe('WAITING_FOR_FLOW_GENERATION');
    }

    // Verify all files on disk are completely identical byte-for-byte
    const filesAfter = await storage.list(evidenceDir);
    expect(filesAfter).toEqual(filesBefore);
    for (const f of filesAfter) {
      const hashAfter = crypto.createHash('sha256').update(await storage.read(f)).digest('hex');
      expect(hashAfter).toBe(hashesBefore[f]);
    }
  });

  it('Forensics Attack 1: Rejects approval challenge issued for another project', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);

    // Project A
    const runA = await orchestrator.createRun({
      projectId: 'proj_A',
      seriesId: 'series_common',
      rawScript: 'Story A',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator.execute('proj_A', runA.runId, { allowRehearsal: true });
    const shotA = runA.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator.importShotMedia('proj_A', runA.runId, shotA, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });
    const challengeA = await orchestrator.issueApprovalChallenge('proj_A', runA.runId, shotA, 'APPROVE');

    // Project B
    const runB = await orchestrator.createRun({
      projectId: 'proj_B',
      seriesId: 'series_common',
      rawScript: 'Story B',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator.execute('proj_B', runB.runId, { allowRehearsal: true });
    const shotB = runB.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator.importShotMedia('proj_B', runB.runId, shotB, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });

    // Attempt to use Challenge A to approve Run B
    await expect(
      orchestrator.approveShot('proj_B', runB.runId, shotB, 'Attacker', undefined, {
        approvalType: 'HUMAN',
        challengeId: challengeA.challengeId,
        challengeNonce: challengeA.nonce,
        interactive: true,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  it('Forensics Attack 2: Rejects approval challenge issued for another run in same project', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const projectId = 'proj_cross_run';

    // Run 1
    const run1 = await orchestrator.createRun({
      projectId,
      seriesId: 'series_common',
      rawScript: 'Story 1',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator.execute(projectId, run1.runId, { allowRehearsal: true });
    const shot1 = run1.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator.importShotMedia(projectId, run1.runId, shot1, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });
    const challengeRun1 = await orchestrator.issueApprovalChallenge(projectId, run1.runId, shot1, 'APPROVE');

    // Run 2
    const run2 = await orchestrator.createRun({
      projectId,
      seriesId: 'series_common',
      rawScript: 'Story 2',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator.execute(projectId, run2.runId, { allowRehearsal: true });
    const shot2 = run2.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator.importShotMedia(projectId, run2.runId, shot2, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });

    // Attempt cross-run challenge injection
    await expect(
      orchestrator.approveShot(projectId, run2.runId, shot2, 'Attacker', undefined, {
        approvalType: 'HUMAN',
        challengeId: challengeRun1.challengeId,
        challengeNonce: challengeRun1.nonce,
        interactive: true,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  it('Forensics Attack 3: Rejects using a REJECT challenge to execute APPROVE action', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const projectId = 'proj_action_mismatch';

    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_action_mismatch',
      rawScript: 'Story Script',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator.execute(projectId, run.runId, { allowRehearsal: true });
    const shotId = run.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator.importShotMedia(projectId, run.runId, shotId, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });

    // Issue challenge specifically for REJECT
    const rejectChallenge = await orchestrator.issueApprovalChallenge(projectId, run.runId, shotId, 'REJECT');
    expect(rejectChallenge.approvalAction).toBe('REJECT');

    // Attempt to pass this challenge to approveShot (action mismatch)
    await expect(
      orchestrator.approveShot(projectId, run.runId, shotId, 'Attacker', undefined, {
        approvalType: 'HUMAN',
        challengeId: rejectChallenge.challengeId,
        challengeNonce: rejectChallenge.nonce,
        interactive: true,
      })
    ).rejects.toThrow(/not "APPROVE"/);
  });

  it('Forensics Attack 4: Modifying media file on disk after challenge issuance causes challenge rejection', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const projectId = 'proj_disk_tamper';

    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_disk_tamper',
      rawScript: 'Story Script',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator.execute(projectId, run.runId, { allowRehearsal: true });
    const shotId = run.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator.importShotMedia(projectId, run.runId, shotId, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });

    const challenge = await orchestrator.issueApprovalChallenge(projectId, run.runId, shotId, 'APPROVE');

    // Overwrite the imported media file with different bytes
    fs.copyFileSync(realShotVideo2, realShotVideo);

    // Attempting to approve must fail closed because recorded SHA does not match modified file
    await expect(
      orchestrator.approveShot(projectId, run.runId, shotId, 'Operator', undefined, {
        approvalType: 'HUMAN',
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
        interactive: true,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  it('Forensics Attack 5: Nonce with incorrect case or whitespace distortion is rejected fail-closed', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
    const projectId = 'proj_nonce_strict';

    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_nonce_strict',
      rawScript: 'Story Script',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
    });
    await orchestrator.execute(projectId, run.runId, { allowRehearsal: true });
    const shotId = run.currentShotId || 'SHOT_SCENE_01_SH01';
    await orchestrator.importShotMedia(projectId, run.runId, shotId, realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });

    const challenge = await orchestrator.issueApprovalChallenge(projectId, run.runId, shotId, 'APPROVE');
    const validNonce = challenge.nonce;

    // Distort nonce with whitespace
    await expect(
      orchestrator.approveShot(projectId, run.runId, shotId, 'Operator', undefined, {
        approvalType: 'HUMAN',
        challengeId: challenge.challengeId,
        challengeNonce: ` ${validNonce} `,
        interactive: true,
      })
    ).rejects.toThrow(/nonce mismatch/);

    // Distort nonce with reversed casing
    const flippedCaseNonce = validNonce.split('').map((c) =>
      c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()
    ).join('');

    if (flippedCaseNonce !== validNonce) {
      await expect(
        orchestrator.approveShot(projectId, run.runId, shotId, 'Operator', undefined, {
          approvalType: 'HUMAN',
          challengeId: challenge.challengeId,
          challengeNonce: flippedCaseNonce,
          interactive: true,
        })
      ).rejects.toThrow(/nonce mismatch/);
    }
  });
});
