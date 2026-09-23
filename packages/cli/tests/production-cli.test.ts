import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
import { runCli } from '../src/index.js';
import { FileSystemStorage } from '@ai-studio/core';

describe('Phase 18 — Production CLI Commands Test Suite', () => {
  let testCwd: string;
  let storage: FileSystemStorage;
  let storyFile: string;

  beforeEach(() => {
    testCwd = path.resolve('.studio', 'temp_cli_tests', `cli_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(testCwd, { recursive: true });
    storage = new FileSystemStorage(testCwd);
    storyFile = path.join(testCwd, 'test_story.txt');
    fs.writeFileSync(storyFile, 'Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testCwd)) {
      try {
        fs.rmSync(testCwd, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('runs studio production create command and initializes run', async () => {
    const exitCode = await runCli(
      ['production', 'create', storyFile, '--project', 'proj_cli_01', '--series', 'series_cli_01'],
      { cwd: testCwd, storage }
    );
    expect(exitCode).toBe(0);

    const prodDir = path.join(testCwd, '.studio', 'production', 'proj_cli_01');
    expect(fs.existsSync(prodDir)).toBe(true);

    const runDirs = fs.readdirSync(prodDir);
    expect(runDirs.length).toBeGreaterThan(0);
    const runFile = path.join(prodDir, runDirs[0], 'production-run.json');
    expect(fs.existsSync(runFile)).toBe(true);

    const runData = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
    expect(runData.status).toBe('CREATED');
    expect(runData.projectId).toBe('proj_cli_01');
  });

  it('checks status of a production run via studio production status', async () => {
    const runId = 'run_cli_status_test';
    const prodDir = path.join(testCwd, '.studio', 'production', 'proj_cli_status', runId);
    fs.mkdirSync(prodDir, { recursive: true });

    const dummyRun = {
      runId,
      projectId: 'proj_cli_status',
      seriesId: 'series_cli_status',
      status: 'NEEDS_USER_ACTION',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'waiting_for_flow',
      currentShotId: 'SHOT_SC01_SH02',
      completedShotIds: ['SHOT_SC01_SH01'],
      pendingShotIds: ['SHOT_SC01_SH02'],
      blockedShotIds: ['SHOT_SC01_SH02'],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: {
        canResume: true,
        nextAction: 'Generate clip in Google Flow',
        recommendedCommand: `studio production import ${runId} SHOT_SC01_SH02 <path>`,
      },
    };
    fs.writeFileSync(path.join(prodDir, 'production-run.json'), JSON.stringify(dummyRun, null, 2));

    const exitCode = await runCli(['production', 'status', runId], { cwd: testCwd, storage });
    expect(exitCode).toBe(0);
  });

  it('inspects durable evidence artifacts via studio production evidence', async () => {
    const runId = 'run_cli_evidence_test';
    const prodDir = path.join(testCwd, '.studio', 'production', 'proj_cli_ev', runId);
    fs.mkdirSync(prodDir, { recursive: true });

    const dummyRun = {
      runId,
      projectId: 'proj_cli_ev',
      seriesId: 'series_cli_ev',
      status: 'RUNNING',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'executing',
      completedShotIds: [],
      pendingShotIds: [],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };
    fs.writeFileSync(path.join(prodDir, 'production-run.json'), JSON.stringify(dummyRun, null, 2));
    fs.writeFileSync(path.join(prodDir, 'provider-evidence.json'), JSON.stringify([], null, 2));
    fs.writeFileSync(path.join(prodDir, 'media-evidence.json'), JSON.stringify({}, null, 2));
    fs.writeFileSync(path.join(prodDir, 'qa-evidence.json'), JSON.stringify({}, null, 2));
    fs.writeFileSync(path.join(prodDir, 'approval-evidence.json'), JSON.stringify({}, null, 2));

    const exitCode = await runCli(['production', 'evidence', runId], { cwd: testCwd, storage });
    expect(exitCode).toBe(0);
  });

  function setupApprovableRun(projectId: string, runId: string, shotId: string) {
    const prodDir = path.join(testCwd, '.studio', 'production', projectId, runId);
    fs.mkdirSync(prodDir, { recursive: true });

    const mediaDir = path.join(testCwd, '.studio', 'media');
    fs.mkdirSync(mediaDir, { recursive: true });
    const dummyVideoPath = path.join(mediaDir, `${shotId}_test.mp4`);
    const dummyContent = Buffer.from('cli dummy video content for approval testing');
    fs.writeFileSync(dummyVideoPath, dummyContent);
    const dummySha = crypto.createHash('sha256').update(dummyContent).digest('hex');

    const dummyRun = {
      runId,
      projectId,
      seriesId: `series_${projectId}`,
      status: 'NEEDS_USER_ACTION',
      mode: 'PRODUCTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'waiting_for_approval',
      currentShotId: shotId,
      completedShotIds: [],
      pendingShotIds: [shotId],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {
        [shotId]: {
          assetId: `asset_${shotId}`,
          shotId,
          sha256: dummySha,
          physicalPath: dummyVideoPath,
          format: 'mp4',
          source: 'google_flow',
          importedAt: new Date().toISOString(),
          sizeBytes: dummyContent.length,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: null,
          width: 1920,
          height: 1080,
          durationSeconds: 3.0,
          fps: 24,
          verificationTimestamp: new Date().toISOString(),
          provenance: 'google_flow_import',
          generationSource: 'GOOGLE_FLOW_REAL',
          approvalStatus: 'PENDING',
        },
      },
      qaEvidence: {
        [shotId]: {
          reportId: `qa_${shotId}`,
          shotId,
          candidateAssetId: `asset_${shotId}`,
          mediaSha256: dummySha,
          passed: true,
          overallStatus: 'PASS',
          mechanism: 'GEMINI_1_5_PRO',
          providerTrust: 'LIVE_EXTERNAL',
          isSynthetic: false,
          scores: {
            identity: 0.9,
            spatial: 0.9,
            defects: 0.05,
            overall: 0.95,
          },
          evaluatedAt: new Date().toISOString(),
        },
      },
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };

    fs.writeFileSync(path.join(prodDir, 'production-run.json'), JSON.stringify(dummyRun, null, 2));
    fs.writeFileSync(path.join(prodDir, 'media-evidence.json'), JSON.stringify(dummyRun.mediaEvidence, null, 2));
    fs.writeFileSync(path.join(prodDir, 'qa-evidence.json'), JSON.stringify(dummyRun.qaEvidence, null, 2));
    fs.writeFileSync(path.join(prodDir, 'approval-evidence.json'), JSON.stringify({}, null, 2));

    return { prodDir, dummyVideoPath, dummySha };
  }

  it('Test 7: non-TTY environment running studio production approve --human fails (returns 1)', async () => {
    const runId = 'run_cli_test_7';
    const projectId = 'proj_cli_test_7';
    const shotId = 'SHOT_TEST_7';
    setupApprovableRun(projectId, runId, shotId);

    // Ensure isTTY is falsy
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    try {
      const exitCode = await runCli(['production', 'approve', runId, shotId, '--human'], { cwd: testCwd, storage });
      expect(exitCode).toBe(1);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
    }
  });

  it('Test 8: interactive prompt without typing APPROVE aborts approval (returns 1, evidence untouched)', async () => {
    const runId = 'run_cli_test_8';
    const projectId = 'proj_cli_test_8';
    const shotId = 'SHOT_TEST_8';
    const { prodDir } = setupApprovableRun(projectId, runId, shotId);

    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    try {
      const exitCode = await runCli(['production', 'approve', runId, shotId, '--human'], {
        cwd: testCwd,
        storage,
        promptFn: async () => 'NO',
      });
      expect(exitCode).toBe(1);

      // Verify approval evidence is untouched
      const savedRun = JSON.parse(fs.readFileSync(path.join(prodDir, 'production-run.json'), 'utf-8'));
      expect(savedRun.approvalEvidence[shotId]).toBeUndefined();
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
    }
  });

  it('Test 9: interactive prompt with exact APPROVE records approvalType = HUMAN, interactive = true', async () => {
    const runId = 'run_cli_test_9';
    const projectId = 'proj_cli_test_9';
    const shotId = 'SHOT_TEST_9';
    const { prodDir } = setupApprovableRun(projectId, runId, shotId);

    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    try {
      const exitCode = await runCli(['production', 'approve', runId, shotId, '--human'], {
        cwd: testCwd,
        storage,
        promptFn: async () => 'APPROVE',
      });
      expect(exitCode).toBe(0);

      const savedRun = JSON.parse(fs.readFileSync(path.join(prodDir, 'production-run.json'), 'utf-8'));
      expect(savedRun.approvalEvidence[shotId]).toBeDefined();
      expect(savedRun.approvalEvidence[shotId].approvalType).toBe('HUMAN');
      expect(savedRun.approvalEvidence[shotId].interactive).toBe(true);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
    }
  });

  it('Test 10: running approve --automated records approvalType = AUTOMATED_TEST, interactive = false', async () => {
    const runId = 'run_cli_test_10';
    const projectId = 'proj_cli_test_10';
    const shotId = 'SHOT_TEST_10';
    const { prodDir } = setupApprovableRun(projectId, runId, shotId);

    const exitCode = await runCli(['production', 'approve', runId, shotId, '--automated'], { cwd: testCwd, storage });
    expect(exitCode).toBe(0);

    const savedRun = JSON.parse(fs.readFileSync(path.join(prodDir, 'production-run.json'), 'utf-8'));
    expect(savedRun.approvalEvidence[shotId]).toBeDefined();
    expect(savedRun.approvalEvidence[shotId].approvalType).toBe('AUTOMATED_TEST');
    expect(savedRun.approvalEvidence[shotId].interactive).toBe(false);
  });
});

