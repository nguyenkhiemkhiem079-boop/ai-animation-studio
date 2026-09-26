import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import {
  ProductionCrashRecoveryManager,
  CrashRecoveryAssessment,
} from '../src/production-run/crash-recovery-manager.js';
import { ProductionRun, ProductionRunStatus } from '../domain/production-run.js';
import { FlowBrowserOperator } from '../src/flow/flow-browser-operator.js';
import { MockFlowPage } from '../src/flow/flow-page-adapter.js';
import { ShotContract } from '../domain/director.js';
import { getDeterministicMp4Buffer } from '../src/media/test-media-helper.js';

describe('Phase 31: Production Crash Recovery & Resume Hardening', () => {
  const scratchDir = path.resolve(process.cwd(), '.studio', 'scratch', 'test_crash_recovery');

  beforeEach(async () => {
    await fs.mkdir(scratchDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(scratchDir, { recursive: true, force: true });
    } catch {}
  });

  it('correctly assesses interruption when crashed while in-flight with provider (anti-duplicate guard)', () => {
    const run: ProductionRun = {
      schemaVersion: 1,
      revision: 1,
      runId: 'run_crash_inflight',
      projectId: 'proj_crash_test',
      seriesId: 'series_crash_test',
      status: 'WAITING_FOR_PROVIDER',
      mode: 'PRODUCTION',
      pilotMode: false,
      currentStage: 'flow_generating',
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

    const assessment = ProductionCrashRecoveryManager.assessRecovery(run, scratchDir);

    expect(assessment.interruptionStage).toBe('SUBMITTED_AWAITING_PROVIDER');
    expect(assessment.duplicateSubmissionRisk).toBe(true);
    expect(assessment.canSafelyResume).toBe(true);
    expect(assessment.recommendedAction).toContain('DO NOT issue duplicate submission');
  });

  it('detects corrupted or 0-byte video files and separates them from valid clips', async () => {
    const shot1Dir = path.join(scratchDir, 'SHOT_01');
    const shot2Dir = path.join(scratchDir, 'SHOT_02');
    await fs.mkdir(shot1Dir, { recursive: true });
    await fs.mkdir(shot2Dir, { recursive: true });

    // SHOT_01: write a 0-byte corrupted file
    await fs.writeFile(path.join(shot1Dir, 'clip.mp4'), '');

    // SHOT_02: copy existing known-good live clip if available, or write a dummy text file
    // Text file masquerading as mp4 will fail ArtifactVerifier.verifyVideo
    await fs.writeFile(path.join(shot2Dir, 'clip.mp4'), '<html>Not a video</html>');

    const run: ProductionRun = {
      schemaVersion: 1,
      revision: 1,
      runId: 'run_corrupt_test',
      projectId: 'proj_corrupt',
      seriesId: 'series_corrupt',
      status: 'VERIFYING_MEDIA',
      mode: 'PRODUCTION',
      pilotMode: false,
      currentStage: 'media_verification',
      completedShotIds: [],
      pendingShotIds: ['SHOT_01', 'SHOT_02'],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const assessment = ProductionCrashRecoveryManager.assessRecovery(run, scratchDir);

    expect(assessment.corruptedShotIds).toContain('SHOT_01');
    expect(assessment.corruptedShotIds).toContain('SHOT_02');
    expect(assessment.reusableShotIds.length).toBe(0);

    // Clean corrupted files
    ProductionCrashRecoveryManager.cleanCorruptedArtifacts(assessment.corruptedShotIds, scratchDir);
    expect(syncFs.existsSync(path.join(shot1Dir, 'clip.mp4'))).toBe(false);
    expect(syncFs.existsSync(path.join(shot2Dir, 'clip.mp4'))).toBe(false);
  });

  it('guarantees idempotence: resuming an in-flight Flow run does not submit twice', async () => {
    const knownClip = path.resolve(
      process.cwd(),
      '.studio',
      'production',
      'project_flow_real',
      'run_1790328582248',
      'SHOT_SC01_SH01',
      'clip.mp4'
    );
    const mockMp4Bytes = syncFs.existsSync(knownClip)
      ? syncFs.readFileSync(knownClip)
      : getDeterministicMp4Buffer();

    const mockPage = new MockFlowPage({ mockMp4Bytes });

    const operator = new FlowBrowserOperator({
      flowPage: mockPage,
      baseOutputDir: scratchDir,
      headless: true,
      autoLaunchChrome: false,
    });

    const dummyShot: ShotContract = {
      id: 'SHOT_SC01_SH01',
      sceneId: 'SC01',
      sequenceIndex: 1,
      frame: { durationSeconds: 3 },
      camera: {
        movement: 'static',
        shotSize: 'medium',
      },
      acting: [
        {
          characterId: 'CHAR_01',
          actionPrompt: 'A quiet futuristic laboratory, static camera, cinematic ambient lighting.',
        },
      ],
      directorNotes: {
        coverage: 'Medium',
        emotionalBeat: 'Calm',
        cinematicSkill: 'Classic',
      },
      visualElements: [],
      audioElements: [],
      continuityRequirements: [],
      sourceTraceability: {
        narrativeBeatId: 'BEAT_01',
        sourceTextHash: 'dummy_hash',
      },
      promptEngineering: {
        compiledPromptText: 'A quiet futuristic laboratory, static camera, cinematic ambient lighting.',
      },
    };

    // First execution: normal run
    const res1 = await operator.execute({
      projectId: 'proj_idempotence_test',
      runId: 'run_idempotence_01',
      shots: [dummyShot],
    });

    expect(res1.finalState).toBe('DONE');
    expect(mockPage.submittedInstructions.length).toBe(1);

    // Second execution with SAME runId: should recognize verified clip on disk and NOT call submitInstruction again!
    const res2 = await operator.execute({
      projectId: 'proj_idempotence_test',
      runId: 'run_idempotence_01',
      shots: [dummyShot],
    });

    expect(res2.finalState).toBe('DONE');
    expect(mockPage.submittedInstructions.length).toBe(1); // STILL EXACTLY 1! No second submission!
  });
});
