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
  FlowOperatorHandoffBuilder,
  ProductionNextActionResolver,
  DeterministicOfflineLLMDouble,
  ProductionError,
  ProductionRunStatus,
  LLMProvider,
} from '../src/index.js';

describe('Phase 19 — Real Production Operator Workflow & Truth Closure Test Suite', () => {
  const testDir = path.resolve('.studio', 'content', 'phase19-pilot-workflow');
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
    purpose: 'establishing',
    complexity: 'complex_generative_video',
    rendererIntent: 'generative_full_video',
    frame: { durationSeconds: 3.5, targetFps: 24, aspectRatio: '16:9' },
    camera: {
      focalLength: '35mm',
      shotSize: 'wide',
      angle: 'eye_level',
      movement: 'push_in',
      semanticSkills: ['pushin'],
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
        pose: 'standing_watchful',
        expression: 'serious',
        gazeDirection: 'screen_right',
        actionPrompt: 'Kaito observes the digital rain falling across Neo Tokyo.',
      },
    ],
    transition: { type: 'cut', durationSeconds: 0 },
    environmentLocationId: 'loc_cyber_alley',
    audioCue: { sfx: ['rain_ambient'] },
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

  const shotContract2: ShotContract = {
    ...baseShotContract,
    id: 'SHOT_02',
    shotNumber: 2,
    purpose: 'action',
    acting: [
      {
        characterId: 'char_elena',
        pose: 'combat_ready',
        expression: 'focused',
        gazeDirection: 'screen_left',
        actionPrompt: 'Elena raises shield defensively.',
      },
    ],
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

  async function createTestPilotRun(options?: {
    projectId?: string;
    runId?: string;
    pilotMode?: boolean;
    requiredShotCount?: number;
    initialStatus?: ProductionRunStatus;
    llm?: LLMProvider;
  }): Promise<{ orchestrator: ProductionOrchestrator; run: ProductionRun }> {
    const projectId = options?.projectId ?? 'proj_pilot_p19';
    const runId = options?.runId ?? `run_pilot_${Date.now()}`;
    const llm = options?.llm ?? new DeterministicOfflineLLMDouble();
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, llm);

    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_pilot_p19',
      rawScript: 'EXT. NEO TOKYO - NIGHT\nKaito watches rain.\nElena draws her weapon.',
      mode: 'PRODUCTION',
      pilotMode: options?.pilotMode ?? true,
      requiredShotCount: options?.requiredShotCount ?? 1,
      targetRunId: runId,
    });

    const status = options?.initialStatus ?? 'WAITING_FOR_IMPORT';
    if (status !== 'CREATED') {
      run.status = status;
      await storage.writeJson(`.studio/production/${projectId}/${runId}/production-run.json`, run);
    }

    return { orchestrator, run };
  }

  // 1. One-shot pilot initialization
  it('1. initializes one-shot pilot with pilotMode=true and requiredShotCount=1', async () => {
    const { run } = await createTestPilotRun({ pilotMode: true, requiredShotCount: 1, initialStatus: 'CREATED' });
    expect(run.pilotMode).toBe(true);
    expect(run.requiredShotCount).toBe(1);
    expect(run.status).toBe('CREATED');
  });

  // 2. Exactly one required shot selected
  it('2. selects exactly one planned shot during pilot execution', async () => {
    const { orchestrator, run } = await createTestPilotRun({ initialStatus: 'CREATED' });
    // Simulate executed story analysis
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/story_analysis.json`, {
      sceneCandidates: [
        {
          id: 'SCENE_01',
          sceneNumber: 1,
          heading: 'EXT. NEO TOKYO - NIGHT',
          timeOfDay: 'night',
          locationName: 'Neo Tokyo Alley',
          charactersPresent: ['char_kaito'],
          beats: [
            {
              id: 'BEAT_01',
              index: 0,
              summary: 'Kaito watches the digital rain.',
              involvedCharacterIds: ['char_kaito'],
              sourceTrace: { documentId: `doc_${run.projectId}_${run.runId}`, startOffset: 0, endOffset: 50 },
            },
          ],
          dialogueLines: [],
          narrationLines: [],
          sourceTrace: [{ documentId: `doc_${run.projectId}_${run.runId}`, startOffset: 0, endOffset: 50 }],
        },
      ],
    });

    const executed = await orchestrator.execute(run.projectId, run.runId);
    expect(executed.status).toBe('NEEDS_USER_ACTION');
    // Check saved planned shots
    const planned = await storage.readJson<ShotContract[]>(
      `.studio/production/${run.projectId}/${run.runId}/planned_shots.json`
    );
    expect(planned.length).toBe(1);
    expect(executed.pendingShotIds.length).toBe(0); // blocked on external flow
    expect(executed.blockedShotIds).toContain(planned[0].id);
  });

  // 3. Flow handoff package generation
  it('3. generates Flow handoff package in .studio/production/<projectId>/<runId>/handoff/<shotId>/', async () => {
    const handoffBuilder = new FlowOperatorHandoffBuilder();
    const result = await handoffBuilder.buildHandoff({
      projectId: 'proj_pilot_handoff',
      runId: 'run_pilot_handoff',
      seriesId: 'series_p19',
      shot: baseShotContract,
      outputBaseDir: path.join(testDir, 'handoff_out', 'SHOT_01'),
    });

    expect(fs.existsSync(result.handoffDir)).toBe(true);
    expect(fs.existsSync(path.join(result.handoffDir, 'shot-contract.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.handoffDir, 'flow-prompt.txt'))).toBe(true);
    expect(fs.existsSync(path.join(result.handoffDir, 'operator-instructions.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.handoffDir, 'references.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.handoffDir, 'continuity-context.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.handoffDir, 'handoff-manifest.json'))).toBe(true);
    expect(result.expectedFilename).toBe('SHOT_01_FLOW_REAL.mp4');
  });

  // 4. Handoff manifest consistency
  it('4. verifies handoff manifest consistency and SHA-256 self-integrity', async () => {
    const handoffBuilder = new FlowOperatorHandoffBuilder();
    const result = await handoffBuilder.buildHandoff({
      projectId: 'proj_manifest_check',
      runId: 'run_manifest_check',
      seriesId: 'series_p19',
      shot: baseShotContract,
      outputBaseDir: path.join(testDir, 'handoff_manifest_out', 'SHOT_01'),
    });

    const manifestRaw = JSON.parse(fs.readFileSync(result.manifestPath, 'utf-8'));
    expect(manifestRaw.shotId).toBe('SHOT_01');
    expect(manifestRaw.expectedOutputFilename).toBe('SHOT_01_FLOW_REAL.mp4');
    expect(manifestRaw.manifestSha256).toBeDefined();

    for (const fileKey of Object.keys(manifestRaw.files)) {
      const filePath = path.join(result.handoffDir, fileKey);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath);
      const actualSha = crypto.createHash('sha256').update(content).digest('hex');
      expect(manifestRaw.files[fileKey].sha256).toBe(actualSha);
    }
  });

  // 5. GOOGLE_FLOW_REAL requires explicit realExternal declaration
  it('5. requires explicit realExternal confirmation for GOOGLE_FLOW_REAL', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    await expect(
      orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
        generationSource: 'GOOGLE_FLOW_REAL',
        realExternal: false,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 6. Filename cannot spoof GOOGLE_FLOW_REAL
  it('6. proves filename alone cannot spoof GOOGLE_FLOW_REAL without operator flag', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    const namedFlowMp4 = path.join(testDir, 'SHOT_01_FLOW_REAL.mp4');
    fs.copyFileSync(realShotVideo, namedFlowMp4);

    const updated = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', namedFlowMp4, {
      generationSource: 'IMPORTED', // without explicit flag
    });

    expect(updated.mediaEvidence['SHOT_01'].generationSource).toBe('IMPORTED');
    expect(updated.mediaEvidence['SHOT_01'].generationSource).not.toBe('GOOGLE_FLOW_REAL');
  });

  // 7. SIMULATED_FLOW remains synthetic
  it('7. maintains SIMULATED_FLOW as permanently synthetic', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    const updated = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'SIMULATED_FLOW',
    });

    expect(updated.mediaEvidence['SHOT_01'].generationSource).toBe('SIMULATED_FLOW');
  });

  // 8. Real media SHA binding
  it('8. binds exact physical disk SHA-256 to media evidence and candidate asset', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    const updated = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const media = updated.mediaEvidence['SHOT_01'];
    expect(media.sha256).toBe(realSha256);
    expect(media.physicalPath).toBe(realShotVideo);
  });

  // 9. Media replacement invalidates QA
  it('9. invalidates QA evidence when media is replaced for a shot', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    // Re-import different media
    const replaced = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo2, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    expect(replaced.mediaEvidence['SHOT_01'].sha256).toBe(realSha256_2);
    expect(replaced.qaEvidence['SHOT_01'].mediaSha256).toBe(realSha256_2);
  });

  // 10. Media replacement invalidates approval
  it('10. invalidates previous approval when media is replaced', async () => {
    const { orchestrator, run } = await createTestPilotRun();
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

    // Re-importing media must clear approval and move shot out of completedShotIds
    const reimported = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo2, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    expect(reimported.approvalEvidence['SHOT_01']).toBeUndefined();
    expect(reimported.completedShotIds).not.toContain('SHOT_01');
    expect(reimported.status).toBe('APPROVAL_REQUIRED');
  });

  // 11. Media replacement invalidates challenge
  it('11. invalidates previous approval challenge when media is replaced', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Re-import media
    const reimported = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo2, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    expect(reimported.approvalChallenges?.[challenge.challengeId].consumedAt).not.toBeNull();
  });

  // 12. QA replacement invalidates challenge
  it('12. rejects approval using challenge issued under previous QA report', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // Mutate QA report id to simulate re-evaluation
    const loadedRun = (await storage.readJson(
      `.studio/production/${run.projectId}/${run.runId}/production-run.json`
    )) as ProductionRun;
    loadedRun.qaEvidence['SHOT_01'].reportId = 'vis_qa_NEW_REPORT_ID';
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

  // 13. AUTOMATED_TEST cannot satisfy master verification
  it('13. prevents AUTOMATED_TEST approval from satisfying MASTER_PRODUCTION_VERIFIED', () => {
    const run: ProductionRun = {
      runId: 'run_test_auto',
      projectId: 'proj_test_auto',
      seriesId: 'series_test_auto',
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
          sizeBytes: 1000,
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
          approvalType: 'AUTOMATED_TEST', // Non-human!
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
        manifestId: 'man_01',
        sequenceId: 'seq_01',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 14. Offline QA cannot satisfy master verification
  it('14. rejects offline or synthetic QA for master verification', () => {
    const run: ProductionRun = {
      runId: 'run_test_offline_qa',
      projectId: 'proj_test_offline_qa',
      seriesId: 'series_test_offline_qa',
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
          sizeBytes: 1000,
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
          providerTrust: 'OFFLINE_TEST_DOUBLE',
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
        manifestId: 'man_01',
        sequenceId: 'seq_01',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 15. Synthetic Flow cannot satisfy master verification
  it('15. rejects SIMULATED_FLOW from satisfying master verification', () => {
    const run: ProductionRun = {
      runId: 'run_test_sim_flow',
      projectId: 'proj_test_sim_flow',
      seriesId: 'series_test_sim_flow',
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
          sizeBytes: 1000,
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
        manifestId: 'man_01',
        sequenceId: 'seq_01',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true },
      })
    ).toThrow(ProductionSafetyError);
  });

  // 16. Missing live provider cannot satisfy master verification
  it('16. fails verification if provider evidence is missing LIVE_EXTERNAL records', () => {
    const result = ProductionMasterVerifier.verify({
      run: {
        runId: 'run_no_live',
        projectId: 'proj_no_live',
        seriesId: 'series_no_live',
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
      },
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'man_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true },
    });

    expect(result.passed).toBe(false);
  });

  // 17. Status next-action correctness
  it('17. resolves deterministic next action and 11-step matrix correctly', async () => {
    const { run } = await createTestPilotRun();
    run.status = 'NEEDS_USER_ACTION';
    run.resumeMetadata.targetShotId = 'SHOT_01';

    const resolution = await ProductionNextActionResolver.resolve(run, storage);
    expect(resolution.state).toBe('WAITING_FOR_FLOW_GENERATION');
    expect(resolution.operatorRequired).toBe(true);
    expect(resolution.providerRequired).toBe(false);
    expect(resolution.recommendedCommand).toContain('studio production import');
    expect(resolution.stepMatrix.length).toBe(11);
  });

  // 18. WAITING_FOR_PROVIDER resume preservation
  it('18. preserves all recorded media and evidence when blocked on WAITING_FOR_PROVIDER', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    // Manually transition to WAITING_FOR_PROVIDER
    const runRecord = (await storage.readJson(
      `.studio/production/${run.projectId}/${run.runId}/production-run.json`
    )) as ProductionRun;
    runRecord.status = 'WAITING_FOR_PROVIDER';
    runRecord.resumeMetadata.blockedReason = 'Gemini quota exhausted';
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/production-run.json`, runRecord);

    const reloaded = (await storage.readJson(
      `.studio/production/${run.projectId}/${run.runId}/production-run.json`
    )) as ProductionRun;
    expect(reloaded.mediaEvidence['SHOT_01']).toBeDefined();
    expect(reloaded.mediaEvidence['SHOT_01'].sha256).toBe(realSha256);
    expect(reloaded.status).toBe('WAITING_FOR_PROVIDER');
  });

  // 19. WAITING_FOR_IMPORT resume preservation
  it('19. preserves story and planned shot contracts when waiting for import', async () => {
    const { orchestrator, run } = await createTestPilotRun({ initialStatus: 'CREATED' });
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/story_analysis.json`, {
      sceneCandidates: [
        {
          id: 'SC01',
          sceneNumber: 1,
          heading: 'EXT. NEO TOKYO - NIGHT',
          timeOfDay: 'night',
          locationName: 'Neo Tokyo Alley',
          charactersPresent: ['char_kaito'],
          beats: [
            {
              id: 'BEAT_01',
              index: 0,
              summary: 'Kaito watches the digital rain.',
              involvedCharacterIds: ['char_kaito'],
              sourceTrace: { documentId: `doc_${run.projectId}_${run.runId}`, startOffset: 0, endOffset: 50 },
            },
          ],
          dialogueLines: [],
          narrationLines: [],
          sourceTrace: [{ documentId: `doc_${run.projectId}_${run.runId}`, startOffset: 0, endOffset: 50 }],
        },
      ],
    });

    const executed = await orchestrator.execute(run.projectId, run.runId);
    expect(executed.status).toBe('NEEDS_USER_ACTION');

    expect(await storage.exists(`.studio/production/${run.projectId}/${run.runId}/source_story.txt`)).toBe(true);
    expect(await storage.exists(`.studio/production/${run.projectId}/${run.runId}/planned_shots.json`)).toBe(true);
  });

  // 20. APPROVAL_REQUIRED resume preservation
  it('20. preserves imported media and visual QA evidence when waiting for approval', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    const updated = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    expect(updated.status).toBe('APPROVAL_REQUIRED');
    expect(updated.mediaEvidence['SHOT_01']).toBeDefined();
    expect(updated.qaEvidence['SHOT_01']).toBeDefined();
  });

  // 21. CLI status is read-only
  it('21. guarantees resolveProductionNextAction is strictly read-only and idempotent', async () => {
    const { run } = await createTestPilotRun();
    const beforeJson = JSON.stringify(run);

    await ProductionNextActionResolver.resolve(run, storage);
    await ProductionNextActionResolver.resolve(run, storage);

    expect(JSON.stringify(run)).toBe(beforeJson);
  });

  // 22. Acceptance bundle excludes secrets
  it('22. sanitizes acceptance bundle and excludes API keys or authorization headers', async () => {
    const projectId = 'proj_secret_audit';
    const runId = 'run_secret_audit';
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_sec',
      rawScript: 'Story with secrets AIzaSyFakeSecretKeyThatMustBeScrubbed',
      mode: 'PRODUCTION',
    });

    const masterEv = {
      manifestId: 'man_sec',
      sequenceId: 'seq_sec',
      masterVideoPath: realMasterVideo,
      masterSha256: masterSha256,
      sizeBytes: 1000,
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
      projectId,
      runId,
      storage,
      run,
      masterEvidence: masterEv,
      requiredShotIds: ['SHOT_01'],
    });

    // Inspect files in acceptance bundle
    for (const f of ProductionAcceptanceBundle.REQUIRED_FILES) {
      const content = await storage.read(`${bundle.acceptanceDir}/${f}`);
      expect(content).not.toMatch(/AIzaSy[A-Za-z0-9_-]{33}/);
      expect(content).not.toMatch(/Bearer\s+[A-Za-z0-9_\-\.]+/);
    }
  });

  // 23. Acceptance checksum detects modified evidence file
  it('23. detects tampered evidence file in acceptance bundle', async () => {
    const projectId = 'proj_tamper';
    const runId = 'run_tamper';
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId,
      seriesId: 'series_tamper',
      rawScript: 'Tamper test',
      mode: 'PRODUCTION',
    });

    const masterEv = {
      manifestId: 'man_tamper',
      sequenceId: 'seq_tamper',
      masterVideoPath: realMasterVideo,
      masterSha256: masterSha256,
      sizeBytes: 1000,
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
      projectId,
      runId,
      storage,
      run,
      masterEvidence: masterEv,
      requiredShotIds: ['SHOT_01'],
    });

    // Tamper media-evidence.json
    await storage.write(`${bundle.acceptanceDir}/media-evidence.json`, '{"tampered": true}');

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('checksum mismatch') || r.includes('tampered'))).toBe(true);
  });

  // 24. Malformed media rejected
  it('24. rejects corrupted or non-video media file during import', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    const badFile = path.join(testDir, 'corrupt.mp4');
    fs.writeFileSync(badFile, 'not a valid video');

    await expect(
      orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', badFile, {
        generationSource: 'GOOGLE_FLOW_REAL',
        realExternal: true,
      })
    ).rejects.toThrow();
  });

  // 25. Missing media rejected
  it('25. rejects import when file does not exist on disk', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    const missingFile = path.join(testDir, 'nonexistent.mp4');

    await expect(
      orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', missingFile, {
        generationSource: 'GOOGLE_FLOW_REAL',
        realExternal: true,
      })
    ).rejects.toThrow();
  });

  // 26. Wrong shot import rejected where applicable
  it('26. handles shot-specific media binding without cross-shot leakage', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    const updated = await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    expect(updated.mediaEvidence['SHOT_01']).toBeDefined();
    expect(updated.mediaEvidence['SHOT_02']).toBeUndefined();
  });

  // 27. Repeated handoff command remains safe and deterministic
  it('27. builds handoff package deterministically across repeated invocations', async () => {
    const handoffBuilder = new FlowOperatorHandoffBuilder();
    const fixedTime = '2026-09-23T12:00:00.000Z';
    const res1 = await handoffBuilder.buildHandoff({
      projectId: 'proj_repeat_handoff',
      runId: 'run_repeat_handoff',
      seriesId: 'series_p19',
      shot: baseShotContract,
      outputBaseDir: path.join(testDir, 'repeat_handoff', 'SHOT_01'),
      createdAt: fixedTime,
    });

    const res2 = await handoffBuilder.buildHandoff({
      projectId: 'proj_repeat_handoff',
      runId: 'run_repeat_handoff',
      seriesId: 'series_p19',
      shot: baseShotContract,
      outputBaseDir: path.join(testDir, 'repeat_handoff', 'SHOT_01'),
      createdAt: fixedTime,
    });

    expect(res1.manifestSha256).toBe(res2.manifestSha256);
  });

  // 28. Repeated resume does not duplicate completed work
  it('28. does not re-analyze story or recreate planned shots on repeated resume', async () => {
    const { orchestrator, run } = await createTestPilotRun({ initialStatus: 'CREATED' });
    await storage.writeJson(`.studio/production/${run.projectId}/${run.runId}/story_analysis.json`, {
      sceneCandidates: [
        {
          id: 'SC01',
          sceneNumber: 1,
          heading: 'EXT. NEO TOKYO - NIGHT',
          timeOfDay: 'night',
          locationName: 'Neo Tokyo Alley',
          charactersPresent: ['char_kaito'],
          beats: [
            {
              id: 'BEAT_01',
              index: 0,
              summary: 'Kaito watches the digital rain.',
              involvedCharacterIds: ['char_kaito'],
              sourceTrace: { documentId: `doc_${run.projectId}_${run.runId}`, startOffset: 0, endOffset: 50 },
            },
          ],
          dialogueLines: [],
          narrationLines: [],
          sourceTrace: [{ documentId: `doc_${run.projectId}_${run.runId}`, startOffset: 0, endOffset: 50 }],
        },
      ],
    });

    const res1 = await orchestrator.execute(run.projectId, run.runId);
    const shots1 = await storage.readJson<ShotContract[]>(
      `.studio/production/${run.projectId}/${run.runId}/planned_shots.json`
    );

    const res2 = await orchestrator.execute(run.projectId, run.runId);
    const shots2 = await storage.readJson<ShotContract[]>(
      `.studio/production/${run.projectId}/${run.runId}/planned_shots.json`
    );

    expect(shots1).toEqual(shots2);
  });

  // 29. Human trust semantics tests from Part A
  it('29. proves operator challenge ceremony rules strictly enforce trust boundary', async () => {
    const { orchestrator, run } = await createTestPilotRun();
    await orchestrator.importShotMedia(run.projectId, run.runId, 'SHOT_01', realShotVideo, {
      generationSource: 'GOOGLE_FLOW_REAL',
      realExternal: true,
    });

    // 29a. interactive=true without challenge fails
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
      })
    ).rejects.toThrow(ProductionSafetyError);

    // 29b. fake challenge fails
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: 'chal_fake',
        challengeNonce: 'ABCD1234EF56',
      })
    ).rejects.toThrow(ProductionSafetyError);

    // Issue real challenge
    const challenge = await orchestrator.issueApprovalChallenge(run.projectId, run.runId, 'SHOT_01', 'APPROVE');

    // 29c. wrong nonce fails
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: 'WRONG_NONCE',
      })
    ).rejects.toThrow(ProductionSafetyError);

    // 29d. valid issued challenge + correct nonce creates HUMAN approval record
    const approved = await orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
      approvalType: 'HUMAN',
      interactive: true,
      challengeId: challenge.challengeId,
      challengeNonce: challenge.nonce,
    });
    expect(approved.approvalEvidence['SHOT_01'].approvalType).toBe('HUMAN');
    expect(approved.approvalEvidence['SHOT_01'].status).toBe('APPROVED');

    // 29e. reused challenge fails
    await expect(
      orchestrator.approveShot(run.projectId, run.runId, 'SHOT_01', 'Director', undefined, {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 30. Offline rehearsal status remains OFFLINE_REHEARSAL_VERIFIED
  it('30. grants OFFLINE_REHEARSAL_VERIFIED for offline runs and never claims MASTER_PRODUCTION_VERIFIED', async () => {
    const run: ProductionRun = {
      runId: 'run_rehearsal_status',
      projectId: 'proj_rehearsal_status',
      seriesId: 'series_rehearsal_status',
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
          sizeBytes: 1000,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 320,
          height: 180,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'HyperFrames',
          generationSource: 'HYPERFRAMES',
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
          providerTrust: 'OFFLINE_TEST_DOUBLE',
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

    const preliminaryResult = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_rehearsal',
      sequenceId: 'seq_rehearsal',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
      allowRehearsal: true,
    });

    expect(preliminaryResult.passed).toBe(true);
    expect(preliminaryResult.status).toBe('OFFLINE_REHEARSAL_VERIFIED');
    expect(preliminaryResult.status).not.toBe('MASTER_PRODUCTION_VERIFIED');

    // Without allowRehearsal, must strictly reject master production verification
    expect(() =>
      ProductionMasterVerifier.assertVerified({
        run,
        requiredShotIds: ['SHOT_01'],
        masterVideoPath: realMasterVideo,
        manifestId: 'manifest_rehearsal',
        sequenceId: 'seq_rehearsal',
        shotVideoMap: { SHOT_01: realShotVideo },
        continuityReport: { overallPassed: true, issues: [] },
        shots: [baseShotContract],
        allowRehearsal: false,
      })
    ).toThrow(ProductionSafetyError);
  });
});
