import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
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
});
