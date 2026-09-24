import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  ProductionMasterVerifier,
  ProductionInvalidationEngine,
  ProductionNextActionResolver,
  ProductionAcceptanceBundle,
  EvidenceStore,
  MediaToolchainDoctor,
  DeterministicOfflineLLMDouble,
} from '../src/index.js';

describe('Phase 23.16 — Final Adversarial Chain & Invariant Integration Test', () => {
  const testDir = path.resolve('.studio/temp_phase23_adversarial');
  let storage: FileSystemStorage;
  let assetRegistry: FileSystemAssetRegistry;
  let evidenceStore: EvidenceStore;
  let ffmpegPath: string;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    assetRegistry = new FileSystemAssetRegistry(storage);
    evidenceStore = new EvidenceStore(storage);
    ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
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

  it('runs complete 3-shot adversarial lifecycle: detects tampering, isolates invalidation, resumes, renders master, and validates acceptance bundle', async () => {
    const projectId = 'proj_adv_chain';
    const seriesId = 'series_adv_chain';
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, new DeterministicOfflineLLMDouble());

    // 1. Create a 3-shot production run
    const run = await orchestrator.createRun({
      projectId,
      seriesId,
      rawScript: 'SCENE 1 - LAB - DAY\nShot 1: Entrance.\nShot 2: Discovery.\nShot 3: Escape.\n',
      mode: 'PRODUCTION',
      requiredShotCount: 3,
    });

    expect(run.status).toBe('CREATED');
    expect(run.completedShotIds).toHaveLength(0);
    run.pendingShotIds = ['SHOT_01', 'SHOT_02', 'SHOT_03'];
    await evidenceStore.saveProductionRun(run);

    // 2. Generate valid synthetic media fixtures for 3 shots
    const media1 = path.join(testDir, 'raw_shot1.mp4');
    const media2 = path.join(testDir, 'raw_shot2.mp4');
    const media3 = path.join(testDir, 'raw_shot3.mp4');

    execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media1], { stdio: 'ignore' });
    execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media2], { stdio: 'ignore' });
    execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=green:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media3], { stdio: 'ignore' });

    // 3. Import and Approve Shot 1
    run.status = 'WAITING_FOR_IMPORT';
    await evidenceStore.saveProductionRun(run);

    const runAfterShot1Import = await orchestrator.importShotMedia(projectId, run.runId, 'SHOT_01', media1, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Simulated Flow Rehearsal',
    });
    expect(runAfterShot1Import.mediaEvidence['SHOT_01']).toBeDefined();

    const runAfterShot1Approve = await orchestrator.approveShot(projectId, run.runId, 'SHOT_01', 'Test Harness', undefined, {
      approvalType: 'AUTOMATED_TEST',
      interactive: false,
    });
    expect(runAfterShot1Approve.approvalEvidence['SHOT_01']).toBeDefined();
    expect(runAfterShot1Approve.completedShotIds).toContain('SHOT_01');

    // 4. Import and Approve Shot 2
    const runAfterShot2Import = await orchestrator.importShotMedia(projectId, run.runId, 'SHOT_02', media2, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Simulated Flow Rehearsal',
    });
    expect(runAfterShot2Import.mediaEvidence['SHOT_02']).toBeDefined();

    const runAfterShot2Approve = await orchestrator.approveShot(projectId, run.runId, 'SHOT_02', 'Test Harness', undefined, {
      approvalType: 'AUTOMATED_TEST',
      interactive: false,
    });
    expect(runAfterShot2Approve.approvalEvidence['SHOT_02']).toBeDefined();
    expect(runAfterShot2Approve.completedShotIds).toEqual(['SHOT_01', 'SHOT_02']);

    const originalShot1Sha = runAfterShot2Approve.approvalEvidence['SHOT_01'].mediaSha256;
    const originalShot2Sha = runAfterShot2Approve.approvalEvidence['SHOT_02'].mediaSha256;

    // 5. ADVERSARIAL ATTACK: Tamper with Shot 2 media file on disk
    const shot2PhysicalPath = runAfterShot2Approve.mediaEvidence['SHOT_02'].physicalPath;
    expect(fs.existsSync(shot2PhysicalPath)).toBe(true);

    // Corrupt Shot 2 by modifying file content on disk
    fs.appendFileSync(shot2PhysicalPath, Buffer.from('TAMPERED_MALICIOUS_EXTRA_BYTES_1234567890'));

    // 6. VERIFY: ProductionMasterVerifier must catch disk modification and block verification
    const tamperVerifier = ProductionMasterVerifier.verify({
      run: runAfterShot2Approve,
      requiredShotIds: ['SHOT_01', 'SHOT_02', 'SHOT_03'],
      allowRehearsal: true,
    });
    expect(tamperVerifier.passed).toBe(false);
    expect(tamperVerifier.reasons.some((r) => r.includes('SHOT_02') && r.includes('checksum mismatch'))).toBe(true);

    // 7. INVALIDATE: Cascade invalidation on Shot 2
    const invReport = ProductionInvalidationEngine.invalidateOnMediaChange(
      runAfterShot2Approve,
      'SHOT_02',
      'Adversarial disk tampering detected'
    );

    expect(invReport.invalidatedQA).toBe(true);
    expect(invReport.invalidatedApproval).toBe(true);

    // Critical Invariant: Shot 1 MUST remain completely intact!
    expect(runAfterShot2Approve.approvalEvidence['SHOT_01']).toBeDefined();
    expect(runAfterShot2Approve.approvalEvidence['SHOT_01'].mediaSha256).toBe(originalShot1Sha);
    expect(runAfterShot2Approve.completedShotIds).toContain('SHOT_01');

    // Shot 2 is invalidated and pending
    expect(runAfterShot2Approve.approvalEvidence['SHOT_02']).toBeUndefined();
    expect(runAfterShot2Approve.completedShotIds).not.toContain('SHOT_02');
    expect(runAfterShot2Approve.pendingShotIds).toContain('SHOT_02');

    // 8. NEXT ACTION RESOLVER: Must identify SHOT_02 as the next required action
    const nextAction = await ProductionNextActionResolver.resolve(runAfterShot2Approve, storage);
    expect(nextAction.nextAction).toContain('SHOT_02');

    // 9. REPAIR: Re-generate clean media for Shot 2 and re-import
    const media2Repaired = path.join(testDir, 'raw_shot2_repaired.mp4');
    execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=yellow:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media2Repaired], { stdio: 'ignore' });

    const runRepaired = await orchestrator.importShotMedia(projectId, run.runId, 'SHOT_02', media2Repaired, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Repaired Flow Rehearsal',
    });
    const runRepairedApprove = await orchestrator.approveShot(projectId, run.runId, 'SHOT_02', 'Test Harness', undefined, {
      approvalType: 'AUTOMATED_TEST',
      interactive: false,
    });
    expect(runRepairedApprove.approvalEvidence['SHOT_02']).toBeDefined();
    expect(runRepairedApprove.completedShotIds).toContain('SHOT_02');

    // 10. Complete Shot 3
    await orchestrator.importShotMedia(projectId, run.runId, 'SHOT_03', media3, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Simulated Flow Rehearsal',
    });
    const runAllShotsApproved = await orchestrator.approveShot(projectId, run.runId, 'SHOT_03', 'Test Harness', undefined, {
      approvalType: 'AUTOMATED_TEST',
      interactive: false,
    });
    expect(runAllShotsApproved.completedShotIds).toEqual(
      expect.arrayContaining(['SHOT_01', 'SHOT_02', 'SHOT_03'])
    );

    // 11. Render offline master deliverable
    const masterMp4 = path.join(testDir, 'master_rehearsal.mp4');
    execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:d=1.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', masterMp4], { stdio: 'ignore' });

    const crypto = await import('node:crypto');
    const masterSha = crypto.createHash('sha256').update(fs.readFileSync(masterMp4)).digest('hex');

    runAllShotsApproved.status = 'COMPLETED';
    runAllShotsApproved.masterEvidence = {
      manifestId: 'manifest_master_rehearsal',
      sequenceId: 'seq_master_rehearsal',
      masterVideoPath: masterMp4,
      masterSha256: masterSha,
      sizeBytes: fs.statSync(masterMp4).size,
      durationSeconds: 1.5,
      width: 160,
      height: 90,
      videoCodec: 'h264',
      verifiedAt: new Date().toISOString(),
      verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED', // Truth: never MASTER_PRODUCTION_VERIFIED with simulated/test inputs
    };
    await evidenceStore.saveProductionRun(runAllShotsApproved);

    // 12. Final Production Master Verification: physically verifies media on disk
    const finalMasterVerification = ProductionMasterVerifier.verify({
      run: runAllShotsApproved,
      requiredShotIds: ['SHOT_01', 'SHOT_02', 'SHOT_03'],
      masterVideoPath: masterMp4,
      manifestId: 'manifest_master_rehearsal',
      sequenceId: 'seq_master_rehearsal',
      shotVideoMap: {
        SHOT_01: runAllShotsApproved.mediaEvidence['SHOT_01'].physicalPath,
        SHOT_02: runAllShotsApproved.mediaEvidence['SHOT_02'].physicalPath,
        SHOT_03: runAllShotsApproved.mediaEvidence['SHOT_03'].physicalPath,
      },
      allowRehearsal: true,
    });
    expect(finalMasterVerification.passed).toBe(true);
    expect(finalMasterVerification.status).toBe('OFFLINE_REHEARSAL_VERIFIED');
    expect(finalMasterVerification.status).not.toBe('MASTER_PRODUCTION_VERIFIED');

    // 13. Build & Validate Acceptance Bundle
    const { acceptanceDir, manifest } = await ProductionAcceptanceBundle.build({
      projectId,
      runId: runAllShotsApproved.runId,
      storage,
      run: runAllShotsApproved,
      masterEvidence: runAllShotsApproved.masterEvidence!,
      requiredShotIds: ['SHOT_01', 'SHOT_02', 'SHOT_03'],
    });
    expect(manifest).toBeDefined();

    // Validate clean acceptance bundle
    const validCheck = await ProductionAcceptanceBundle.validate(acceptanceDir, storage);
    expect(validCheck.valid).toBe(true);
    expect(validCheck.metadata?.verificationStatus).toBe('OFFLINE_REHEARSAL_VERIFIED');
    expect(validCheck.metadata?.requiredShotIds).toEqual(['SHOT_01', 'SHOT_02', 'SHOT_03']);

    // 14. TAMPER WITH ACCEPTANCE MANIFEST: Fail closed on tampering
    const manifestPath = path.join(testDir, acceptanceDir, 'acceptance-manifest.json');
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    // Attempt malicious tampering
    manifestContent.projectId = 'tampered_project_id';
    fs.writeFileSync(manifestPath, JSON.stringify(manifestContent, null, 2));

    const tamperedCheck = await ProductionAcceptanceBundle.validate(acceptanceDir, storage);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reasons.some((r) => r.includes('tampered with') || r.includes('self-integrity'))).toBe(true);
  }, 60000);
});
