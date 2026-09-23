import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  EvidenceStore,
  MediaToolchainDoctor,
  DeterministicOfflineLLMDouble,
  ProductionNextActionResolver,
  ProductionInvariantValidator,
  ProductionAcceptanceBundle,
} from '@ai-studio/core';

export async function runPilotRehearsalSmoke(): Promise<number> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎬 Running Phase 19 1-Shot Canonical Pilot Offline Rehearsal Smoke');
  console.log('   TAGS: OFFLINE_REHEARSAL | SIMULATED_FLOW | AUTOMATED_TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const cwd = process.cwd();
  const storage = new FileSystemStorage(cwd);
  const assetRegistry = new FileSystemAssetRegistry(storage);
  const evidenceStore = new EvidenceStore(storage);

  const projectId = 'proj_pilot_rehearsal';
  const seriesId = 'series_pilot_rehearsal';
  const runId = `run_pilot_rehearsal_${Date.now()}`;
  const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();

  const offlineDouble = new DeterministicOfflineLLMDouble();
  const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);

  const pilotStory = 'Minh nhìn thấy một con bướm trắng phát sáng bay quanh ngọn nến trong căn phòng tối tĩnh lặng.';

  // 1. Create Pilot Run with pilotMode: true, requiredShotCount: 1
  console.log('1️⃣ Creating Canonical 1-Shot Pilot ProductionRun (mode=PRODUCTION, pilotMode=true)...');
  const createdRun = await orchestrator.createRun({
    projectId,
    seriesId,
    rawScript: pilotStory,
    mode: 'PRODUCTION',
    pilotMode: true,
    requiredShotCount: 1,
    targetRunId: runId,
  });
  console.log(` - Run ID           : ${createdRun.runId}`);
  console.log(` - Pilot Mode       : ${createdRun.pilotMode ? 'YES (1-shot pilot) ✅' : 'NO ❌'}`);
  console.log(` - Required Shots   : ${createdRun.requiredShotCount}`);
  console.log(` - Initial Status   : ${createdRun.status} ✅`);

  // 2. Execute Initial Pipeline (Story -> 1 Shot Planned -> Route to Flow Handoff)
  console.log('\n2️⃣ Executing Initial Pilot Stages (Story Intelligence -> Shot Planning -> Flow Routing)...');
  const handoffRun = await orchestrator.execute(projectId, runId, { allowRehearsal: true });
  console.log(` - Stage after initial execute : ${handoffRun.currentStage}`);
  console.log(` - Status                     : ${handoffRun.status}`);
  console.log(` - Current Shot               : ${handoffRun.currentShotId}`);

  if (handoffRun.status !== 'NEEDS_USER_ACTION') {
    throw new Error(`Expected status NEEDS_USER_ACTION at external Flow boundary, got ${handoffRun.status}`);
  }
  console.log(' - Pipeline paused cleanly at external Google Flow human boundary ✅');

  // 3. Verify Flow Handoff Package
  const targetShotId = handoffRun.currentShotId!;
  const handoffDir = path.resolve('.studio', 'production', projectId, runId, 'handoff', targetShotId);
  console.log(`\n3️⃣ Verifying Google Flow Handoff Package in "${handoffDir}"...`);

  const expectedHandoffFiles = [
    'shot-contract.json',
    'flow-prompt.txt',
    'operator-instructions.md',
    'references.json',
    'continuity-context.json',
    'handoff-manifest.json',
  ];

  for (const file of expectedHandoffFiles) {
    const filePath = path.join(handoffDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing expected Flow handoff file: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    console.log(` - ${file.padEnd(26)} : ${stat.size} bytes ✅`);
  }

  // 4. Generate Simulated Flow Media (OFFLINE_REHEARSAL / SIMULATED_FLOW)
  console.log('\n4️⃣ Simulating Google Flow Generation & Operator Download (Offline Rehearsal Double)...');
  const downloadsDir = path.resolve('.studio', 'production', projectId, runId, 'flow_downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });
  const simulatedMp4Path = path.join(downloadsDir, `${targetShotId}_simulated_flow.mp4`);

  execSync(
    `"${ffmpegPath}" -y -f lavfi -i color=c=navy:s=1280x720:d=2.0:r=24 -c:v libx264 -pix_fmt yuv420p "${simulatedMp4Path}"`,
    { stdio: 'ignore' }
  );
  console.log(` - Generated simulated video: ${simulatedMp4Path} (${fs.statSync(simulatedMp4Path).size} bytes) ✅`);

  // 5. Import Media with SIMULATED_FLOW provenance
  console.log('\n5️⃣ Importing Media with explicit SIMULATED_FLOW provenance...');
  const importedRun = await orchestrator.importShotMedia(projectId, runId, targetShotId, simulatedMp4Path, {
    generationSource: 'SIMULATED_FLOW',
    provenance: 'Simulated Flow Download (Offline Pilot Rehearsal)',
  });
  console.log(` - Status after import : ${importedRun.status} ✅`);
  console.log(` - QA Report ID        : ${importedRun.qaEvidence[targetShotId]?.reportId}`);
  console.log(` - QA Passed           : ${importedRun.qaEvidence[targetShotId]?.passed}`);
  console.log(` - QA Trust            : ${importedRun.qaEvidence[targetShotId]?.providerTrust}`);

  // 6. Test Next Action Engine
  console.log('\n6️⃣ Resolving next recommended operator action via ProductionNextActionResolver...');
  const nextAction = await ProductionNextActionResolver.resolve(importedRun, storage);
  console.log(` - Next Action State   : ${nextAction.state}`);
  console.log(` - Next Action Key     : ${nextAction.nextAction}`);
  console.log(` - Recommended Command : ${nextAction.recommendedCommand}`);
  console.log(` - Blocking Reason     : ${nextAction.blockingReason || 'None'} ✅`);

  // 7. Approve Shot using AUTOMATED_TEST (Tagging as Rehearsal Approval)
  console.log('\n7️⃣ Executing Automated Rehearsal Approval (approvalType=AUTOMATED_TEST)...');
  const approvedRun = await orchestrator.approveShot(
    projectId,
    runId,
    targetShotId,
    'Pilot Rehearsal Test Harness',
    undefined,
    {
      approvalType: 'AUTOMATED_TEST',
      actorId: 'pilot-smoke-harness',
      actorDisplayName: 'Pilot Rehearsal Harness',
      approvalSource: 'pilot-rehearsal-smoke.ts',
      interactive: false,
    }
  );
  console.log(` - Status after approval : ${approvedRun.status} ✅`);
  console.log(` - Canonical Asset ID    : ${approvedRun.approvalEvidence[targetShotId]?.canonicalAssetId}`);

  // 8. Resume Pipeline to Master Render & Verification
  console.log('\n8️⃣ Resuming Pipeline for Timeline Assembly, Continuity QA, and Master Verification...');
  const finalRun = await orchestrator.execute(projectId, runId, { allowRehearsal: true });
  console.log(` - Final Run Status      : ${finalRun.status} 🏆`);

  if (!finalRun.masterEvidence) {
    throw new Error('Master evidence is missing after pipeline execution.');
  }

  // 9. Verify Rehearsal Verification Status (MUST be OFFLINE_REHEARSAL_VERIFIED, NEVER MASTER_PRODUCTION_VERIFIED)
  console.log('\n9️⃣ Validating Production Truth Boundaries...');
  console.log(` - Master Checksum       : ${finalRun.masterEvidence.masterSha256}`);
  console.log(` - Verification Status   : ${finalRun.masterEvidence.verificationStatus}`);

  if (finalRun.masterEvidence.verificationStatus === 'MASTER_PRODUCTION_VERIFIED') {
    throw new Error(
      'CRITICAL TRUTH VIOLATION: Offline rehearsal MUST NOT be marked MASTER_PRODUCTION_VERIFIED!'
    );
  }

  if (finalRun.masterEvidence.verificationStatus !== 'OFFLINE_REHEARSAL_VERIFIED') {
    throw new Error(
      `Expected verificationStatus OFFLINE_REHEARSAL_VERIFIED, got ${finalRun.masterEvidence.verificationStatus}`
    );
  }
  console.log(' - Truth verification: correctly tagged OFFLINE_REHEARSAL_VERIFIED ✅');

  // 10. Validate Acceptance Bundle Integrity
  console.log('\n🔟 Validating Acceptance Bundle Self-Integrity...');
  const acceptanceDir = path.resolve('.studio', 'production', projectId, runId, 'acceptance');
  const bundleValidation = await ProductionAcceptanceBundle.validate(acceptanceDir, storage);
  console.log(` - Bundle Valid          : ${bundleValidation.valid ? 'VALID ✅' : 'INVALID ❌'}`);
  if (!bundleValidation.valid) {
    throw new Error(`Acceptance bundle validation failed: ${bundleValidation.reasons.join('; ')}`);
  }

  // 11. Validate Production State Invariants
  console.log('\n1️⃣1️⃣ Validating Production State Invariants...');
  const invariantResult = ProductionInvariantValidator.validate(finalRun);
  console.log(` - Invariants Valid      : ${invariantResult.valid ? 'ALL INVARIANTS SATISFIED ✅' : 'VIOLATIONS FOUND ❌'}`);
  if (!invariantResult.valid) {
    throw new Error(`Invariant violations found: ${invariantResult.violations.join('; ')}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 1-SHOT CANONICAL PILOT OFFLINE REHEARSAL SUCCESSFUL');
  console.log('   All 11 orchestration steps verified with zero live calls.');
  console.log('   Ready for human operator execution in Phase 20.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return 0;
}
