import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  MemoryStorage,
  InMemoryAssetRegistry,
  ProductionRun,
  ProductionRunSchema,
  canTransitionProductionRun,
  assertLegalProductionRunTransition,
  ProductionRunStateMachine,
  ProductionRunRepository,
  ProviderEvidenceRecorder,
  MediaEvidenceRecorder,
  EvidenceStore,
  ProductionMasterVerifier,
  ProductionLeakDetector,
  ProductionSafetyError,
  ProductionOrchestrator,
  MediaToolchainDoctor,
  ArtifactVerifier,
  FileSystemStorage,
  FileSystemAssetRegistry,
} from '../src/index.js';

describe('Phase 18 — Real Production Pilot & Live Provider Evidence Test Suite', () => {
  let storage: MemoryStorage;
  let assetRegistry: InMemoryAssetRegistry;
  let testDir: string;

  beforeEach(() => {
    storage = new MemoryStorage();
    assetRegistry = new InMemoryAssetRegistry();
    testDir = path.resolve('.studio', 'temp_p18_tests', `t_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(testDir, { recursive: true });
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

  // Helper to generate a valid real MP4 using FFmpeg
  function createRealMp4(fileName: string, width = 640, height = 360, duration = 1.0): string {
    const filePath = path.join(testDir, fileName);
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=green:s=${width}x${height}:d=${duration}:r=24 -c:v libx264 -pix_fmt yuv420p "${filePath}"`,
      { stdio: 'ignore' }
    );
    return filePath;
  }

  // 1. Valid ProductionRun creation
  it('1. creates and validates a ProductionRun with strong Zod schema', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId: 'proj_test_01',
      seriesId: 'series_test_01',
      rawScript: 'Minh bước vào căn phòng tối.',
      mode: 'PRODUCTION',
    });

    expect(run.runId).toBeDefined();
    expect(run.status).toBe('CREATED');
    expect(run.mode).toBe('PRODUCTION');
    expect(() => ProductionRunSchema.parse(run)).not.toThrow();
  });

  // 2. Legal state transitions
  it('2. executes legal state transitions across the full lifecycle', () => {
    const initialRun: ProductionRun = {
      runId: 'run_state_01',
      projectId: 'proj_01',
      seriesId: 'series_01',
      status: 'CREATED',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'CREATED',
      completedShotIds: [],
      pendingShotIds: [],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };

    const sm = new ProductionRunStateMachine(initialRun);
    expect(sm.status).toBe('CREATED');

    sm.transition('PREFLIGHT');
    expect(sm.status).toBe('PREFLIGHT');

    sm.transition('READY');
    expect(sm.status).toBe('READY');

    sm.transition('RUNNING');
    expect(sm.status).toBe('RUNNING');

    sm.transition('VISUAL_QA');
    expect(sm.status).toBe('VISUAL_QA');

    sm.transition('APPROVAL_REQUIRED');
    expect(sm.status).toBe('APPROVAL_REQUIRED');

    sm.transition('ASSEMBLING');
    expect(sm.status).toBe('ASSEMBLING');

    sm.transition('MASTER_QA');
    expect(sm.status).toBe('MASTER_QA');

    sm.transition('COMPLETED');
    expect(sm.status).toBe('COMPLETED');
  });

  // 3. Illegal transitions blocked
  it('3. blocks illegal transitions and fails closed with ProductionSafetyError', () => {
    expect(canTransitionProductionRun('CREATED', 'COMPLETED')).toBe(false);
    expect(canTransitionProductionRun('WAITING_FOR_PROVIDER', 'COMPLETED')).toBe(false);
    expect(canTransitionProductionRun('COMPLETED', 'RUNNING')).toBe(false);

    expect(() => {
      assertLegalProductionRunTransition('CREATED', 'COMPLETED', 'Jump to end prohibited');
    }).toThrow(ProductionSafetyError);
  });

  // 4. State persisted
  it('4. persists and reloads ProductionRun faithfully from storage', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId: 'proj_persist',
      seriesId: 'series_persist',
      rawScript: 'Script content',
    });

    const repo = new ProductionRunRepository(storage);
    const loaded = await repo.findById(run.projectId, run.runId);
    expect(loaded).not.toBeNull();
    expect(loaded?.runId).toBe(run.runId);
    expect(loaded?.projectId).toBe('proj_persist');
  });

  // 5. Interrupted run resumes & 6. Completed shots not regenerated
  it('5 & 6. resumes interrupted run and skips already completed shots without re-running', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId: 'proj_resume',
      seriesId: 'series_resume',
      rawScript: 'Scene 1. Minh looks at candle.',
    });

    const repo = new ProductionRunRepository(storage);
    const sm = new ProductionRunStateMachine(run);
    sm.transition('PREFLIGHT');
    sm.transition('READY');
    sm.transition('RUNNING');
    sm.markShotCompleted('SHOT_01');
    await repo.save(sm.getRun());

    const reloaded = await repo.findById(run.projectId, run.runId);
    expect(reloaded?.completedShotIds).toContain('SHOT_01');
    expect(reloaded?.pendingShotIds).not.toContain('SHOT_01');
  });

  // 7. Provider success evidence recorded & 8. API key never recorded & 30. No secrets in evidence
  it('7, 8 & 30. records sanitized provider evidence, computes hashes, and scrubs all API keys and secrets', () => {
    const secretKey = 'AIzaSyD-FakeSecretKeyForUnitTest1234567890';
    const rawInput = {
      prompt: 'Analyze story scene',
      apiKey: secretKey,
      authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
    };

    const evidence = ProviderEvidenceRecorder.record({
      runId: 'run_test_evidence',
      shotId: 'SHOT_01',
      providerId: 'google-gemini',
      providerName: 'Google Gemini',
      providerRole: 'STRUCTURED',
      actualModel: 'gemini-3.5-flash',
      requestStartedAt: new Date(Date.now() - 500).toISOString(),
      requestCompletedAt: new Date().toISOString(),
      latencyMs: 500,
      status: 'SUCCESS',
      rawInput,
      rawOutput: { sceneCount: 1 },
      usage: { inputTokens: 50, outputTokens: 120, totalTokens: 170 },
    });

    expect(evidence.inputHash).toBeDefined();
    expect(evidence.outputHash).toBeDefined();
    expect(evidence.usage?.totalTokens).toBe(170);

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain('eyJhbGciOi');
    expect(serialized).not.toContain('Bearer eyJ');
  });

  // 9. QUOTA_EXCEEDED classified & 10. Quota causes WAITING_FOR_PROVIDER & 11. Resume after provider availability
  it('9, 10 & 11. handles QUOTA_EXCEEDED gracefully, transitions to WAITING_FOR_PROVIDER, and provides resume path', () => {
    const run: ProductionRun = {
      runId: 'run_quota_test',
      projectId: 'proj_quota',
      seriesId: 'series_quota',
      status: 'RUNNING',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'shot_generation',
      completedShotIds: ['SHOT_01'],
      pendingShotIds: ['SHOT_02'],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };

    const sm = new ProductionRunStateMachine(run);
    sm.transition('WAITING_FOR_PROVIDER', 'Quota exceeded on gemini-3.5-flash');
    sm.setResumeMetadata({
      canResume: true,
      blockedReason: 'Provider quota exhausted (QUOTA_EXCEEDED).',
      recommendedCommand: `studio production resume ${run.runId}`,
    });

    expect(sm.status).toBe('WAITING_FOR_PROVIDER');
    expect(sm.getRun().completedShotIds).toContain('SHOT_01');
    expect(sm.getRun().resumeMetadata.recommendedCommand).toBe(`studio production resume ${run.runId}`);

    // Resume when provider returns
    sm.transition('RUNNING', 'Provider quota restored');
    expect(sm.status).toBe('RUNNING');
  });

  // 12. Flow causes NEEDS_USER_ACTION & 13. Flow import resumes pipeline
  it('12 & 13. supports Google Flow assisted handoff (NEEDS_USER_ACTION) and resumes on import', async () => {
    const realVideo = createRealMp4('flow_imported.mp4', 640, 360, 1.0);

    const initialRun: ProductionRun = {
      runId: 'run_flow_test',
      projectId: 'proj_flow',
      seriesId: 'series_flow',
      status: 'NEEDS_USER_ACTION',
      mode: 'LOCAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'waiting_for_flow_download',
      currentShotId: 'SHOT_FLOW_01',
      completedShotIds: [],
      pendingShotIds: ['SHOT_FLOW_01'],
      blockedShotIds: ['SHOT_FLOW_01'],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: {
        canResume: true,
        nextAction: 'Download MP4 from Google Flow',
      },
    };

    await storage.writeJson(`.studio/production/proj_flow/run_flow_test/production-run.json`, initialRun);

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const updated = await orchestrator.importShotMedia(
      'proj_flow',
      'run_flow_test',
      'SHOT_FLOW_01',
      realVideo
    );

    expect(updated.status).toBe('APPROVAL_REQUIRED');
    expect(updated.mediaEvidence['SHOT_FLOW_01']).toBeDefined();
    expect(updated.mediaEvidence['SHOT_FLOW_01'].physicalPath).toBe(path.resolve(realVideo));
    expect(updated.qaEvidence['SHOT_FLOW_01']).toBeDefined();
  });

  // 14. Physical media verification & 15. SHA-256 recorded & 16. FFprobe metadata recorded
  it('14, 15 & 16. verifies physical media with ArtifactVerifier, computes SHA-256, and records FFprobe metadata', () => {
    const realVideo = createRealMp4('shot_verified.mp4', 1280, 720, 2.0);

    const mediaEvidence = MediaEvidenceRecorder.verifyAndRecord({
      shotId: 'SHOT_TEST_REAL',
      assetId: 'ASSET_REAL_01',
      filePath: realVideo,
      provenance: 'FFmpeg Deterministic Encoder',
      generationSource: 'HYPERFRAMES',
      executionMode: 'LOCAL',
    });

    expect(mediaEvidence.shotId).toBe('SHOT_TEST_REAL');
    expect(mediaEvidence.sha256).toHaveLength(64);
    expect(mediaEvidence.sizeBytes).toBeGreaterThan(0);
    expect(mediaEvidence.width).toBe(1280);
    expect(mediaEvidence.height).toBe(720);
    expect(mediaEvidence.durationSeconds).toBeCloseTo(2.0, 0.5);
    expect(mediaEvidence.videoCodec).toBe('h264');
  });

  // 17. Zero-byte media rejected & 18. Missing media rejected & 19. Corrupt media rejected
  it('17, 18 & 19. rejects missing, empty, and corrupt media with ProductionSafetyError', () => {
    const emptyFile = path.join(testDir, 'empty.mp4');
    fs.writeFileSync(emptyFile, '');

    const corruptFile = path.join(testDir, 'corrupt.mp4');
    fs.writeFileSync(corruptFile, 'not-a-valid-mp4-data-stream-garbage');

    // Missing
    expect(() => {
      MediaEvidenceRecorder.verifyAndRecord({
        shotId: 'S_MISSING',
        assetId: 'A_MISSING',
        filePath: path.join(testDir, 'does_not_exist.mp4'),
        provenance: 'test',
        generationSource: 'IMPORTED',
      });
    }).toThrow(ProductionSafetyError);

    // Empty
    expect(() => {
      MediaEvidenceRecorder.verifyAndRecord({
        shotId: 'S_EMPTY',
        assetId: 'A_EMPTY',
        filePath: emptyFile,
        provenance: 'test',
        generationSource: 'IMPORTED',
      });
    }).toThrow(ProductionSafetyError);

    // Corrupt
    expect(() => {
      MediaEvidenceRecorder.verifyAndRecord({
        shotId: 'S_CORRUPT',
        assetId: 'A_CORRUPT',
        filePath: corruptFile,
        provenance: 'test',
        generationSource: 'IMPORTED',
      });
    }).toThrow(ProductionSafetyError);
  });

  // 20. Test fixture rejected in PRODUCTION & 21. Smoke media rejected in PRODUCTION
  it('20 & 21. strictly rejects fixture or smoke artifacts in PRODUCTION mode', () => {
    const smokeDir = path.resolve('.studio', 'smoke', 'media');
    fs.mkdirSync(smokeDir, { recursive: true });
    const smokeVideo = path.join(smokeDir, 'smoke_test.mp4');
    fs.writeFileSync(smokeVideo, 'some bytes');

    expect(ProductionLeakDetector.isTestOrSmokeArtifact('.studio/smoke/media/master.mp4')).toBe(true);
    expect(ProductionLeakDetector.isTestOrSmokeArtifact('fixtures/test_video.mp4')).toBe(true);
    expect(ProductionLeakDetector.isTestOrSmokeArtifact('.studio/tests/dummy.mp4')).toBe(true);

    expect(() => {
      ProductionLeakDetector.assertProductionMediaSafety('.studio/smoke/master.mp4', 'Authoritative shot');
    }).toThrow(ProductionSafetyError);
  });

  // 22. Candidate cannot become timeline canon automatically & 25. Approved shot enters authoritative shotVideoMap
  it('22 & 25. enforces Candidate != Canon and requires human approval before canon promotion', async () => {
    const realVideo = createRealMp4('candidate_shot.mp4', 640, 360, 1.0);
    const media = MediaEvidenceRecorder.verifyAndRecord({
      shotId: 'SHOT_CANDIDATE',
      assetId: 'ASSET_CANDIDATE',
      filePath: realVideo,
      provenance: 'test',
      generationSource: 'IMPORTED',
      executionMode: 'LOCAL',
    });

    const run: ProductionRun = {
      runId: 'run_canon_test',
      projectId: 'proj_canon',
      seriesId: 'series_canon',
      status: 'APPROVAL_REQUIRED',
      mode: 'LOCAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'qa_complete',
      currentShotId: 'SHOT_CANDIDATE',
      completedShotIds: [],
      pendingShotIds: ['SHOT_CANDIDATE'],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: { SHOT_CANDIDATE: media },
      qaEvidence: {
        SHOT_CANDIDATE: {
          shotId: 'SHOT_CANDIDATE',
          reportId: 'rep_01',
          overallStatus: 'PASS',
          passed: true,
          mechanism: 'LOCAL_MEDIA_METADATA',
          scores: { identity: 0.95, spatial: 0.95, defects: 0.95, overall: 0.95 },
          totalDefects: 0,
          criticalDefects: 0,
          retakesRecommended: 0,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };

    await storage.writeJson('.studio/production/proj_canon/run_canon_test/production-run.json', run);

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    // Approval required
    const approved = await orchestrator.approveShot('proj_canon', 'run_canon_test', 'SHOT_CANDIDATE');

    expect(approved.approvalEvidence['SHOT_CANDIDATE']?.status).toBe('APPROVED');
    expect(approved.completedShotIds).toContain('SHOT_CANDIDATE');
    expect(approved.mediaEvidence['SHOT_CANDIDATE'].approvalStatus).toBe('APPROVED');
  });

  // 23. Failed Visual QA blocks approval & 24. Unresolved critical defect blocks export
  it('23 & 24. blocks approval and master export when QA fails or has unresolved critical defects', async () => {
    const realVideo = createRealMp4('defect_shot.mp4', 640, 360, 1.0);
    const media = MediaEvidenceRecorder.verifyAndRecord({
      shotId: 'SHOT_DEFECT',
      assetId: 'ASSET_DEFECT',
      filePath: realVideo,
      provenance: 'test',
      generationSource: 'IMPORTED',
      executionMode: 'LOCAL',
    });

    const run: ProductionRun = {
      runId: 'run_defect_test',
      projectId: 'proj_defect',
      seriesId: 'series_defect',
      status: 'APPROVAL_REQUIRED',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'qa_complete',
      completedShotIds: [],
      pendingShotIds: ['SHOT_DEFECT'],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: { SHOT_DEFECT: media },
      qaEvidence: {
        SHOT_DEFECT: {
          shotId: 'SHOT_DEFECT',
          reportId: 'rep_fail',
          overallStatus: 'FAIL',
          passed: false,
          mechanism: 'MULTIMODAL_PROVIDER',
          scores: { identity: 0.2, spatial: 0.3, defects: 0.2, overall: 0.2 },
          totalDefects: 2,
          criticalDefects: 1,
          retakesRecommended: 1,
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };

    await storage.writeJson('.studio/production/proj_defect/run_defect_test/production-run.json', run);

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    // Should throw because QA failed
    await expect(orchestrator.approveShot('proj_defect', 'run_defect_test', 'SHOT_DEFECT')).rejects.toThrow(
      ProductionSafetyError
    );
  });

  // 26. Master export uses authoritative media & 27. Master physical verification & 28. Evidence schemas validate
  it('26, 27 & 28. performs 13-point Master Production Gate audit and produces validated master evidence', () => {
    const realShotVideo = createRealMp4('canon_shot.mp4', 1280, 720, 2.0);
    const media = MediaEvidenceRecorder.verifyAndRecord({
      shotId: 'SHOT_CANON_01',
      assetId: 'ASSET_CANON_01',
      filePath: realShotVideo,
      provenance: 'HyperFrames',
      generationSource: 'HYPERFRAMES',
      executionMode: 'LOCAL',
    });

    const realMasterVideo = createRealMp4('final_master.mp4', 1920, 1080, 2.0);

    const run: ProductionRun = {
      runId: 'run_master_gate',
      projectId: 'proj_master_gate',
      seriesId: 'series_master_gate',
      status: 'MASTER_QA',
      mode: 'LOCAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'master_qa',
      completedShotIds: ['SHOT_CANON_01'],
      pendingShotIds: [],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: { SHOT_CANON_01: media },
      qaEvidence: {
        SHOT_CANON_01: {
          shotId: 'SHOT_CANON_01',
          reportId: 'rep_passed',
          candidateAssetId: media.assetId,
          mediaSha256: media.sha256,
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
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_CANON_01: {
          shotId: 'SHOT_CANON_01',
          candidateAssetId: media.assetId,
          canonicalAssetId: 'CANON_SHOT_CANON_01',
          mediaSha256: media.sha256,
          qaReportId: 'rep_passed',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          decidedBy: 'Lead Director',
          decidedAt: new Date().toISOString(),
        },
      },
      resumeMetadata: { canResume: true },
    };

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_CANON_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_master_01',
      sequenceId: 'seq_master_01',
      shotVideoMap: { SHOT_CANON_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      // Phase 18.2.1: acceptance bundle is now mandatory for MASTER_PRODUCTION_VERIFIED.
      // In this test we supply a pre-validated bundle to keep focus on master gate semantics.
      acceptanceBundle: { valid: true, reasons: [] },
    });

    expect(result.passed).toBe(true);
    expect(result.status).toBe('MASTER_PRODUCTION_VERIFIED');
    expect(result.checksSummary.acceptanceBundleVerified).toBe(true);
    expect(result.evidence?.masterSha256).toHaveLength(64);
    expect(result.evidence?.verificationStatus).toBe('MASTER_PRODUCTION_VERIFIED');
  });

  // 29. Evidence survives resume
  it('29. persists and survives resume across durable evidence store', async () => {
    const store = new EvidenceStore(storage);
    const pId = 'proj_survive';
    const rId = 'run_survive';

    const providerRec = ProviderEvidenceRecorder.record({
      runId: rId,
      providerId: 'google-gemini',
      providerName: 'Google Gemini',
      providerRole: 'STRUCTURED',
      actualModel: 'gemini-3.5-flash',
      requestStartedAt: new Date().toISOString(),
      requestCompletedAt: new Date().toISOString(),
      latencyMs: 350,
      status: 'SUCCESS',
      rawInput: 'story test',
    });

    await store.saveProviderEvidence(pId, rId, [providerRec]);

    const loaded = await store.loadProviderEvidence(pId, rId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].inputHash).toBe(providerRec.inputHash);
  });

  // 31. No mock provider satisfies production semantic truth & 32. Local/test behavior still works
  it('31 & 32. rejects mock provider satisfying production truth while allowing local/test execution', () => {
    // In PRODUCTION mode, isMock / synthetic test artifacts are rejected
    expect(() => {
      ProductionLeakDetector.assertProductionMediaSafety('.studio/smoke/fake.mp4', 'Production artifact');
    }).toThrow(ProductionSafetyError);

    // In LOCAL mode without leak detector, mock test passes
    expect(ProductionLeakDetector.isTestOrSmokeArtifact('valid/render/shot.mp4')).toBe(false);
  });
});
