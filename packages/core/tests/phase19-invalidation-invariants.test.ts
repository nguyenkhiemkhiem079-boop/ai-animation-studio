import { describe, it, expect } from 'vitest';
import {
  ProductionRun,
  ProductionInvariantValidator,
  ProductionInvalidationEngine,
  ProductionError,
  ProductionErrorCodeSchema,
  ProductionSafetyError,
} from '../src/index.js';

function createBaseMockRun(): ProductionRun {
  return {
    runId: 'run_inv_test_01',
    projectId: 'proj_inv_test',
    seriesId: 'series_inv_test',
    status: 'RUNNING',
    mode: 'PRODUCTION',
    pilotMode: true,
    requiredShotCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStage: 'shot_generation',
    currentShotId: 'SHOT_01',
    completedShotIds: [],
    pendingShotIds: ['SHOT_01'],
    blockedShotIds: [],
    providerJobs: {},
    mediaEvidence: {},
    qaEvidence: {},
    approvalEvidence: {},
    approvalChallenges: {},
    resumeMetadata: { canResume: true, targetShotId: 'SHOT_01' },
  };
}

describe('Phase 19.19, 19.22 & 19.36 — State Invariants, Invalidation Engine, and Error Taxonomy', () => {
  describe('ProductionInvariantValidator', () => {
    it('Invariant 1: Rejects COMPLETED run lacking master evidence', () => {
      const run = createBaseMockRun();
      run.status = 'COMPLETED';
      run.masterEvidence = undefined;

      const result = ProductionInvariantValidator.validate(run);
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain('lacks masterEvidence');
    });

    it('Invariant 2: Rejects MASTER_PRODUCTION_VERIFIED with simulated flow media or test double QA', () => {
      const run = createBaseMockRun();
      run.status = 'COMPLETED';
      run.masterEvidence = {
        manifestId: 'manifest_1',
        sequenceId: 'seq_1',
        masterVideoPath: 'master.mp4',
        masterSha256: 'a'.repeat(64),
        sizeBytes: 1024,
        durationSeconds: 4.0,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        fps: 24,
        verifiedAt: new Date().toISOString(),
        verificationStatus: 'MASTER_PRODUCTION_VERIFIED',
        checksSummary: {},
      };
      run.mediaEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        assetId: 'ASSET_01',
        physicalPath: 'shot_01.mp4',
        sha256: 'b'.repeat(64),
        sizeBytes: 512,
        durationSeconds: 4.0,
        width: 1920,
        height: 1080,
        fps: 24,
        videoCodec: 'h264',
        audioCodec: null,
        provenance: 'Simulated',
        generationSource: 'SIMULATED_FLOW',
        approvalStatus: 'APPROVED',
        verifiedAt: new Date().toISOString(),
      };

      const result = ProductionInvariantValidator.validate(run);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('synthetic media'))).toBe(true);
    });

    it('Invariant 7: Rejects APPROVAL_REQUIRED when candidate media evidence is missing', () => {
      const run = createBaseMockRun();
      run.status = 'APPROVAL_REQUIRED';
      run.resumeMetadata = { canResume: true, targetShotId: 'SHOT_01' };
      // No mediaEvidence['SHOT_01']

      const result = ProductionInvariantValidator.validate(run);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('lacks mediaEvidence for shot "SHOT_01"'))).toBe(true);
    });

    it('Invariant 8: Rejects completedShotIds items that lack canonical approved media', () => {
      const run = createBaseMockRun();
      run.completedShotIds = ['SHOT_01'];
      // No media and no approval

      const result = ProductionInvariantValidator.validate(run);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('lacks media evidence'))).toBe(true);
      expect(result.violations.some((v) => v.includes('lacks APPROVED canon status'))).toBe(true);
    });

    it('Invariant 9: Rejects approval candidateAssetId mismatch with recorded media assetId', () => {
      const run = createBaseMockRun();
      const sha = 'c'.repeat(64);
      run.mediaEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        assetId: 'ASSET_CORRECT',
        physicalPath: 'shot_01.mp4',
        sha256: sha,
        sizeBytes: 512,
        durationSeconds: 4.0,
        width: 1920,
        height: 1080,
        fps: 24,
        videoCodec: 'h264',
        audioCodec: null,
        provenance: 'Flow Import',
        generationSource: 'GOOGLE_FLOW_REAL',
        approvalStatus: 'APPROVED',
        verifiedAt: new Date().toISOString(),
      };
      run.qaEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        reportId: 'QA_REPORT_1',
        mediaSha256: sha,
        candidateAssetId: 'ASSET_CORRECT',
        overallStatus: 'PASS',
        passed: true,
        mechanism: 'LIVE_MULTIMODAL_API',
        providerTrust: 'LIVE_EXTERNAL',
        isSynthetic: false,
        scores: { identity: 90, spatial: 90, defects: 90, overall: 90 },
        coverage: {} as any,
        totalDefects: 0,
        criticalDefects: 0,
        retakesRecommended: 0,
        evaluatedAt: new Date().toISOString(),
      };
      run.approvalEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        candidateAssetId: 'ASSET_SPOOFED', // mismatch!
        canonicalAssetId: 'CANON_SHOT_01',
        mediaSha256: sha,
        qaReportId: 'QA_REPORT_1',
        status: 'APPROVED',
        approvalType: 'AUTOMATED_TEST',
        interactive: false,
        decidedBy: 'Operator',
        decidedAt: new Date().toISOString(),
      };

      const result = ProductionInvariantValidator.validate(run);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('approval candidateAssetId "ASSET_SPOOFED" does not match'))).toBe(true);
    });
  });

  describe('ProductionInvalidationEngine', () => {
    it('invalidateOnMediaChange clears QA, consumes open challenges, removes approval, and resets master', () => {
      const run = createBaseMockRun();
      const sha = 'd'.repeat(64);
      run.completedShotIds = ['SHOT_01'];
      run.pendingShotIds = [];
      run.mediaEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        assetId: 'ASSET_1',
        physicalPath: 'shot_01.mp4',
        sha256: sha,
        sizeBytes: 512,
        durationSeconds: 4.0,
        width: 1920,
        height: 1080,
        fps: 24,
        videoCodec: 'h264',
        audioCodec: null,
        provenance: 'Flow Import',
        generationSource: 'GOOGLE_FLOW_REAL',
        approvalStatus: 'APPROVED',
        verifiedAt: new Date().toISOString(),
      };
      run.qaEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        reportId: 'QA_1',
        mediaSha256: sha,
        candidateAssetId: 'ASSET_1',
        overallStatus: 'PASS',
        passed: true,
        mechanism: 'LIVE_MULTIMODAL_API',
        providerTrust: 'LIVE_EXTERNAL',
        isSynthetic: false,
        scores: { identity: 90, spatial: 90, defects: 90, overall: 90 },
        coverage: {} as any,
        totalDefects: 0,
        criticalDefects: 0,
        retakesRecommended: 0,
        evaluatedAt: new Date().toISOString(),
      };
      run.approvalChallenges = {
        CHAL_1: {
          challengeId: 'CHAL_1',
          projectId: run.projectId,
          runId: run.runId,
          shotId: 'SHOT_01',
          candidateAssetId: 'ASSET_1',
          mediaSha256: sha,
          qaReportId: 'QA_1',
          approvalAction: 'APPROVE',
          nonce: 'testnonce123',
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          consumedAt: null,
        },
      };
      run.approvalEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        candidateAssetId: 'ASSET_1',
        canonicalAssetId: 'CANON_SHOT_01',
        mediaSha256: sha,
        qaReportId: 'QA_1',
        status: 'APPROVED',
        approvalType: 'HUMAN',
        interactive: true,
        challengeId: 'CHAL_1',
        challengeNonce: 'testnonce123',
        decidedBy: 'Operator',
        decidedAt: new Date().toISOString(),
      };
      run.masterEvidence = {
        manifestId: 'manifest_1',
        sequenceId: 'seq_1',
        masterVideoPath: 'master.mp4',
        masterSha256: 'e'.repeat(64),
        sizeBytes: 1024,
        durationSeconds: 4.0,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: null,
        fps: 24,
        verifiedAt: new Date().toISOString(),
        verificationStatus: 'MASTER_PRODUCTION_VERIFIED',
        checksSummary: {},
      };

      const report = ProductionInvalidationEngine.invalidateOnMediaChange(run, 'SHOT_01', 'New media downloaded');

      expect(report.invalidatedQA).toBe(true);
      expect(report.invalidatedApproval).toBe(true);
      expect(report.invalidatedChallengesCount).toBe(1);
      expect(report.invalidatedMaster).toBe(true);

      expect(run.qaEvidence['SHOT_01']).toBeUndefined();
      expect(run.approvalEvidence['SHOT_01']).toBeUndefined();
      expect(run.approvalChallenges['CHAL_1'].consumedAt).not.toBeNull();
      expect(run.completedShotIds).not.toContain('SHOT_01');
      expect(run.pendingShotIds).toContain('SHOT_01');
      expect(run.masterEvidence).toBeUndefined();
    });

    it('invalidateOnShotContractChange cascades invalidation through QA and approvals while keeping media', () => {
      const run = createBaseMockRun();
      const sha = 'f'.repeat(64);
      run.completedShotIds = ['SHOT_01'];
      run.mediaEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        assetId: 'ASSET_1',
        physicalPath: 'shot_01.mp4',
        sha256: sha,
        sizeBytes: 512,
        durationSeconds: 4.0,
        width: 1920,
        height: 1080,
        fps: 24,
        videoCodec: 'h264',
        audioCodec: null,
        provenance: 'Import',
        generationSource: 'GOOGLE_FLOW_REAL',
        approvalStatus: 'APPROVED',
        verifiedAt: new Date().toISOString(),
      };
      run.qaEvidence['SHOT_01'] = {
        shotId: 'SHOT_01',
        reportId: 'QA_1',
        mediaSha256: sha,
        candidateAssetId: 'ASSET_1',
        overallStatus: 'PASS',
        passed: true,
        mechanism: 'LIVE_MULTIMODAL_API',
        providerTrust: 'LIVE_EXTERNAL',
        isSynthetic: false,
        scores: { identity: 90, spatial: 90, defects: 90, overall: 90 },
        coverage: {} as any,
        totalDefects: 0,
        criticalDefects: 0,
        retakesRecommended: 0,
        evaluatedAt: new Date().toISOString(),
      };

      const report = ProductionInvalidationEngine.invalidateOnShotContractChange(run, 'SHOT_01', 'Framing updated from close-up to wide');
      expect(report.invalidatedQA).toBe(true);
      expect(run.qaEvidence['SHOT_01']).toBeUndefined();
      expect(run.mediaEvidence['SHOT_01']).toBeDefined(); // media physically preserved
      expect(run.mediaEvidence['SHOT_01'].approvalStatus).toBe('PENDING');
      expect(run.completedShotIds).not.toContain('SHOT_01');
      expect(run.pendingShotIds).toContain('SHOT_01');
    });

    it('invalidateOnMasterChange marks verification failed without wiping shot-level evidence', () => {
      const run = createBaseMockRun();
      run.masterEvidence = {
        manifestId: 'manifest_1',
        sequenceId: 'seq_1',
        masterVideoPath: 'master.mp4',
        masterSha256: 'a'.repeat(64),
        sizeBytes: 1024,
        durationSeconds: 4.0,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: null,
        fps: 24,
        verifiedAt: new Date().toISOString(),
        verificationStatus: 'MASTER_PRODUCTION_VERIFIED',
        checksSummary: {},
      };

      const report = ProductionInvalidationEngine.invalidateOnMasterChange(run, 'Audio re-mix required');
      expect(report.invalidatedAcceptance).toBe(true);
      expect(run.masterEvidence?.verificationStatus).toBe('FAILED_VERIFICATION');
      expect(run.masterEvidence?.failureReason).toContain('Audio re-mix required');
    });
  });

  describe('ProductionError Taxonomy', () => {
    it('instantiates actionable ProductionError with sanitized message and work preservation', () => {
      const secretKey = 'AIzaSy' + '123456789012345678901234567890123';
      const err = new ProductionError({
        code: 'LIVE_PROVIDER_NOT_AUTHORIZED',
        whatHappened: `Attempted network call using ${secretKey} without explicit opt-in.`,
        workPreserved: true,
        whatToDoNext: 'Pass --live or set RUN_LIVE_PROVIDER_TESTS=true to authorize.',
      });

      expect(err.code).toBe('LIVE_PROVIDER_NOT_AUTHORIZED');
      expect(err.message).not.toContain(secretKey);
      expect(err.message).toContain('[REDACTED_GEMINI_KEY]');
      expect(err.workPreserved).toBe(true);
      expect(err.whatToDoNext).toContain('--live');
    });

    it('validates that all required Phase 19.36 error codes exist in schema', () => {
      const requiredCodes = [
        'PROVIDER_NOT_CONFIGURED',
        'LIVE_PROVIDER_NOT_AUTHORIZED',
        'PROVIDER_QUOTA_EXCEEDED',
        'PROVIDER_RATE_LIMITED',
        'PROVIDER_TIMEOUT',
        'PROVIDER_SCHEMA_INVALID',
        'FLOW_HANDOFF_REQUIRED',
        'EXTERNAL_MEDIA_REQUIRED',
        'MEDIA_NOT_FOUND',
        'MEDIA_INVALID',
        'MEDIA_STREAM_INVALID',
        'MEDIA_CHECKSUM_MISMATCH',
        'QA_REQUIRED',
        'QA_FAILED',
        'QA_STALE',
        'QA_PROVIDER_UNTRUSTED',
        'APPROVAL_REQUIRED',
        'APPROVAL_CHALLENGE_INVALID',
        'APPROVAL_CHALLENGE_EXPIRED',
        'APPROVAL_CHALLENGE_CONSUMED',
        'RETAKE_REQUIRED',
        'TIMELINE_INVALID',
        'CONTINUITY_FAILED',
        'MASTER_RENDER_FAILED',
        'MASTER_VERIFICATION_FAILED',
        'ACCEPTANCE_BUNDLE_INVALID',
      ];

      for (const code of requiredCodes) {
        expect(ProductionErrorCodeSchema).toContain(code);
      }
    });
  });
});
