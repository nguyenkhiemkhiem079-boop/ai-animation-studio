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
  ProductionAcceptanceBundle,
  ProductionMasterVerifier,
  ProductionSafetyError,
  ProductionRun,
  ShotContract,
  ArtifactVerifier,
  DeterministicOfflineLLMDouble,
  ProductionInvariantValidator,
  ProductionInvalidationEngine,
} from '../src/index.js';

describe('Phase 19.1 — Hostile QA Adversarial Production Audit (30 Vectors)', () => {
  const testDir = path.resolve('.studio', 'content', 'phase19-adversarial-audit');
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
    id: 'SHOT_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'action',
    complexity: 'complex_generative_video',
    rendererIntent: 'generative_full_video',
    frame: { durationSeconds: 3.0, targetFps: 24, aspectRatio: '16:9' },
    camera: {
      focalLength: '35mm',
      shotSize: 'medium',
      angle: 'eye_level',
      movement: 'static',
      semanticSkills: [],
    },
    lighting: {
      keyLightDirection: 'left',
      mood: 'noir_suspense',
      colorTemperature: 'cool',
      fogAtmosphere: false,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: { foreground: [], midground: [], background: [] },
    },
    acting: [
      {
        characterId: 'char_kaito',
        pose: 'combat_ready',
        expression: 'focused',
        gazeDirection: 'screen_right',
        actionPrompt: 'Kaito charges forward with kinetic intensity.',
      },
    ],
    transition: { type: 'cut', durationSeconds: 0 },
    environmentLocationId: 'loc_cyber_alley',
    audioCue: { sfx: ['ambient'] },
    requiredAssetIds: ['ASSET_CHAR_KAITO'],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: false,
      isFramingLocked: false,
      isRendererLocked: false,
      isActingLocked: false,
    },
    provenance: { decidedAt: new Date().toISOString() },
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

  async function createRun(projectId: string, runId: string): Promise<{ orchestrator: ProductionOrchestrator; run: ProductionRun }> {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, new DeterministicOfflineLLMDouble());
    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_adv',
      rawScript: 'EXT. NEO TOKYO - NIGHT\nKaito acts.',
      mode: 'PRODUCTION',
      pilotMode: true,
      requiredShotCount: 1,
      targetRunId: runId,
    });
    run.status = 'WAITING_FOR_IMPORT';
    await storage.writeJson(`.studio/production/${projectId}/${runId}/production-run.json`, run);
    return { orchestrator, run };
  }

  // 1. Fake GOOGLE_FLOW_REAL through filename alone
  it('Vector 1: rejects fake GOOGLE_FLOW_REAL when only filename contains Flow keywords without operator flag', async () => {
    const { orchestrator, run } = await createRun('p1', 'r1');
    const namedMp4 = path.join(testDir, 'SHOT_01_FLOW_REAL_GENUINE.mp4');
    fs.copyFileSync(realShotVideo, namedMp4);

    const updated = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', namedMp4, {
      generationSource: 'IMPORTED', // without explicit flag
    });

    expect(updated.mediaEvidence['SHOT_01'].generationSource).toBe('IMPORTED');
    expect(updated.mediaEvidence['SHOT_01'].generationSource).not.toBe('GOOGLE_FLOW_REAL');
  });

  // 2. Fake GOOGLE_FLOW_REAL without --real-external
  it('Vector 2: throws ProductionSafetyError if GOOGLE_FLOW_REAL requested with realExternal=false', async () => {
    const { orchestrator, run } = await createRun('p2', 'r2');
    await expect(
      orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
        generationSource: 'GOOGLE_FLOW_REAL',
        realExternal: false,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 3. Import corrupt MP4
  it('Vector 3: rejects corrupted non-video file during media import', async () => {
    const { orchestrator, run } = await createRun('p3', 'r3');
    const badMp4 = path.join(testDir, 'corrupt.mp4');
    fs.writeFileSync(badMp4, 'GARBAGE NOT AN MP4 HEADER');

    await expect(
      orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', badMp4, {
        generationSource: 'GOOGLE_FLOW_REAL',
        realExternal: true,
      })
    ).rejects.toThrow();
  });

  // 4. Import zero-byte file
  it('Vector 4: rejects zero-byte file during media import', async () => {
    const { orchestrator, run } = await createRun('p4', 'r4');
    const emptyMp4 = path.join(testDir, 'empty.mp4');
    fs.writeFileSync(emptyMp4, Buffer.alloc(0));

    await expect(
      orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', emptyMp4, {
        generationSource: 'GOOGLE_FLOW_REAL',
        realExternal: true,
      })
    ).rejects.toThrow();
  });

  // 5. Replace file after SHA recorded
  it('Vector 5: detects disk file replacement and fails master verifier due to checksum mismatch', async () => {
    const { orchestrator, run } = await createRun('p5', 'r5');
    const importTarget = path.join(testDir, 'tamper_target.mp4');
    fs.copyFileSync(realShotVideo, importTarget);

    const imported = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', importTarget, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    // Tamper disk file directly
    fs.copyFileSync(realShotVideo2, importTarget);

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run: imported,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_tamper',
        sequenceId: 'seq_tamper',
        shotVideoMap: { SHOT_01: importTarget },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 6. Reuse old QA after media replacement
  it('Vector 6: invalidates and clears QA report when new media is imported for a shot', async () => {
    const { orchestrator, run } = await createRun('p6', 'r6');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const replaced = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo2, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    expect(replaced.qaEvidence['SHOT_01'].mediaSha256).toBe(realSha256_2);
    expect(replaced.qaEvidence['SHOT_01'].mediaSha256).not.toBe(realSha256);
  });

  // 7. Reuse approval after media replacement
  it('Vector 7: invalidates and deletes approval record when media is replaced', async () => {
    const { orchestrator, run } = await createRun('p7', 'r7');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');
    await orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
      approvalType: 'HUMAN',
      interactive: true,
      challengeId: challenge.challengeId,
      challengeNonce: challenge.nonce,
    });

    // Replace media
    const replaced = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo2, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    expect(replaced.approvalEvidence['SHOT_01']).toBeUndefined();
    expect(replaced.completedShotIds).not.toContain('SHOT_01');
  });

  // 8. Reuse approval challenge
  it('Vector 8: rejects reused approval challenge after single use', async () => {
    const { orchestrator, run } = await createRun('p8', 'r8');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');
    await orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
      approvalType: 'HUMAN',
      interactive: true,
      challengeId: challenge.challengeId,
      challengeNonce: challenge.nonce,
    });

    // Reuse challenge
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 9. Use challenge from another shot
  it('Vector 9: rejects approval challenge issued for a different shot', async () => {
    const { orchestrator, run } = await createRun('p9', 'r9');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Attempt to use for SHOT_02
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_02', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 10. Use challenge from another run
  it('Vector 10: rejects approval challenge issued for a different run', async () => {
    const { orchestrator: orchA, run: runA } = await createRun('p10', 'runA');
    const { orchestrator: orchB, run: runB } = await createRun('p10', 'runB');

    await orchA.importShotMedia(runA.projectId, runA.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });
    await orchB.importShotMedia(runB.projectId, runB.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challengeA = await orchA.issueApprovalChallenge(runA.projectId, runA.runId, 'SHOT_01', 'APPROVE');

    // Attempt to use challenge from runA in runB
    await expect(
      orchB.approveShot(runB.projectId, runB.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challengeA.challengeId,
        challengeNonce: challengeA.nonce,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 11. Use wrong nonce
  it('Vector 11: rejects challenge with incorrect nonce', async () => {
    const { orchestrator, run } = await createRun('p11', 'r11');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: 'INCORRECT_NONCE_VALUE',
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 12. Use expired challenge
  it('Vector 12: rejects approval challenge past TTL expiration', async () => {
    const { orchestrator, run } = await createRun('p12', 'r12');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    // Issue challenge with negative TTL (already expired)
    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE', -10);

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 13. Replace QA after challenge issuance
  it('Vector 13: rejects approval if QA report ID changed after challenge issuance', async () => {
    const { orchestrator, run } = await createRun('p13', 'r13');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Re-evaluate or mutate QA reportId
    const loadedRun = (await storage.readJson(`.studio/production/${run.projectId}/${run.runId}/production-run.json`)) as ProductionRun;
    loadedRun.qaEvidence['SHOT_01'].reportId = 'vis_qa_NEW_REPORT_999';
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/production-run.json`, loadedRun);

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 14. Approve without QA
  it('Vector 14: blocks issuing approval challenge if shot has not undergone Visual QA', async () => {
    const { orchestrator, run } = await createRun('p14', 'r14');
    // Media imported without QA or QA manually missing
    run.mediaEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      assetId: 'ASSET_01',
      physicalPath: realShotVideo,
      sha256: realSha256,
      sizeBytes: 100,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: null,
      width: 320,
      height: 180,
      durationSeconds: 1.0,
      fps: 24,
      verificationTimestamp: new Date().toISOString(),
      provenance: 'Flow',
      generationSource: 'GOOGLE_FLOW_REAL',
      approvalStatus: 'PENDING',
    };
    run.qaEvidence = {}; // No QA!
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/production-run.json`, run);

    await expect(
      orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE')
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 15. Approve failed QA
  it('Vector 15: blocks issuing approval challenge when Visual QA status is FAILED', async () => {
    const { orchestrator, run } = await createRun('p15', 'r15');
    run.qaEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      reportId: 'rep_fail',
      mediaSha256: realSha256,
      candidateAssetId: 'ASSET_01',
      overallStatus: 'FAIL',
      passed: false,
      mechanism: 'MULTIMODAL_PROVIDER',
      providerTrust: 'LIVE_EXTERNAL',
      isSynthetic: false,
      scores: { identity: 0.2, spatial: 0.2, defects: 0.2, overall: 0.2 },
      totalDefects: 3,
      criticalDefects: 1,
      retakesRecommended: 1,
      evaluatedAt: new Date().toISOString(),
    };
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/production-run.json`, run);

    await expect(
      orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE')
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 16. Set interactive=true without challenge
  it('Vector 16: rejects setting approvalType=HUMAN without supplying challengeId and nonce', async () => {
    const { orchestrator, run } = await createRun('p16', 'r16');
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 17. AUTOMATED_TEST masquerading as HUMAN
  it('Vector 17: ensures AUTOMATED_TEST cannot satisfy production master verifier', () => {
    const run: ProductionRun = {
      runId: 'r17',
      projectId: 'p17',
      seriesId: 's17',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'AUTOMATED_TEST', // Attack!
          interactive: false,
          decidedBy: 'Bot',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_17',
        sequenceId: 'seq_17',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 18. Synthetic QA satisfying production verifier
  it('Vector 18: rejects synthetic or offline test double QA in production master verifier', () => {
    const run: ProductionRun = {
      runId: 'r18',
      projectId: 'p18',
      seriesId: 's18',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'OFFLINE_TEST_DOUBLE',
          providerTrust: 'OFFLINE_TEST_DOUBLE', // Synthetic!
          isSynthetic: true,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_18',
        sequenceId: 'seq_18',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 19. SIMULATED_FLOW satisfying production verifier
  it('Vector 19: rejects SIMULATED_FLOW provenance from satisfying master verification', () => {
    const run: ProductionRun = {
      runId: 'r19',
      projectId: 'p19',
      seriesId: 's19',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Simulated',
          generationSource: 'SIMULATED_FLOW', // Synthetic!
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_19',
        sequenceId: 'seq_19',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 20. Mock provider satisfying production verifier
  it('Vector 20: rejects mock provider trust in master verifier', () => {
    const run: ProductionRun = {
      runId: 'r20',
      projectId: 'p20',
      seriesId: 's20',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Mock',
          generationSource: 'MOCK',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MOCK',
          providerTrust: 'MOCK',
          isSynthetic: true,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_20',
        sequenceId: 'seq_20',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 21. Stale timeline referencing old media
  it('Vector 21: rejects master verification if timeline maps to media different from approved media SHA', () => {
    const run: ProductionRun = {
      runId: 'r21',
      projectId: 'p21',
      seriesId: 's21',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    // Stale timeline points to realShotVideo2 instead of realShotVideo!
    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_21',
        sequenceId: 'seq_21',
        shotVideoMap: { SHOT_01: realShotVideo2 }, // Wrong media!
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 22. Acceptance bundle missing evidence
  it('Vector 22: fails validation when an essential evidence file is deleted from acceptance bundle', async () => {
    const { run } = await createRun('p22', 'r22');
    const masterEv = {
      manifestId: 'man_22',
      sequenceId: 'seq_22',
      masterVideoPath: realMasterVideo,
      masterSha256,
      sizeBytes: 100,
      durationSeconds: 1.0,
      width: 320,
      height: 180,
      videoCodec: 'h264',
      audioCodec: null,
      fps: 24,
      verifiedAt: new Date().toISOString(),
      verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED' as const,
      checksSummary: {},
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: 'p22',
      runId: 'r22',
      storage,
      run,
      masterEvidence: masterEv,
      requiredShotIds: ['SHOT_01'],
    });

    // Delete qa-evidence.json
    await storage.delete(`${bundle.acceptanceDir}/qa-evidence.json`);

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('is missing'))).toBe(true);
  });

  // 23. Modified acceptance evidence after manifest creation
  it('Vector 23: detects modified evidence content and fails checksum verification', async () => {
    const { run } = await createRun('p23', 'r23');
    const masterEv = {
      manifestId: 'man_23',
      sequenceId: 'seq_23',
      masterVideoPath: realMasterVideo,
      masterSha256,
      sizeBytes: 100,
      durationSeconds: 1.0,
      width: 320,
      height: 180,
      videoCodec: 'h264',
      audioCodec: null,
      fps: 24,
      verifiedAt: new Date().toISOString(),
      verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED' as const,
      checksSummary: {},
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: 'p23',
      runId: 'r23',
      storage,
      run,
      masterEvidence: masterEv,
      requiredShotIds: ['SHOT_01'],
    });

    // Modify approval-evidence.json
    await storage.write(`${bundle.acceptanceDir}/approval-evidence.json`, '{"hacked": true}');

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('checksum mismatch'))).toBe(true);
  });

  // 24. Missing master video
  it('Vector 24: rejects master verification if master video file does not exist on disk', () => {
    const run: ProductionRun = {
      runId: 'r24',
      projectId: 'p24',
      seriesId: 's24',
      status: 'MASTER_QA',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'master_qa',
      completedShotIds: ['SHOT_01'],
      pendingShotIds: [],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: path.join(testDir, 'nonexistent_master.mp4'),
        manifestId: 'man_24',
        sequenceId: 'seq_24',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 25. Modified master video
  it('Vector 25: detects altered master video file where SHA differs from recorded checksum', () => {
    const run: ProductionRun = {
      runId: 'r25',
      projectId: 'p25',
      seriesId: 's25',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
      masterEvidence: {
        manifestId: 'man_25',
        sequenceId: 'seq_25',
        masterVideoPath: realMasterVideo,
        masterSha256: '0000000000000000000000000000000000000000000000000000000000000000', // False SHA!
        sizeBytes: 100,
        durationSeconds: 1.0,
        width: 320,
        height: 180,
        videoCodec: 'h264',
        audioCodec: null,
        fps: 24,
        verifiedAt: new Date().toISOString(),
        verificationStatus: 'MASTER_PRODUCTION_VERIFIED',
        checksSummary: {},
      },
    };

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_25',
        sequenceId: 'seq_25',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 26. Duplicate required shots
  it('Vector 26: handles duplicate shot IDs safely in verification without duplicating records', () => {
    const run: ProductionRun = {
      runId: 'r26',
      projectId: 'p26',
      seriesId: 's26',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01', 'SHOT_01'], // Duplicated input
      masterVideoPath: realMasterVideo,
      manifestId: 'man_26',
      sequenceId: 'seq_26',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true },
      allowRehearsal: true,
    });

    expect(result.status).toBe('OFFLINE_REHEARSAL_VERIFIED');
  });

  // 27. Unexpected extra required shots
  it('Vector 27: fails verification if required shots list contains shot with missing media', () => {
    const run: ProductionRun = {
      runId: 'r27',
      projectId: 'p27',
      seriesId: 's27',
      status: 'MASTER_QA',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'master_qa',
      completedShotIds: ['SHOT_01'],
      pendingShotIds: [],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01', 'SHOT_MISSING_EXTRA'],
      masterVideoPath: realMasterVideo,
      manifestId: 'man_27',
      sequenceId: 'seq_27',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true },
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('SHOT_MISSING_EXTRA'))).toBe(true);
  });

  // 28. Incomplete semantic QA coverage
  it('Vector 28: fails verification if QA coverage is missing or indicates artifact integrity failure', () => {
    const run: ProductionRun = {
      runId: 'r28',
      projectId: 'p28',
      seriesId: 's28',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_28',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'FAIL',
          passed: false, // Incomplete / failed!
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.5, spatial: 0.5, defects: 0.5, overall: 0.5 },
          totalDefects: 2,
          criticalDefects: 1,
          retakesRecommended: 1,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_28',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'man_28',
        sequenceId: 'seq_28',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 29. Critical defect with overall pass
  it('Vector 29: invariant validator catches critical defect lurking inside passed QA and rejects it', () => {
    const run: ProductionRun = {
      runId: 'r29',
      projectId: 'p29',
      seriesId: 's29',
      status: 'COMPLETED',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'completed',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_29',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 1,
          criticalDefects: 1,
          retakesRecommended: 1, // Pending retake!
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_29',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
    };

    const invariantCheck = ProductionInvariantValidator.validate(run);
    expect(invariantCheck.valid).toBe(false);
    expect(invariantCheck.violations.some((v) => v.includes('pending retakes'))).toBe(true);
  });

  // 30. Pending retake with apparent completed state
  it('Vector 30: invalidation engine clears completion and master deliverables upon retake triggering', () => {
    const run: ProductionRun = {
      runId: 'r30',
      projectId: 'p30',
      seriesId: 's30',
      status: 'COMPLETED',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'completed',
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
          sizeBytes: 100,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Flow',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_30',
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'MULTIMODAL_PROVIDER',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_30',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          interactive: true,
          decidedBy: 'Director',
          decidedAt: new Date().toISOString(),
        },
      },
      approvalChallenges: {},
      resumeMetadata: { canResume: true },
      masterEvidence: {
        manifestId: 'man_30',
        sequenceId: 'seq_30',
        masterVideoPath: realMasterVideo,
        masterSha256,
        sizeBytes: 100,
        durationSeconds: 1.0,
        width: 320,
        height: 180,
        videoCodec: 'h264',
        audioCodec: null,
        fps: 24,
        verifiedAt: new Date().toISOString(),
        verificationStatus: 'MASTER_PRODUCTION_VERIFIED',
        checksSummary: {},
      },
    };

    // Trigger invalidation for shot SHOT_01
    const report = ProductionInvalidationEngine.invalidateOnMediaChange(run, 'SHOT_01', 'Retake requested');

    expect(report.invalidatedQA).toBe(true);
    expect(report.invalidatedApproval).toBe(true);
    expect(report.invalidatedMaster).toBe(true);
    expect(run.completedShotIds).not.toContain('SHOT_01');
    expect(run.pendingShotIds).toContain('SHOT_01');
    expect(run.masterEvidence).toBeUndefined();
  });
});
