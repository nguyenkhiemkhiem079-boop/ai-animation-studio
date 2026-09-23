import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  MediaToolchainDoctor,
  ArtifactVerifier,
  DeterministicOfflineLLMDouble,
  ProductionInvariantValidator,
  ProductionAcceptanceBundle,
} from '../src/index.js';

describe('Phase 21B — Multi-Shot Production Offline Contract Test Suite', () => {
  const testDir = path.resolve('temp_test_phase21_multishot_' + Date.now());
  let storage: FileSystemStorage;
  let assetRegistry: FileSystemAssetRegistry;
  let offlineDouble: DeterministicOfflineLLMDouble;
  let shot1Video: string;
  let shot2Video: string;
  let shot3Video: string;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    assetRegistry = new FileSystemAssetRegistry(storage);
    offlineDouble = new DeterministicOfflineLLMDouble();

    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    shot1Video = path.join(testDir, 'shot_01.mp4');
    shot2Video = path.join(testDir, 'shot_02.mp4');
    shot3Video = path.join(testDir, 'shot_03.mp4');

    // Generate 3 distinct synthetic video files
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=navy:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${shot1Video}"`,
      { stdio: 'ignore' }
    );
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=maroon:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${shot2Video}"`,
      { stdio: 'ignore' }
    );
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=darkgreen:s=320x180:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${shot3Video}"`,
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

  it(
    'orchestrates 3 sequential shots with per-shot QA, per-shot approval, timeline assembly, and offline acceptance',
    async () => {
    const projectId = 'proj_multishot_01';
    const seriesId = 'series_multishot_01';
    const storyScript = `
SCENE 1 - COMMAND DECK - NIGHT
Kaito observes the galaxy map as alarms pulse in amber waves across the console.
He turns to his first officer with a sharp nod.

SCENE 2 - LOWER CORRIDOR - NIGHT
Aeryn sprint down the narrow metal corridor as the blast doors begin to slide shut.
`;

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, offlineDouble);

    // Create 3-shot production run (pilotMode: false, requiredShotCount: 3)
    const run = await orchestrator.createRun({
      projectId,
      seriesId,
      rawScript: storyScript,
      mode: 'PRODUCTION',
      pilotMode: false,
      requiredShotCount: 3,
    });

    expect(run.status).toBe('CREATED');
    expect(run.requiredShotCount).toBe(3);

    // --- SHOT 1 ---
    const step1Run = await orchestrator.execute(projectId, run.runId, { allowRehearsal: true, preferFlowAssisted: true });
    expect(step1Run.status).toBe('NEEDS_USER_ACTION');
    const shot1Id = step1Run.currentShotId!;
    expect(shot1Id).toBeDefined();

    // Import Shot 1
    await orchestrator.importShotMedia(projectId, run.runId, shot1Id, shot1Video, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Offline Rehearsal Shot 1',
    });

    // Approve Shot 1
    await orchestrator.approveShot(projectId, run.runId, shot1Id, 'Test Runner', undefined, {
      approvalType: 'AUTOMATED_TEST',
      actorId: 'test-runner',
      actorDisplayName: 'Automated Test Runner',
      approvalSource: 'test',
      interactive: false,
    });

    // --- SHOT 2 ---
    const step2Run = await orchestrator.execute(projectId, run.runId, { allowRehearsal: true, preferFlowAssisted: true });
    expect(step2Run.status).toBe('NEEDS_USER_ACTION');
    const shot2Id = step2Run.currentShotId!;
    expect(shot2Id).toBeDefined();
    expect(shot2Id).not.toBe(shot1Id);

    // Import Shot 2
    await orchestrator.importShotMedia(projectId, run.runId, shot2Id, shot2Video, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Offline Rehearsal Shot 2',
    });

    // Approve Shot 2
    await orchestrator.approveShot(projectId, run.runId, shot2Id, 'Test Runner', undefined, {
      approvalType: 'AUTOMATED_TEST',
      actorId: 'test-runner',
      actorDisplayName: 'Automated Test Runner',
      approvalSource: 'test',
      interactive: false,
    });

    // --- SHOT 3 ---
    const step3Run = await orchestrator.execute(projectId, run.runId, { allowRehearsal: true, preferFlowAssisted: true });
    expect(step3Run.status).toBe('NEEDS_USER_ACTION');
    const shot3Id = step3Run.currentShotId!;
    expect(shot3Id).toBeDefined();
    expect(shot3Id).not.toBe(shot1Id);
    expect(shot3Id).not.toBe(shot2Id);

    // Import Shot 3
    await orchestrator.importShotMedia(projectId, run.runId, shot3Id, shot3Video, {
      generationSource: 'SIMULATED_FLOW',
      provenance: 'Offline Rehearsal Shot 3',
    });

    // Approve Shot 3
    await orchestrator.approveShot(projectId, run.runId, shot3Id, 'Test Runner', undefined, {
      approvalType: 'AUTOMATED_TEST',
      actorId: 'test-runner',
      actorDisplayName: 'Automated Test Runner',
      approvalSource: 'test',
      interactive: false,
    });

    // --- FINAL ASSEMBLY & MASTER RENDER ---
    const completedRun = await orchestrator.execute(projectId, run.runId, { allowRehearsal: true, preferFlowAssisted: true });

    expect(completedRun.status).toBe('COMPLETED');
    expect(completedRun.completedShotIds).toContain(shot1Id);
    expect(completedRun.completedShotIds).toContain(shot2Id);
    expect(completedRun.completedShotIds).toContain(shot3Id);
    expect(completedRun.completedShotIds.length).toBe(3);

    // Master Evidence assertions
    expect(completedRun.masterEvidence).toBeDefined();
    expect(completedRun.masterEvidence!.verificationStatus).toBe('OFFLINE_REHEARSAL_VERIFIED');
    expect(completedRun.masterEvidence!.verificationStatus).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(completedRun.masterEvidence!.masterSha256).toHaveLength(64);

    // State Invariant Audit
    const invariantCheck = ProductionInvariantValidator.validate(completedRun);
    expect(invariantCheck.valid).toBe(true);

    // Acceptance Bundle Validation
    const acceptanceDir = `.studio/production/${projectId}/${run.runId}/acceptance`;
    const bundleValidation = await ProductionAcceptanceBundle.validate(acceptanceDir, storage);
    expect(bundleValidation.valid).toBe(true);
    expect(bundleValidation.metadata?.verificationStatus).toBe('OFFLINE_REHEARSAL_VERIFIED');
    expect(bundleValidation.metadata?.requiredShotIds).toHaveLength(3);
  }, 30000);
});
