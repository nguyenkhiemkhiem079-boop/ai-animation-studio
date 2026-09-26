import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { FlowBrowserOperator } from '../src/flow/flow-browser-operator.js';
import { MockFlowPage } from '../src/flow/flow-page-adapter.js';
import { ShotContract } from '../src/domain/director.js';
import { getDeterministicMp4Buffer } from '../src/media/test-media-helper.js';
import {
  ProductionCrashRecoveryManager,
  CrashRecoveryAssessment,
  InterruptionStage,
} from '../src/production-run/crash-recovery-manager.js';
import { ProductionRun } from '../src/domain/production-run.js';

describe('Phase 42 — Crash Recovery True Idempotency with Call-Count Spies', () => {
  let tempDir: string;
  let mp4Buffer: Buffer;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-recovery-spy-test-'));
    mp4Buffer = getDeterministicMp4Buffer();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestShot(id = 'SHOT_01'): ShotContract {
    return {
      id,
      sceneId: 'SC01',
      sequenceIndex: 1,
      shotNumber: 1,
      purpose: 'narrative',
      complexity: 'medium',
      rendererIntent: 'generative_full_video',
      frame: { durationSeconds: 2.0, aspectRatio: '16:9', targetFps: 24 },
      camera: { shotSize: 'medium', angle: 'eye_level', movement: 'static', focalLength: '35mm', semanticSkills: [] },
      lighting: { keyLightDirection: 'front', mood: 'dramatic', colorTemperature: 'neutral', fogAtmosphere: false },
      composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
      acting: [{
        characterId: 'CHAR_01',
        actionPrompt: 'Cinematic astronaut looking into camera',
        pose: 'standing',
        expression: 'serious',
        gazeDirection: 'direct_to_camera',
      }],
      transition: { type: 'cut', durationSeconds: 0 },
      requiredAssetIds: [],
      dependsOnShotIds: [],
      directorLocks: { locked: false, lockReason: '' },
    };
  }

  describe('Call-Count Spies & Single Submission Guarantee', () => {
    it('guarantees submit call count = exactly 1 when crash occurs mid-flight after submission', async () => {
      const mockPage = new MockFlowPage({ mockMp4Bytes: mp4Buffer });
      const submitSpy = vi.spyOn(mockPage, 'submitInstruction');
      const waitSpy = vi.spyOn(mockPage, 'waitForGeneration');
      const downloadSpy = vi.spyOn(mockPage, 'downloadAsset');

      const operator1 = new FlowBrowserOperator({
        flowPage: mockPage,
        baseOutputDir: tempDir,
        headless: true,
        autoLaunchChrome: false,
      });

      const shot = createTestShot();

      // Step 1: Simulate crash immediately after submission by having waitForGeneration fail
      waitSpy.mockRejectedValueOnce(new Error('FATAL_PROCESS_CRASH_SIMULATION'));

      const crashResult = await operator1.execute({
        projectId: 'proj_spy_idempotence',
        runId: 'run_crash_midflight_01',
        shots: [shot],
      });

      expect(crashResult.allPassed).toBe(false);
      expect(crashResult.error).toContain('FATAL_PROCESS_CRASH_SIMULATION');
      expect(crashResult.finalState).toBe('FLOW_GENERATING');

      // Verify state immediately after crash
      expect(submitSpy).toHaveBeenCalledTimes(1);
      expect(downloadSpy).toHaveBeenCalledTimes(0);

      // Verify that the checkpoint was saved on disk with the submitted ID
      const checkpointDir = path.join(tempDir, 'proj_spy_idempotence', 'run_crash_midflight_01');
      const checkpointFile = path.join(checkpointDir, 'flow-operator-checkpoint.json');
      expect(fs.existsSync(checkpointFile)).toBe(true);

      const savedCkpt = JSON.parse(fs.readFileSync(checkpointFile, 'utf-8'));
      expect(savedCkpt.submissionId).toBeDefined();
      expect(['FLOW_PROMPT_SUBMITTED', 'FLOW_GENERATING']).toContain(savedCkpt.state);

      // Step 2: Restart process - create brand new operator instance
      const operator2 = new FlowBrowserOperator({
        flowPage: mockPage,
        baseOutputDir: tempDir,
        headless: true,
        autoLaunchChrome: false,
      });

      // Resume execution
      const resumeResult = await operator2.execute({
        projectId: 'proj_spy_idempotence',
        runId: 'run_crash_midflight_01',
        shots: [shot],
      });

      // CRITICAL TRUTH INVARIANT: submitInstruction call count must remain EXACTLY 1!
      expect(submitSpy).toHaveBeenCalledTimes(1);

      // Downstream steps must have executed cleanly
      expect(resumeResult.finalState).toBe('DONE');
      expect(resumeResult.allPassed).toBe(true);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      expect(resumeResult.evidence[0].generationSubmissionCount).toBe(1);

      // Step 3: Third execution when clip is already verified on disk
      const operator3 = new FlowBrowserOperator({
        flowPage: mockPage,
        baseOutputDir: tempDir,
        headless: true,
        autoLaunchChrome: false,
      });

      const repeatResult = await operator3.execute({
        projectId: 'proj_spy_idempotence',
        runId: 'run_crash_midflight_01',
        shots: [shot],
      });

      // Still exactly 1 submission, and 0 additional downloads!
      expect(submitSpy).toHaveBeenCalledTimes(1);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      expect(repeatResult.finalState).toBe('DONE');
    });
  });

  describe('Deterministic Recovery States Assessment', () => {
    function makeBaseRun(status: any, stage: string): ProductionRun {
      return {
        schemaVersion: 1,
        revision: 1,
        runId: 'run_recovery_state_test',
        projectId: 'proj_recovery_state',
        seriesId: 'series_recovery',
        status,
        mode: 'PRODUCTION',
        pilotMode: false,
        currentStage: stage,
        completedShotIds: [],
        pendingShotIds: ['SHOT_01'],
        blockedShotIds: [],
        providerJobs: {},
        mediaEvidence: {},
        qaEvidence: {},
        approvalEvidence: {},
        resumeMetadata: { canResume: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const stateExpectations: Array<{
      status: any;
      stage: string;
      expectedStage: InterruptionStage;
      canResume: boolean;
      duplicateRisk: boolean;
      requiresOperator: boolean;
    }> = [
      {
        status: 'WAITING_FOR_PROVIDER',
        stage: 'flow_generating',
        expectedStage: 'SUBMITTED_AWAITING_PROVIDER',
        canResume: true,
        duplicateRisk: true,
        requiresOperator: false,
      },
      {
        status: 'WAITING_FOR_IMPORT',
        stage: 'provider_discovered',
        expectedStage: 'PROVIDER_ASSET_DISCOVERED',
        canResume: true,
        duplicateRisk: false,
        requiresOperator: false,
      },
      {
        status: 'RUNNING',
        stage: 'flow_downloading',
        expectedStage: 'DOWNLOADING',
        canResume: true,
        duplicateRisk: false,
        requiresOperator: false,
      },
      {
        status: 'VERIFYING_MEDIA',
        stage: 'downloaded',
        expectedStage: 'DOWNLOADED',
        canResume: true,
        duplicateRisk: false,
        requiresOperator: false,
      },
      {
        status: 'ASSEMBLING',
        stage: 'timeline_assembly',
        expectedStage: 'MEDIA_VERIFIED',
        canResume: true,
        duplicateRisk: false,
        requiresOperator: false,
      },
      {
        status: 'APPROVAL_REQUIRED',
        stage: 'approval_challenge',
        expectedStage: 'APPROVAL_REQUIRED',
        canResume: false,
        duplicateRisk: false,
        requiresOperator: true,
      },
      {
        status: 'MASTER_QA',
        stage: 'master_render',
        expectedStage: 'TIMELINE_ASSEMBLED',
        canResume: true,
        duplicateRisk: false,
        requiresOperator: false,
      },
      {
        status: 'COMPLETED',
        stage: 'completed',
        expectedStage: 'MASTER_RENDERED',
        canResume: true,
        duplicateRisk: false,
        requiresOperator: false,
      },
    ];

    for (const testCase of stateExpectations) {
      it(`deterministically maps status="${testCase.status}", stage="${testCase.stage}" to ${testCase.expectedStage}`, () => {
        const run = makeBaseRun(testCase.status, testCase.stage);
        const assessment = ProductionCrashRecoveryManager.assessRecovery(run, tempDir);

        expect(assessment.interruptionStage).toBe(testCase.expectedStage);
        expect(assessment.canSafelyResume).toBe(testCase.canResume);
        expect(assessment.duplicateSubmissionRisk).toBe(testCase.duplicateRisk);
        expect(assessment.requiresOperatorIntervention).toBe(testCase.requiresOperator);
      });
    }
  });
});
