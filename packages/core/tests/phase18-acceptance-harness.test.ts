import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  ProductionRun,
  ProductionMasterVerifier,
  MediaToolchainDoctor,
  ArtifactVerifier,
  DeterministicOfflineLLMDouble,
  MockLLMProvider,
  LiveProviderPreflight,
  ProductionAcceptanceBundle,
  ProductionOrchestrator,
  MemoryStorage,
  InMemoryAssetRegistry,
  ProductionSafetyError,
  ShotContract,
  LLMProvider,
  LLMProviderMetadata,
  LLMHealthCheckResult,
} from '../src/index.js';

describe('Phase 18.2 — Real Production Acceptance Harness Adversarial Test Suite', () => {
  let testDir: string;
  let realShotVideo: string;
  let realMasterVideo: string;
  let realSha256: string;
  let masterSha256: string;
  let storage: MemoryStorage;
  let assetRegistry: InMemoryAssetRegistry;

  beforeEach(() => {
    storage = new MemoryStorage();
    assetRegistry = new InMemoryAssetRegistry();
    testDir = path.resolve('.studio', 'temp_p18_2_adversarial', `t_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(testDir, { recursive: true });

    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    realShotVideo = path.join(testDir, 'shot_canon.mp4');
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=blue:s=640x360:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realShotVideo}"`,
      { stdio: 'ignore' }
    );
    realSha256 = ArtifactVerifier.verify(realShotVideo, { requireVideoStream: true }).checksumSha256!;

    realMasterVideo = path.join(testDir, 'master.mp4');
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=blue:s=1280x720:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${realMasterVideo}"`,
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

  function createValidBaseRun(): ProductionRun {
    return {
      runId: 'run_acceptance_base',
      projectId: 'proj_acceptance',
      seriesId: 'series_acceptance',
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
          sizeBytes: fs.statSync(realShotVideo).size,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 640,
          height: 360,
          durationSeconds: 1.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'Google Flow Direct Import',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'APPROVED',
        },
      },
      qaEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          reportId: 'rep_01',
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
          mediaSha256: realSha256,
          candidateAssetId: 'ASSET_01',
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {
        SHOT_01: {
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_01',
          canonicalAssetId: 'CANON_SHOT_01',
          mediaSha256: realSha256,
          qaReportId: 'rep_01',
          status: 'APPROVED',
          approvalType: 'HUMAN',
          decidedBy: 'Lead Director',
          decidedAt: new Date().toISOString(),
        },
      },
      resumeMetadata: { canResume: true },
    };
  }

  const baseShotContract: ShotContract = {
    id: 'SHOT_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'action',
    complexity: 'simple_layer_transform',
    rendererIntent: 'deterministic_hyperframes',
    frame: { durationSeconds: 1.0, aspectRatio: '16:9', targetFps: 24 },
    camera: { focalLength: '35mm', shotSize: 'medium', angle: 'eye_level', movement: 'static', semanticSkills: [] },
    lighting: { keyLightDirection: 'front', mood: 'natural', colorTemperature: 'neutral', fogAtmosphere: false },
    composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
    acting: [{ characterId: 'char_minh', actionDescription: 'Minh enters dark room' }],
    transition: { type: 'cut', durationSeconds: 0 },
    audioCue: { sfx: [] },
    requiredAssetIds: [],
    dependsOnShotIds: [],
    directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
    provenance: { decidedAt: new Date().toISOString() },
  };

  // Helper to create mock real external provider
  function createRealExternalLLMDouble(): LLMProvider {
    return {
      metadata: {
        id: 'gemini-live-external',
        name: 'Gemini 2.5 Pro Live External',
        providerTrust: 'LIVE_EXTERNAL',
        supportsStreaming: true,
        supportsImages: true,
        supportsMultimodalStructuredOutput: true,
        supportedRoles: ['STRUCTURED', 'VISION_QA', 'CREATIVE'],
        contextWindowTokens: 1048576,
      } as LLMProviderMetadata,
      generate: async () => ({ text: 'ok' }),
      generateStructured: async () => ({ status: 'PASS' } as any),
      diagnoseHealth: async (): Promise<LLMHealthCheckResult> => ({
        status: 'AVAILABLE',
        selectedModel: 'gemini-2.5-pro',
        latencyMs: 120,
      }),
      isConfigured: () => true,
    } as unknown as LLMProvider;
  }

  // 1. Offline provider rejected for production acceptance
  it('1. proves offline provider rejected for production acceptance', async () => {
    const offlineDouble = new DeterministicOfflineLLMDouble();
    const result = await LiveProviderPreflight.verify({
      provider: offlineDouble,
      requireLiveOptIn: true,
      liveConfirmed: true,
    });

    expect(result.passed).toBe(false);
    expect(result.providerTrust).toBe('OFFLINE_TEST_DOUBLE');
    expect(result.reasons.some((r) => r.includes('OFFLINE_TEST_DOUBLE'))).toBe(true);

    await expect(
      LiveProviderPreflight.assertVerified({
        provider: offlineDouble,
        requireLiveOptIn: true,
        liveConfirmed: true,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 2. Mock provider rejected
  it('2. proves mock provider rejected for production acceptance', async () => {
    const mockProvider = new MockLLMProvider();
    const result = await LiveProviderPreflight.verify({
      provider: mockProvider,
      requireLiveOptIn: true,
      liveConfirmed: true,
    });

    expect(result.passed).toBe(false);
    expect(result.providerTrust).toBe('MOCK');
    expect(result.reasons.some((r) => r.includes('MOCK'))).toBe(true);

    await expect(
      LiveProviderPreflight.assertVerified({
        provider: mockProvider,
        requireLiveOptIn: true,
        liveConfirmed: true,
      })
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 3. Real provider trust accepted
  it('3. proves real provider trust accepted when live execution is explicitly confirmed', async () => {
    const realProvider = createRealExternalLLMDouble();
    const result = await LiveProviderPreflight.verify({
      provider: realProvider,
      requireLiveOptIn: true,
      liveConfirmed: true,
    });

    expect(result.passed).toBe(true);
    expect(result.providerTrust).toBe('LIVE_EXTERNAL');
    expect(result.activeModel).toBe('gemini-2.5-pro');
    expect(result.reasons).toHaveLength(0);

    const assertRes = await LiveProviderPreflight.assertVerified({
      provider: realProvider,
      requireLiveOptIn: true,
      liveConfirmed: true,
    });
    expect(assertRes.passed).toBe(true);
  });

  // 4. SIMULATED_FLOW rejected
  it('4. proves SIMULATED_FLOW is rejected by production master verifier', () => {
    const run = createValidBaseRun();
    run.mediaEvidence['SHOT_01'].generationSource = 'SIMULATED_FLOW';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.checksSummary.noSimulatedMediaInProduction).toBe(false);
    expect(result.reasons.some((r) => r.includes('SIMULATED_FLOW'))).toBe(true);
  });

  // 5. Explicit GOOGLE_FLOW_REAL accepted as source provenance
  it('5. proves explicit GOOGLE_FLOW_REAL accepted as source provenance when imported with confirmation', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId: 'proj_flow_real',
      seriesId: 'series_flow_real',
      rawScript: 'Minh đi qua cánh đồng.',
      mode: 'PRODUCTION',
    });

    // Run must be in waiting/action stage to import
    run.status = 'WAITING_FOR_IMPORT';
    await orchestrator['repository'].save(run);

    // Import with explicit GOOGLE_FLOW_REAL and realExternal: true
    const updatedRun = await orchestrator.importShotMedia(
      'proj_flow_real',
      run.runId,
      'SHOT_01',
      realShotVideo,
      {
        generationSource: 'GOOGLE_FLOW_REAL',
        provenance: 'Google Flow Direct Download',
        realExternal: true,
      }
    );

    expect(updatedRun.mediaEvidence['SHOT_01'].generationSource).toBe('GOOGLE_FLOW_REAL');

    // Trying to import GOOGLE_FLOW_REAL without realExternal must fail closed
    await expect(
      orchestrator.importShotMedia(
        'proj_flow_real',
        run.runId,
        'SHOT_02',
        realShotVideo,
        {
          generationSource: 'GOOGLE_FLOW_REAL',
          provenance: 'Unconfirmed Download',
          realExternal: false,
        }
      )
    ).rejects.toThrow(ProductionSafetyError);
  });

  // 6. Real Flow media still requires QA
  it('6. proves real Flow media still requires Visual QA before approval or master', () => {
    const run = createValidBaseRun();
    delete (run.qaEvidence as any)['SHOT_01'];

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.qaPassedAndDefectFree).toBe(false);
    expect(result.reasons.some((r) => r.includes('Visual QA evidence missing'))).toBe(true);
  });

  // 7. Real Flow media still requires HUMAN approval
  it('7. proves real Flow media still requires HUMAN approval before master verification', () => {
    const run = createValidBaseRun();
    delete (run.approvalEvidence as any)['SHOT_01'];

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.humanApprovalVerified).toBe(false);
    expect(result.reasons.some((r) => r.includes('has not been approved into Canon'))).toBe(true);
  });

  // 8. Automated approval rejected by production master gate
  it('8. proves automated approval rejected by production master gate', () => {
    const run = createValidBaseRun();
    run.approvalEvidence['SHOT_01'].approvalType = 'AUTOMATED_TEST';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.humanApprovalVerified).toBe(false);
    expect(result.reasons.some((r) => r.includes('AUTOMATED_TEST'))).toBe(true);
  });

  // 9. HUMAN approval accepted
  it('9. proves HUMAN approval accepted with correct bound media checksum', () => {
    const run = createValidBaseRun();
    run.approvalEvidence['SHOT_01'].approvalType = 'HUMAN';
    run.approvalEvidence['SHOT_01'].mediaSha256 = realSha256;

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.checksSummary.humanApprovalVerified).toBe(true);
  });

  // 10. Media modified after approval invalidates approval
  it('10. proves media modified after approval invalidates approval', () => {
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    const modifiedVideo = path.join(testDir, 'shot_modified.mp4');
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=red:s=640x360:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${modifiedVideo}"`,
      { stdio: 'ignore' }
    );
    const modifiedSha256 = ArtifactVerifier.verify(modifiedVideo).checksumSha256!;

    const run = createValidBaseRun();
    // Approval was recorded for realSha256, but media now points to modifiedVideo
    run.mediaEvidence['SHOT_01'].physicalPath = modifiedVideo;
    run.mediaEvidence['SHOT_01'].sha256 = modifiedSha256;
    run.approvalEvidence['SHOT_01'].mediaSha256 = realSha256; // Old checksum

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: modifiedVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.humanApprovalVerified).toBe(false);
    expect(result.checksSummary.approvalChecksumMatchesMedia).toBe(false);
    expect(result.reasons.some((r) => r.includes('Approval evidence media checksum mismatch') || r.includes('approval checksum mismatch'))).toBe(true);
  });

  // 11. QA checksum mismatch blocks master
  it('11. proves QA checksum mismatch blocks master verification', () => {
    const run = createValidBaseRun();
    run.qaEvidence['SHOT_01'].mediaSha256 = '1111111111111111111111111111111111111111111111111111111111111111';

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.qaPassedAndDefectFree).toBe(false);
    expect(result.checksSummary.qaChecksumMatchesMedia).toBe(false);
    expect(result.reasons.some((r) => r.includes('QA evidence checksum mismatch') || r.includes('QA media checksum'))).toBe(true);
  });

  // 12. Timeline checksum mismatch blocks master
  it('12. proves timeline checksum mismatch blocks master verification', () => {
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
    const wrongTimelineVideo = path.join(testDir, 'wrong_timeline.mp4');
    execSync(
      `"${ffmpeg}" -y -f lavfi -i color=c=yellow:s=640x360:d=1.0:r=24 -c:v libx264 -pix_fmt yuv420p "${wrongTimelineVideo}"`,
      { stdio: 'ignore' }
    );

    const run = createValidBaseRun();

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: wrongTimelineVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
    });

    expect(result.passed).toBe(false);
    expect(result.checksSummary.timelineUsesApprovedCanonMedia).toBe(false);
    expect(result.reasons.some((r) => r.includes('checksum mismatch'))).toBe(true);
  });

  // 13. Provider quota preserves state
  it('13. proves provider quota failure preserves state as WAITING_FOR_PROVIDER', async () => {
    const quotaExceededError = new Error('Resource exhausted: quota exceeded (429)');
    (quotaExceededError as any).status = 429;

    const failingLlm = {
      metadata: {
        id: 'gemini-quota-test',
        name: 'Gemini Quota Test',
        providerTrust: 'LIVE_EXTERNAL',
        supportsStreaming: true,
        supportsImages: true,
        supportsMultimodalStructuredOutput: true,
        supportedRoles: ['STRUCTURED', 'VISION_QA'],
        contextWindowTokens: 1048576,
      },
      generateStructured: async () => {
        throw quotaExceededError;
      },
      classifyError: () => 'QUOTA_EXCEEDED',
      diagnoseHealth: async () => ({ status: 'RATE_LIMITED' }),
      isConfigured: () => true,
    } as unknown as LLMProvider;

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, failingLlm);
    const run = await orchestrator.createRun({
      projectId: 'proj_quota_test',
      seriesId: 'series_quota_test',
      rawScript: 'Minh nhìn thấy ánh sáng.',
      mode: 'PRODUCTION',
    });

    const resultRun = await orchestrator.execute('proj_quota_test', run.runId);

    expect(resultRun.status).toBe('WAITING_FOR_PROVIDER');
    expect(resultRun.resumeMetadata.canResume).toBe(true);
    expect(resultRun.resumeMetadata.blockedReason).toContain('QUOTA_EXCEEDED');
    expect(resultRun.resumeMetadata.recommendedCommand).toBe(`studio production resume ${run.runId}`);
  });

  // 14. Resume does not regenerate completed shots
  it('14. proves resume does not regenerate completed shots', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId: 'proj_resume_test',
      seriesId: 'series_resume_test',
      rawScript: 'Scene 1: Minh bước vào.',
      mode: 'PRODUCTION',
    });

    // Save planned shots with SHOT_01
    await storage.writeJson(`.studio/production/proj_resume_test/${run.runId}/planned_shots.json`, [baseShotContract]);

    // Mark SHOT_01 as completed with recorded media evidence and approval
    run.completedShotIds = ['SHOT_01'];
    run.mediaEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      assetId: 'ASSET_PREV',
      physicalPath: realShotVideo,
      sha256: realSha256,
      sizeBytes: 1234,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: null,
      width: 640,
      height: 360,
      durationSeconds: 1.0,
      fps: 24,
      verificationTimestamp: new Date().toISOString(),
      provenance: 'Existing Render',
      generationSource: 'HYPERFRAMES',
      approvalStatus: 'APPROVED',
    };
    run.approvalEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      candidateAssetId: 'ASSET_PREV',
      canonicalAssetId: 'CANON_SHOT_01',
      mediaSha256: realSha256,
      status: 'APPROVED',
      approvalType: 'HUMAN',
      decidedBy: 'Director',
      decidedAt: new Date().toISOString(),
    };
    run.qaEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      reportId: 'rep_prev',
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
      mediaSha256: realSha256,
      candidateAssetId: 'ASSET_PREV',
      evaluatedAt: new Date().toISOString(),
    };
    await orchestrator['repository'].save(run);

    // Run execution; completed shot should be skipped without re-rendering
    const resumedRun = await orchestrator.execute('proj_resume_test', run.runId);

    // Media evidence should still be ASSET_PREV and not overwritten
    expect(resumedRun.mediaEvidence['SHOT_01'].assetId).toBe('ASSET_PREV');
    expect(resumedRun.mediaEvidence['SHOT_01'].sha256).toBe(realSha256);
  });

  // 15. Acceptance manifest hash mismatch fails
  it('15. proves acceptance manifest hash mismatch fails validation', async () => {
    const run = createValidBaseRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 1280,
      height: 720,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {
        authoritativeMediaExists: true,
        mediaFilesPhysicallyExist: true,
        artifactVerifierPassed: true,
        mediaCryptographicChecksumValid: true,
        zeroTestOrSmokeMediaLeakage: true,
        approvedIntoCanon: true,
        humanApprovalVerified: true,
        approvalChecksumMatchesMedia: true,
        noSimulatedMediaInProduction: true,
        timelineUsesApprovedCanonMedia: true,
        qaPassedAndDefectFree: true,
        qaChecksumMatchesMedia: true,
        visualSemanticCoverageEvaluated: true,
        continuityQAMeetsProductionCriteria: true,
        noPendingRetakes: true,
        finalMasterPhysicallyExists: true,
        finalMasterFfprobeValidVideoStream: true,
        acceptanceBundleVerified: true,
      },
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    // Tamper with provider-evidence.json content
    const tamperedPath = `${bundle.acceptanceDir}/provider-evidence.json`;
    await storage.write(tamperedPath, '{"tampered": true}');

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('Cryptographic checksum mismatch for "provider-evidence.json"'))).toBe(true);
  });

  // 16. Missing acceptance artifact fails
  it('16. proves missing acceptance artifact fails validation', async () => {
    const run = createValidBaseRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 1280,
      height: 720,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED' as const,
      checksSummary: {
        authoritativeMediaExists: true,
        mediaFilesPhysicallyExist: true,
        artifactVerifierPassed: true,
        mediaCryptographicChecksumValid: true,
        zeroTestOrSmokeMediaLeakage: true,
        approvedIntoCanon: true,
        humanApprovalVerified: true,
        approvalChecksumMatchesMedia: true,
        noSimulatedMediaInProduction: true,
        timelineUsesApprovedCanonMedia: true,
        qaPassedAndDefectFree: true,
        qaChecksumMatchesMedia: true,
        visualSemanticCoverageEvaluated: true,
        continuityQAMeetsProductionCriteria: true,
        noPendingRetakes: true,
        finalMasterPhysicallyExists: true,
        finalMasterFfprobeValidVideoStream: true,
        acceptanceBundleVerified: true,
      },
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    // Delete qa-evidence.json
    const qaPath = `${bundle.acceptanceDir}/qa-evidence.json`;
    await storage.delete(qaPath);

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('missing at'))).toBe(true);
  });

  // 17. Noninteractive smoke cannot create HUMAN approval
  it('17. proves noninteractive smoke cannot create HUMAN approval without operator confirmation', async () => {
    const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
    const run = await orchestrator.createRun({
      projectId: 'proj_anti_spoof',
      seriesId: 'series_anti_spoof',
      rawScript: 'Minh nhìn bầu trời.',
      mode: 'PRODUCTION',
    });

    // Set up recorded media and passed QA
    run.mediaEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      assetId: 'ASSET_01',
      physicalPath: realShotVideo,
      sha256: realSha256,
      sizeBytes: fs.statSync(realShotVideo).size,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: null,
      width: 640,
      height: 360,
      durationSeconds: 1.0,
      fps: 24,
      verificationTimestamp: new Date().toISOString(),
      provenance: 'HyperFrames',
      generationSource: 'HYPERFRAMES',
      approvalStatus: 'PENDING',
    };
    run.qaEvidence['SHOT_01'] = {
      shotId: 'SHOT_01',
      reportId: 'rep_01',
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
      mediaSha256: realSha256,
      candidateAssetId: 'ASSET_01',
      evaluatedAt: new Date().toISOString(),
    };
    await orchestrator['repository'].save(run);

    // In this test runner (NODE_ENV=test), calling with approvalType='HUMAN' but no confirmation must throw
    await expect(
      orchestrator.approveShot('proj_anti_spoof', run.runId, 'SHOT_01', 'Automated Bot', 'Attempting spoof', {
        approvalType: 'HUMAN',
        interactive: false,
        confirmedByOperator: false,
      })
    ).rejects.toThrow(ProductionSafetyError);

    // Calling without explicit approvalType in test env defaults safely to AUTOMATED_TEST
    const automatedApprovedRun = await orchestrator.approveShot(
      'proj_anti_spoof',
      run.runId,
      'SHOT_01',
      'Automated Test Runner'
    );
    expect(automatedApprovedRun.approvalEvidence['SHOT_01'].approvalType).toBe('AUTOMATED_TEST');

    // Calling with confirmedByOperator: true alone without trusted confirmation throws ProductionSafetyError
    await expect(
      orchestrator.approveShot(
        'proj_anti_spoof',
        run.runId,
        'SHOT_01',
        'Human Lead Director',
        'Verified with director eyes',
        {
          approvalType: 'HUMAN',
          confirmedByOperator: true,
          actorDisplayName: 'Lead Director',
        }
      )
    ).rejects.toThrow(ProductionSafetyError);

    // Calling with valid challenge ceremony and interactive: true successfully records HUMAN
    const challenge = await orchestrator.issueApprovalChallenge(
      'proj_anti_spoof',
      run.runId,
      'SHOT_01',
      'APPROVE'
    );
    const humanApprovedRun = await orchestrator.approveShot(
      'proj_anti_spoof',
      run.runId,
      'SHOT_01',
      'Human Lead Director',
      'Verified with director eyes',
      {
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: challenge.challengeId,
        challengeNonce: challenge.nonce,
        actorDisplayName: 'Lead Director',
      }
    );
    expect(humanApprovedRun.approvalEvidence['SHOT_01'].approvalType).toBe('HUMAN');
  });

  // 18. Real acceptance bundle validates when all truth requirements pass
  it('18. proves real acceptance bundle validates when all truth requirements pass (two-phase flow)', async () => {
    const run = createValidBaseRun();

    // ── Phase A: Structural + semantic verification without acceptance bundle
    // This grants OFFLINE_REHEARSAL_VERIFIED (not MASTER_PRODUCTION_VERIFIED) because
    // the acceptance bundle does not yet exist. allowRehearsal=true is required here.
    const preliminaryResult = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
      allowRehearsal: true,
    });

    // Preliminary result is not yet MASTER_PRODUCTION_VERIFIED (bundle is absent)
    expect(preliminaryResult.passed).toBe(true);
    expect(preliminaryResult.status).toBe('OFFLINE_REHEARSAL_VERIFIED');
    expect(preliminaryResult.checksSummary.acceptanceBundleVerified).toBe(false);

    // ── Phase B: Build durable acceptance bundle from preliminary evidence
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 1280,
      height: 720,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: preliminaryResult.status,
      checksSummary: preliminaryResult.checksSummary,
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    expect(bundle.acceptanceDir).toContain('acceptance');
    expect(bundle.manifest.manifestSha256).toBeDefined();

    // ── Phase C: Validate the bundle's self-integrity and file checksums
    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(true);
    expect(validation.reasons).toHaveLength(0);
    expect(validation.metadata?.allChecksPassed).toBe(false); // preliminary status, not yet MASTER_PRODUCTION_VERIFIED

    // ── Phase D: Final verification WITH the validated acceptance bundle
    const finalResult = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
      acceptanceBundle: { valid: validation.valid, reasons: validation.reasons },
    });

    // Only now does the verifier grant MASTER_PRODUCTION_VERIFIED
    expect(finalResult.passed).toBe(true);
    expect(finalResult.status).toBe('MASTER_PRODUCTION_VERIFIED');
    expect(finalResult.checksSummary.acceptanceBundleVerified).toBe(true);
  });

  // 19. Missing acceptanceBundle fails verifier — cannot default to MASTER_PRODUCTION_VERIFIED
  it('19. proves missing acceptanceBundle fails verifier (fail-closed, no default pass)', () => {
    const run = createValidBaseRun();

    const result = ProductionMasterVerifier.verify({
      run,
      requiredShotIds: ['SHOT_01'],
      masterVideoPath: realMasterVideo,
      manifestId: 'manifest_01',
      sequenceId: 'seq_01',
      shotVideoMap: { SHOT_01: realShotVideo },
      continuityReport: { overallPassed: true, issues: [] },
      shots: [baseShotContract],
      // acceptanceBundle intentionally omitted
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.checksSummary.acceptanceBundleVerified).toBe(false);
    expect(result.reasons.some((r) => r.includes('Acceptance bundle is missing'))).toBe(true);
  });

  // 20. Tampered manifest self-hash fails bundle validation
  it('20. proves tampered acceptance-manifest.json self-hash fails validation', async () => {
    const run = createValidBaseRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 1280,
      height: 720,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    // Tamper with the manifest's recorded SHA (simulate manifest substitution)
    const manifestPath = `${bundle.acceptanceDir}/acceptance-manifest.json`;
    const raw = await storage.readJson<any>(manifestPath);
    raw.manifestSha256 = '0000000000000000000000000000000000000000000000000000000000000000';
    await storage.writeJson(manifestPath, raw);

    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some((r) => r.includes('self-integrity check failed'))).toBe(true);
  });

  // 21. Metadata runId mismatch in production-acceptance.json fails validation
  it('21. proves metadata runId mismatch in production-acceptance.json fails bundle validation', async () => {
    const run = createValidBaseRun();
    const masterEvidence = {
      runId: run.runId,
      projectId: run.projectId,
      masterPath: realMasterVideo,
      masterSha256,
      sizeBytes: fs.statSync(realMasterVideo).size,
      width: 1280,
      height: 720,
      durationSeconds: 1.0,
      fps: 24,
      container: 'mp4',
      videoCodec: 'h264',
      verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED' as const,
      checksSummary: {},
      verifiedAt: new Date().toISOString(),
    };

    const bundle = await ProductionAcceptanceBundle.build({
      projectId: run.projectId,
      runId: run.runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds: ['SHOT_01'],
      providerModelIds: ['gemini-2.5-pro'],
    });

    // Tamper: replace production-acceptance.json with a different runId
    const metaPath = `${bundle.acceptanceDir}/production-acceptance.json`;
    const rawMeta = await storage.readJson<any>(metaPath);
    rawMeta.runId = 'run_INJECTED_FOREIGN';
    await storage.writeJson(metaPath, rawMeta);

    // This tampers the file, which will cause file checksum mismatch AND metadata runId mismatch
    const validation = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage);
    expect(validation.valid).toBe(false);
    // Either checksum mismatch or metadata consistency failure must be reported
    const hasChecksumOrConsistencyError = validation.reasons.some(
      (r) => r.includes('Cryptographic checksum mismatch') || r.includes('Metadata consistency failure')
    );
    expect(hasChecksumOrConsistencyError).toBe(true);
  });
});
