import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import {
  FileSystemStorage,
  ProductionMasterVerifier,
  ProductionReleaseGate,
  ProductionAcceptanceBundle,
  MediaToolchainDoctor,
  ArtifactVerifier,
  ProductionRun,
  ProductionRunSchema,
  MasterProductionEvidence,
} from '../src/index.js';

describe('Phase 24.21 — Reality Check Adversarial Release Suite', () => {
  const testDir = path.resolve('.studio/temp_phase24_reality_check');
  let storage: FileSystemStorage;
  let ffmpegPath: string;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });

  /**
   * Helper to create a valid baseline ProductionRun and physical media fixtures.
   */
  async function createValidProductionBaseline(scenarioDir: string) {
    fs.mkdirSync(scenarioDir, { recursive: true });
    const runId = 'run_reality_check_01';
    const projectId = 'proj_reality_check_01';
    const seriesId = 'series_reality_check_01';
    const shotId = 'SHOT_01';

    // Create physical video files
    const shotVideoPath = path.join(scenarioDir, 'shot_01.mp4');
    const masterVideoPath = path.join(scenarioDir, 'master.mp4');

    execFileSync(
      ffmpegPath,
      ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', shotVideoPath],
      { stdio: 'ignore' }
    );
    execFileSync(
      ffmpegPath,
      ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', masterVideoPath],
      { stdio: 'ignore' }
    );

    const shotVerif = ArtifactVerifier.verify(shotVideoPath, { requireVideoStream: true });
    const masterVerif = ArtifactVerifier.verify(masterVideoPath, { requireVideoStream: true });

    const challengeId = 'chal_01';
    const candidateAssetId = 'asset_candidate_01';

    const run: ProductionRun = {
      schemaVersion: 1,
      revision: 1,
      runId,
      projectId,
      seriesId,
      status: 'COMPLETED',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'completed',
      completedShotIds: [shotId],
      pendingShotIds: [],
      blockedShotIds: [],
      resumeMetadata: { canResume: false },
      mediaEvidence: {
        [shotId]: {
          shotId,
          assetId: candidateAssetId,
          physicalPath: path.resolve(shotVideoPath),
          sha256: shotVerif.checksumSha256!,
          sizeBytes: shotVerif.sizeBytes!,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 160,
          height: 90,
          durationSeconds: 0.5,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Genuine Google Flow assisted operator download',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        [shotId]: {
          shotId,
          reportId: 'rep_01',
          mediaSha256: shotVerif.checksumSha256!,
          candidateAssetId,
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'GEMINI_MULTIMODAL_API',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 1.0, spatial: 1.0, defects: 0.0, overall: 1.0 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
          coverage: {
            identityVisual: 'VERIFIED',
            temporalArtifactVisual: 'VERIFIED',
            semanticAction: 'VERIFIED',
          },
        },
      },
      approvalEvidence: {
        [shotId]: {
          shotId,
          candidateAssetId,
          mediaSha256: shotVerif.checksumSha256!,
          status: 'APPROVED',
          approvalType: 'HUMAN',
          decidedBy: 'operator_human',
          actorDisplayName: 'Human Lead Director',
          interactive: true,
          challengeId,
        },
      },
      approvalChallenges: {
        [challengeId]: {
          challengeId,
          runId,
          projectId,
          shotId,
          candidateAssetId,
          mediaSha256: shotVerif.checksumSha256!,
          nonce: 'nonce_secret_123',
          createdAt: new Date().toISOString(),
          consumedAt: new Date().toISOString(),
          decidedBy: 'operator_human',
        },
      },
      masterEvidence: {
        manifestId: 'man_01',
        sequenceId: 'seq_01',
        masterVideoPath: path.resolve(masterVideoPath),
        masterSha256: masterVerif.checksumSha256!,
        sizeBytes: masterVerif.sizeBytes!,
        durationSeconds: 0.5,
        width: 160,
        height: 90,
        videoCodec: 'h264',
        audioCodec: null,
        fps: 24,
        verifiedAt: new Date().toISOString(),
        verificationStatus: 'MASTER_PRODUCTION_VERIFIED',
        checksSummary: {},
      },
    };

    // Build acceptance bundle
    await ProductionAcceptanceBundle.build({
      projectId,
      runId,
      storage,
      run,
      masterEvidence: run.masterEvidence!,
      requiredShotIds: [shotId],
      providerModelIds: ['gemini-3.6-flash'],
    });

    return {
      run,
      shotVideoPath,
      masterVideoPath,
      shotId,
      shotSha256: shotVerif.checksumSha256!,
      masterSha256: masterVerif.checksumSha256!,
    };
  }

  // ── Vector 1: Gemini Provider is OFFLINE_TEST_DOUBLE
  it('Vector 1: fails closed when Gemini QA provider trust is OFFLINE_TEST_DOUBLE', async () => {
    const scenarioDir = path.join(testDir, 'v1_offline_double');
    const { run } = await createValidProductionBaseline(scenarioDir);

    run.qaEvidence['SHOT_01'].providerTrust = 'OFFLINE_TEST_DOUBLE';
    run.qaEvidence['SHOT_01'].mechanism = 'OFFLINE_TEST_DOUBLE';

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
  });

  // ── Vector 2: Media is SIMULATED_FLOW
  it('Vector 2: fails closed when media generation source is SIMULATED_FLOW', async () => {
    const scenarioDir = path.join(testDir, 'v2_simulated_flow');
    const { run } = await createValidProductionBaseline(scenarioDir);

    run.mediaEvidence['SHOT_01'].generationSource = 'SIMULATED_FLOW';

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('requires GOOGLE_FLOW_REAL'))).toBe(true);
  });

  // ── Vector 3: Media is IMPORTED without genuine Flow provenance
  it('Vector 3: fails closed when media is generic IMPORTED instead of GOOGLE_FLOW_REAL', async () => {
    const scenarioDir = path.join(testDir, 'v3_unverified_imported');
    const { run } = await createValidProductionBaseline(scenarioDir);

    run.mediaEvidence['SHOT_01'].generationSource = 'IMPORTED';

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
  });

  // ── Vector 4: Approval is SYSTEM
  it('Vector 4: fails closed when approvalType is SYSTEM', async () => {
    const scenarioDir = path.join(testDir, 'v4_system_approval');
    const { run } = await createValidProductionBaseline(scenarioDir);

    run.approvalEvidence['SHOT_01'].approvalType = 'SYSTEM';

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Only HUMAN approval satisfies master production truth'))).toBe(true);
  });

  // ── Vector 5: Approval is AUTOMATED_TEST
  it('Vector 5: fails closed when approvalType is AUTOMATED_TEST', async () => {
    const scenarioDir = path.join(testDir, 'v5_automated_test_approval');
    const { run } = await createValidProductionBaseline(scenarioDir);

    run.approvalEvidence['SHOT_01'].approvalType = 'AUTOMATED_TEST';

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
  });

  // ── Vector 6: QA evidence missing
  it('Vector 6: fails closed when QA evidence is missing for a required shot', async () => {
    const scenarioDir = path.join(testDir, 'v6_qa_missing');
    const { run } = await createValidProductionBaseline(scenarioDir);

    delete run.qaEvidence['SHOT_01'];

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('QA evidence missing'))).toBe(true);
  });

  // ── Vector 7: Media checksum changed on disk
  it('Vector 7: fails closed when media file on disk is modified after recording', async () => {
    const scenarioDir = path.join(testDir, 'v7_media_tampered');
    const { run, shotVideoPath } = await createValidProductionBaseline(scenarioDir);

    // Tamper the shot video file on disk
    fs.appendFileSync(shotVideoPath, Buffer.from([0x00, 0xff, 0x00, 0xaa]));

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('SHA-256 mismatch'))).toBe(true);
  });

  // ── Vector 8: Master video checksum changed on disk
  it('Vector 8: fails closed when master video on disk is modified', async () => {
    const scenarioDir = path.join(testDir, 'v8_master_tampered');
    const { run, masterVideoPath } = await createValidProductionBaseline(scenarioDir);

    // Tamper master video
    fs.appendFileSync(masterVideoPath, Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]));

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Master video checksum mismatch'))).toBe(true);
  });

  // ── Vector 9: Evidence tampered in acceptance bundle
  it('Vector 9: fails closed when acceptance manifest or bundle evidence is tampered', async () => {
    const scenarioDir = path.join(testDir, 'v9_bundle_tampered');
    const { run } = await createValidProductionBaseline(scenarioDir);

    const acceptancePath = path.join(testDir, `.studio/production/${run.projectId}/${run.runId}/acceptance/master-evidence.json`);
    fs.writeFileSync(acceptancePath, JSON.stringify({ tampered: true }), 'utf-8');

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Acceptance bundle validation failed'))).toBe(true);
  });

  // ── Vector 10: Required shot missing from media evidence
  it('Vector 10: fails closed when a required shot is missing authoritative media', async () => {
    const scenarioDir = path.join(testDir, 'v10_shot_missing');
    const { run } = await createValidProductionBaseline(scenarioDir);

    run.completedShotIds = ['SHOT_01', 'SHOT_02']; // SHOT_02 has no media

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('SHOT_02'))).toBe(true);
  });

  // ── Vector 11: Operator challenge stale or unconsumed
  it('Vector 11: fails closed when operator approval challenge was not consumed', async () => {
    const scenarioDir = path.join(testDir, 'v11_stale_challenge');
    const { run } = await createValidProductionBaseline(scenarioDir);

    // Make challenge unconsumed
    run.approvalChallenges!['chal_01'].consumedAt = null;

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('no valid consumed challenge ceremony'))).toBe(true);
  });

  // ── Vector 12: Production leak detected (fixture / test path)
  it('Vector 12: fails closed when media originates from a test or fixture directory', async () => {
    const scenarioDir = path.join(testDir, 'v12_leak');
    const { run } = await createValidProductionBaseline(scenarioDir);

    run.mediaEvidence['SHOT_01'].physicalPath = 'C:/projects/ai-animation-studio/fixtures/test_video.mp4';

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).not.toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(false);
    expect(gate.reasons.some((r) => r.includes('leaks from a test, fixture, or smoke directory'))).toBe(true);
  });

  // ── Control: Positive verification when all conditions hold
  it('Control: derives MASTER_PRODUCTION_VERIFIED when and only when all production conditions are genuinely satisfied', async () => {
    const scenarioDir = path.join(testDir, 'control_valid');
    const { run } = await createValidProductionBaseline(scenarioDir);

    // Save run to storage so acceptance bundle matches
    const runPath = `.studio/production/${run.projectId}/${run.runId}/production-run.json`;
    await storage.writeJson(runPath, run);

    const gate = await ProductionReleaseGate.evaluate({ run, storage });
    expect(gate.status).toBe('MASTER_PRODUCTION_VERIFIED');
    expect(gate.isVerified).toBe(true);
    expect(gate.reasons).toHaveLength(0);
    expect(gate.blockers).toHaveLength(0);
  });
});
