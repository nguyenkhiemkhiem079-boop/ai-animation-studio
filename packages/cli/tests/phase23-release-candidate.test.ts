import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { runCli } from '../src/index.js';
import { FileSystemStorage } from '@ai-studio/core';

describe('Phase 23 — Release Candidate Diagnostics & Operator Tools', () => {
  let testCwd: string;
  let storage: FileSystemStorage;
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    testCwd = path.resolve('.studio', 'temp_cli_rc', `rc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(testCwd, { recursive: true });
    storage = new FileSystemStorage(testCwd);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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

  it('runs studio doctor and truthfully categorizes REQUIRED, OPTIONAL, and LIVE-ONLY components', async () => {
    const exitCode = await runCli(['doctor'], { cwd: testCwd, storage });
    expect(exitCode).toBe(0);

    const loggedText = logSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(loggedText).toContain('COMPONENT HEALTH & PRODUCTION READINESS AUDIT');
    expect(loggedText).toContain('[REQUIRED — Local Media & Execution Foundation]');
    expect(loggedText).toContain('Node.js Runtime');
    expect(loggedText).toContain('FFmpeg');
    expect(loggedText).toContain('FFprobe');
    expect(loggedText).toContain('[OPTIONAL — External Workspace & Browser Support]');
    expect(loggedText).toContain('Google Flow');
    expect(loggedText).toContain('MANUAL WORKSPACE');
    expect(loggedText).toContain('[LIVE-ONLY — External Providers (Opt-In)]');
    expect(loggedText).toContain('Gemini API Key');
    expect(loggedText).toContain('NOT TESTED');
    // Crucial truthful assertion: does not claim 100% production verified
    expect(loggedText).not.toContain('100% healthy and ready for real production media rendering');
    expect(loggedText).toContain('VERDICT: LOCAL MEDIA TOOLCHAIN READY FOR OFFLINE REHEARSAL');
  });

  it('outputs machine-readable redacted JSON for studio production status --json', async () => {
    const runId = 'run_status_json_test';
    const prodDir = path.join(testCwd, '.studio', 'production', 'proj_json_status', runId);
    fs.mkdirSync(prodDir, { recursive: true });

    const dummyRun = {
      runId,
      projectId: 'proj_json_status',
      seriesId: 'series_json_status',
      status: 'NEEDS_USER_ACTION',
      mode: 'PRODUCTION',
      schemaVersion: 1,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'waiting_for_flow',
      currentShotId: 'SHOT_01',
      completedShotIds: [],
      pendingShotIds: ['SHOT_01'],
      blockedShotIds: ['SHOT_01'],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: {
        canResume: true,
        nextAction: 'Generate clip in Google Flow',
        recommendedCommand: `studio production import ${runId} SHOT_01 <path>`,
      },
    };
    fs.writeFileSync(path.join(prodDir, 'production-run.json'), JSON.stringify(dummyRun, null, 2));

    const exitCode = await runCli(['production', 'status', runId, '--json'], { cwd: testCwd, storage });
    expect(exitCode).toBe(0);

    const loggedOutput = logSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(loggedOutput).toContain(runId);
    const parsed = JSON.parse(loggedOutput.trim());
    expect(parsed.runId).toBe(runId);
    expect(parsed.projectId).toBe('proj_json_status');
    expect(parsed.status).toBe('NEEDS_USER_ACTION');
    expect(parsed.nextAction).toBeDefined();
    expect(Array.isArray(parsed.stepMatrix)).toBe(true);
  });

  it('outputs machine-readable redacted JSON for studio production evidence --json', async () => {
    const runId = 'run_evidence_json_test';
    const prodDir = path.join(testCwd, '.studio', 'production', 'proj_json_ev', runId);
    const evDir = path.join(prodDir, 'evidence');
    fs.mkdirSync(evDir, { recursive: true });

    const dummyRun = {
      runId,
      projectId: 'proj_json_ev',
      seriesId: 'series_json_ev',
      status: 'RUNNING',
      mode: 'PRODUCTION',
      schemaVersion: 1,
      revision: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'executing',
      completedShotIds: [],
      pendingShotIds: ['SHOT_01'],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };
    fs.writeFileSync(path.join(prodDir, 'production-run.json'), JSON.stringify(dummyRun, null, 2));
    fs.writeFileSync(path.join(prodDir, 'media-evidence.json'), JSON.stringify({
      SHOT_01: {
        shotId: 'SHOT_01',
        assetId: 'ASSET_01',
        sha256: 'a'.repeat(64),
        container: 'mp4',
        width: 1920,
        height: 1080,
        durationSeconds: 3.5,
        videoCodec: 'h264',
        provenance: 'Simulated Flow',
        recordedAt: new Date().toISOString(),
        verificationTimestamp: new Date().toISOString(),
        generationSource: 'SIMULATED_FLOW',
        physicalPath: 'dummy.mp4',
        sizeBytes: 1024,
      }
    }));

    const exitCode = await runCli(['production', 'evidence', runId, '--json'], { cwd: testCwd, storage });
    expect(exitCode).toBe(0);

    const loggedOutput = logSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    const parsed = JSON.parse(loggedOutput.trim());
    expect(parsed.runId).toBe(runId);
    expect(parsed.projectId).toBe('proj_json_ev');
    expect(parsed.media.SHOT_01.assetId).toBe('ASSET_01');
    expect(parsed.media.SHOT_01.sha256).toBe('a'.repeat(64));
  });

  it('exports sanitized evidence bundle without secrets via studio production export-evidence', async () => {
    const runId = 'run_export_evidence_test';
    const prodDir = path.join(testCwd, '.studio', 'production', 'proj_export', runId);
    fs.mkdirSync(prodDir, { recursive: true });

    // Include an artificial secret in provider evidence to prove redaction
    const dummyProvider = [
      {
        providerId: 'gemini-test',
        providerRole: 'VISION_QA',
        status: 'FAILED',
        error: 'Authentication failed for key AIzaSyFakeApiKeySecret123456789012345678',
        requestedUrl: 'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyFakeApiKeySecret123456789012345678',
        headers: {
          Authorization: 'Bearer secret_access_token_1234567890abcdef',
        },
      }
    ];

    const dummyRun = {
      runId,
      projectId: 'proj_export',
      seriesId: 'series_export',
      status: 'WAITING_FOR_PROVIDER',
      mode: 'PRODUCTION',
      schemaVersion: 1,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'qa_review',
      completedShotIds: [],
      pendingShotIds: ['SHOT_01'],
      blockedShotIds: ['SHOT_01'],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: { canResume: true },
    };

    fs.writeFileSync(path.join(prodDir, 'production-run.json'), JSON.stringify(dummyRun, null, 2));
    fs.writeFileSync(path.join(prodDir, 'provider-evidence.json'), JSON.stringify(dummyProvider, null, 2));

    const exportDest = path.join(testCwd, 'exported_evidence_dir');
    const exitCode = await runCli(['production', 'export-evidence', runId, exportDest], { cwd: testCwd, storage });
    expect(exitCode).toBe(0);

    expect(fs.existsSync(exportDest)).toBe(true);
    const exportedRunJson = path.join(exportDest, 'production-run.json');
    const exportedProvJson = path.join(exportDest, 'provider-evidence.json');
    expect(fs.existsSync(exportedRunJson)).toBe(true);
    expect(fs.existsSync(exportedProvJson)).toBe(true);

    const exportedProvContent = fs.readFileSync(exportedProvJson, 'utf-8');
    // Secret must be strictly redacted
    expect(exportedProvContent).not.toContain('AIzaSyFakeApiKeySecret123456789012345678');
    expect(exportedProvContent).not.toContain('secret_access_token_1234567890abcdef');
    expect(exportedProvContent).toContain('[REDACTED_GEMINI_KEY]');
    expect(exportedProvContent).toContain('Bearer [REDACTED_TOKEN]');
  });

  it('enforces automation-friendly exit codes', async () => {
    // Missing runId
    const missingRunCode = await runCli(['production', 'status'], { cwd: testCwd, storage });
    expect(missingRunCode).toBe(1);

    // Non-existent runId
    const notFoundCode = await runCli(['production', 'status', 'run_non_existent'], { cwd: testCwd, storage });
    expect(notFoundCode).toBe(1);

    // Unknown subcommand
    const unknownCode = await runCli(['production', 'fictional-command'], { cwd: testCwd, storage });
    expect(unknownCode).toBe(1);

    // Missing story file in create
    const missingStoryCode = await runCli(['production', 'create'], { cwd: testCwd, storage });
    expect(missingStoryCode).toBe(1);
  });
});
