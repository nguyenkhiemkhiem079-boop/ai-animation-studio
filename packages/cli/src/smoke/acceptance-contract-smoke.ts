import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  EvidenceStore,
  MediaToolchainDoctor,
  LiveProviderPreflight,
  DeterministicOfflineLLMDouble,
  MockLLMProvider,
  ProductionAcceptanceBundle,
  ProductionMasterVerifier,
  ProductionSafetyError,
  createTrustedHumanConfirmation,
} from '@ai-studio/core';

export async function runAcceptanceContractSmoke(): Promise<number> {
  console.log('🎬 Running Phase 18.2 Production Acceptance Contract Smoke Test (Offline & Deterministic)...');

  const cwd = process.cwd();
  const storage = new FileSystemStorage(cwd);
  const assetRegistry = new FileSystemAssetRegistry(storage);
  const evidenceStore = new EvidenceStore(storage);

  const projectId = 'proj_accept_smoke';
  const seriesId = 'series_accept_smoke';
  const runId = `run_accept_smoke_${Date.now()}`;
  const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();

  // CONTRACT 1: Live Provider Preflight Rejects Offline Doubles & Mocks
  console.log('\n1️⃣ Contract 1: Live Provider Preflight Rejects Offline Doubles & Mocks...');
  const offlineDouble = new DeterministicOfflineLLMDouble();
  const preflightDouble = await LiveProviderPreflight.verify({
    provider: offlineDouble,
    requireLiveOptIn: false,
  });
  if (preflightDouble.passed) {
    throw new Error('Contract Violation: OfflineLLMDouble must NOT pass live provider preflight.');
  }
  console.log(` - OfflineLLMDouble rejected: "${preflightDouble.reasons[0]}" ✅`);

  const mockProvider = new MockLLMProvider();
  const preflightMock = await LiveProviderPreflight.verify({
    provider: mockProvider,
    requireLiveOptIn: false,
  });
  if (preflightMock.passed) {
    throw new Error('Contract Violation: MockLLMProvider must NOT pass live provider preflight.');
  }
  console.log(` - MockLLMProvider rejected: "${preflightMock.reasons[0]}" ✅`);

  // CONTRACT 2: Create ProductionRun in PRODUCTION Mode
  console.log('\n2️⃣ Contract 2: Creating ProductionRun Entity in PRODUCTION Mode...');
  const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);
  const run = await orchestrator.createRun({
    projectId,
    seriesId,
    rawScript: 'SCENE 1 - LAB - DAY\nA researcher verifies the final production master.',
    mode: 'PRODUCTION',
    targetRunId: runId,
  });
  run.status = 'WAITING_FOR_IMPORT';
  await orchestrator['repository'].save(run);
  console.log(` - Created Run: ${run.runId} (mode: ${run.mode}) ✅`);

  // Create real test media
  const testDir = path.resolve('.studio', 'production', projectId, runId, 'test_media');
  fs.mkdirSync(testDir, { recursive: true });
  const realVideoPath = path.join(testDir, 'shot_01_real.mp4');

  execSync(
    `"${ffmpegPath}" -y -f lavfi -i color=c=green:s=640x360:d=1.5:r=24 -c:v libx264 -pix_fmt yuv420p "${realVideoPath}"`,
    { stdio: 'ignore' }
  );

  // CONTRACT 3: Real Flow Media Import Requires Explicit --real-external
  console.log('\n3️⃣ Contract 3: Real Flow Media Import Provenance Segregation...');
  let unconfirmedFailed = false;
  try {
    await orchestrator.importShotMedia(projectId, runId, 'SHOT_01', realVideoPath, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: false, // Missing operator confirmation
    });
  } catch (err: any) {
    unconfirmedFailed = true;
    console.log(` - Missing confirmation correctly rejected: ${err.message} ✅`);
  }
  if (!unconfirmedFailed) {
    throw new Error('Contract Violation: GOOGLE_FLOW_REAL without realExternal confirmation must fail.');
  }

  // Import with explicit operator confirmation
  const importedRun = await orchestrator.importShotMedia(projectId, runId, 'SHOT_01', realVideoPath, {
    generationSource: 'GOOGLE_FLOW_REAL',
    realExternal: true,
    provenance: 'Google Flow — Real External Generation (Operator Verified)',
  });

  const media = importedRun.mediaEvidence['SHOT_01'];
  if (!media || media.generationSource !== 'GOOGLE_FLOW_REAL') {
    throw new Error('Contract Violation: Imported media did not record GOOGLE_FLOW_REAL.');
  }
  console.log(` - Real Flow Media Imported: SHA-256=${media.sha256.substring(0, 16)}... Source=${media.generationSource} ✅`);

  // CONTRACT 4: Human Approval Checksum Binding & Anti-Spoofing
  console.log('\n4️⃣ Contract 4: Human Approval Checksum Binding & Anti-Spoofing...');
  let spoofBlocked = false;
  try {
    await orchestrator.approveShot(projectId, runId, 'SHOT_01', 'Director', undefined, {
      approvalType: 'HUMAN',
      interactive: false,
      confirmedByOperator: true, // Attempted unconfirmed HUMAN approval with untrusted boolean alone
    });
  } catch (err: any) {
    spoofBlocked = true;
    console.log(` - Scripted unconfirmed HUMAN approval blocked: ${err.message} ✅`);
  }
  if (!spoofBlocked) {
    throw new Error('Contract Violation: Scripted unconfirmed HUMAN approval must be blocked.');
  }

  // Trusted human approval
  const confirmation = createTrustedHumanConfirmation({
    confirmedBy: 'Director',
    statement: 'APPROVE',
  });
  const approvedRun = await orchestrator.approveShot(projectId, runId, 'SHOT_01', 'Director', undefined, {
    approvalType: 'HUMAN',
    confirmation,
    interactive: true,
    actorDisplayName: 'Lead Director (Smoke Operator)',
  });

  const approval = approvedRun.approvalEvidence['SHOT_01'];
  if (!approval || approval.mediaSha256 !== media.sha256 || approval.approvalType !== 'HUMAN') {
    throw new Error('Contract Violation: Approval record not correctly bound to media SHA-256.');
  }
  console.log(` - Human Approval Bound: mediaSha256=${approval.mediaSha256.substring(0, 16)}... Type=${approval.approvalType} ✅`);

  // CONTRACT 5: Invalidation If Media Changes After Approval
  console.log('\n5️⃣ Contract 5: Invalidation If Media Changes After Approval...');
  // Simulate modifying the disk file
  const tamperedPath = path.join(testDir, 'shot_01_tampered.mp4');
  execSync(
    `"${ffmpegPath}" -y -f lavfi -i color=c=red:s=640x360:d=1.5:r=24 -c:v libx264 -pix_fmt yuv420p "${tamperedPath}"`,
    { stdio: 'ignore' }
  );

  const tamperedRun = JSON.parse(JSON.stringify(approvedRun));
  tamperedRun.mediaEvidence['SHOT_01'].physicalPath = tamperedPath; // Pointing to modified file

  const tamperedResult = ProductionMasterVerifier.verify({
    run: tamperedRun,
    requiredShotIds: ['SHOT_01'],
    masterVideoPath: realVideoPath,
    manifestId: 'manifest_test',
    sequenceId: 'seq_test',
    shotVideoMap: { SHOT_01: realVideoPath },
    continuityReport: { overallPassed: true, issues: [] },
  });

  if (tamperedResult.passed || tamperedResult.checksSummary.approvalChecksumMatchesMedia !== false) {
    throw new Error('Contract Violation: Modified media must invalidate approval and fail master gate.');
  }
  console.log(` - Invalidation verified: ${tamperedResult.reasons[0]} ✅`);

  // CONTRACT 6: Acceptance Bundle Builder & Manifest Validation
  console.log('\n6️⃣ Contract 6: Acceptance Bundle Builder & Manifest Cryptographic Integrity...');
  const masterEv: any = {
    manifestId: 'manifest_accept_smoke',
    sequenceId: 'seq_accept_smoke',
    masterVideoPath: realVideoPath,
    masterSha256: media.sha256,
    sizeBytes: media.sizeBytes,
    durationSeconds: 1.5,
    width: 640,
    height: 360,
    videoCodec: 'h264',
    audioCodec: null,
    fps: 24,
    verifiedAt: new Date().toISOString(),
    verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED',
    checksSummary: { allPassed: true },
  };

  const { acceptanceDir, manifest } = await ProductionAcceptanceBundle.build({
    projectId,
    runId,
    storage,
    run: approvedRun,
    masterEvidence: masterEv,
    requiredShotIds: ['SHOT_01'],
  });

  console.log(` - Acceptance Bundle Created at: ${acceptanceDir}`);
  console.log(` - Manifest Files Count: ${Object.keys(manifest.files).length} files`);
  console.log(` - Manifest SHA-256: ${manifest.manifestSha256?.substring(0, 16)}...`);

  // Validate bundle
  const validation = await ProductionAcceptanceBundle.validate(acceptanceDir, storage);
  if (!validation.valid) {
    throw new Error(`Contract Violation: Valid acceptance bundle failed validation: ${validation.reasons.join(', ')}`);
  }
  console.log(` - Acceptance Bundle Validation: PASSED ✅`);

  // Tamper with an evidence file and verify failure
  const tamperedEvPath = `${acceptanceDir}/media-evidence.json`;
  await storage.write(tamperedEvPath, JSON.stringify({ tampered: true }));
  const tamperedValidation = await ProductionAcceptanceBundle.validate(acceptanceDir, storage);
  if (tamperedValidation.valid) {
    throw new Error('Contract Violation: Tampered acceptance bundle file must fail manifest validation.');
  }
  console.log(` - Tamper Detection Verified: "${tamperedValidation.reasons[0]}" ✅`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 PHASE 18.2 ACCEPTANCE CONTRACT SMOKE PASSED (All 6 Contracts Verified Offline)!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return 0;
}
