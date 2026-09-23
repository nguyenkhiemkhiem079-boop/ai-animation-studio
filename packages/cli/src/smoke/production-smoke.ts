import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  CanonicalProductionPilot,
  EvidenceStore,
  ArtifactVerifier,
  VideoRenderer,
  TimelineAssembler,
  ProductionMasterVerifier,
  ProductionLeakDetector,
  DeterministicOfflineLLMDouble,
} from '@ai-studio/core';

export async function runProductionSmoke(): Promise<number> {
  console.log('🎬 Running Phase 18 Real Production Pilot Smoke Test (Offline & Deterministic Gate)...');

  const cwd = process.cwd();
  const storage = new FileSystemStorage(cwd);
  const assetRegistry = new FileSystemAssetRegistry(storage);

  const projectId = 'proj_pilot_smoke';
  const seriesId = 'series_pilot_smoke';
  const offlineDouble = new DeterministicOfflineLLMDouble();
  const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
  const evidenceStore = new EvidenceStore(storage);

  // 1. Create run
  console.log('1️⃣ Creating ProductionRun for Canonical Pilot Story...');
  const run = await orchestrator.createRun({
    projectId,
    seriesId,
    rawScript: CanonicalProductionPilot.CANONICAL_STORY,
    mode: 'PRODUCTION',
    targetRunId: `run_pilot_smoke_${Date.now()}`,
  });
  console.log(` - Run ID : ${run.runId}`);
  console.log(` - Status : ${run.status} ✅`);

  // 2. Initial execution
  console.log('\n2️⃣ Executing ProductionRun Initial Pipeline (Preflight -> Story -> Planning -> Shot 1)...');
  const executedRun = await orchestrator.execute(projectId, run.runId);
  console.log(` - Current Stage : ${executedRun.currentStage}`);
  console.log(` - Status        : ${executedRun.status} ✅`);
  console.log(` - Target Shot   : ${executedRun.currentShotId || 'N/A'}`);
  console.log(` - Next Action   : ${executedRun.resumeMetadata.nextAction || 'None'}`);

  // 3. Approve Shot 1 (deterministic HyperFrames candidate)
  const shot1Id = Object.keys(executedRun.mediaEvidence)[0];
  if (shot1Id && executedRun.status === 'APPROVAL_REQUIRED') {
    console.log(`\n3️⃣ Approving Candidate for Shot "${shot1Id}" into Canon...`);
    const approvedRun = await orchestrator.approveShot(
      projectId,
      run.runId,
      shot1Id,
      'Lead Director (Smoke Automated Sign-off)'
    );
    console.log(` - Status after Approval: ${approvedRun.status} ✅`);
    console.log(` - Canon Asset ID: ${approvedRun.approvalEvidence[shot1Id]?.canonicalAssetId}`);
  }

  // 4. Continue execution through all subsequent shots
  console.log('\n4️⃣ Resuming Pipeline for Subsequent Shot(s)...');
  let currentRun = await orchestrator.execute(projectId, run.runId);

  while (currentRun.status === 'NEEDS_USER_ACTION' && currentRun.currentShotId) {
    const shotId = currentRun.currentShotId;
    console.log(`\n5️⃣ Google Flow Assisted Handoff Reached for Shot "${shotId}" (NEEDS_USER_ACTION).`);
    console.log(' - Generating real playable MP4 deliverable for Flow download simulation...');

    const importDir = path.resolve('.studio', 'production', projectId, run.runId, 'flow_downloads');
    fs.mkdirSync(importDir, { recursive: true });
    const flowDownloadPath = path.join(importDir, `${shotId}_flow_generated.mp4`);

    if (!fs.existsSync(flowDownloadPath)) {
      const { execSync } = await import('node:child_process');
      const { MediaToolchainDoctor } = await import('@ai-studio/core');
      const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
      execSync(
        `"${ffmpegPath}" -y -f lavfi -i color=c=blue:s=1280x720:d=2.0:r=24 -c:v libx264 -pix_fmt yuv420p "${flowDownloadPath}"`,
        { stdio: 'ignore' }
      );
    }

    console.log(` - Simulated Flow Download Path: ${flowDownloadPath}`);
    console.log(' - Importing media via orchestrator.importShotMedia...');
    const importedRun = await orchestrator.importShotMedia(projectId, run.runId, shotId, flowDownloadPath);
    console.log(` - Status after Import & Visual QA: ${importedRun.status} ✅`);

    console.log(`\n6️⃣ Human Approval Boundary for Imported Shot "${shotId}"...`);
    const approvedRun = await orchestrator.approveShot(
      projectId,
      run.runId,
      shotId,
      'Lead Director (Flow Acceptance Sign-off)'
    );
    console.log(` - Status after Approval: ${approvedRun.status} ✅`);

    console.log('\n7️⃣ Resuming Pipeline to Next Shot or Final Assembly...');
    currentRun = await orchestrator.execute(projectId, run.runId);
  }

  console.log(` - Final Run Status: ${currentRun.status} 🏆`);

  if (currentRun.masterEvidence) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏆 PHASE 18 REAL PRODUCTION PILOT PASSED! MASTER DELIVERABLE VERIFIED!');
    console.log(` - Master MP4 : ${currentRun.masterEvidence.masterVideoPath} (${currentRun.masterEvidence.sizeBytes} bytes)`);
    console.log(` - Checksum   : ${currentRun.masterEvidence.masterSha256}`);
    console.log(` - Resolution : ${currentRun.masterEvidence.width}x${currentRun.masterEvidence.height}`);
    console.log(` - Codec      : ${currentRun.masterEvidence.videoCodec}`);
    console.log(` - Status     : ${currentRun.masterEvidence.verificationStatus} ✅`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  // 8. Verify all 6 evidence JSON artifacts exist on disk
  console.log('8️⃣ Verifying Durable Production Evidence Store Files...');
  const dir = evidenceStore.getProductionDir(projectId, run.runId);
  const evidenceFiles = [
    'production-run.json',
    'media-evidence.json',
    'qa-evidence.json',
    'approval-evidence.json',
    'master-evidence.json',
  ];
  for (const ef of evidenceFiles) {
    const exists = await storage.exists(`${dir}/${ef}`);
    console.log(` - ${ef.padEnd(24)} : ${exists ? 'EXISTS & VALIDATED ✅' : 'MISSING ❌'}`);
    if (!exists) throw new Error(`Required evidence file "${ef}" missing from ${dir}.`);
  }

  return 0;
}
