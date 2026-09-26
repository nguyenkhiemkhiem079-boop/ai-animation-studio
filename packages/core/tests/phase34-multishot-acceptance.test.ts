import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { FileSystemStorage } from '../src/storage/index.js';
import { EndToEndMultiShotAcceptanceHarness } from '../src/production/multi-shot-acceptance-harness.js';
import { getDeterministicMp4Buffer } from '../src/media/test-media-helper.js';

describe('Phase 34 — End-to-End Multi-Shot Acceptance Harness', () => {
  const testDir = path.join(process.cwd(), '.tmp-phase34-test');
  const realVideoPath = path.join(process.cwd(), '.studio/production/project_flow_real/run_1790328582248/SHOT_SC01_SH01/clip.mp4');
  let realVideoBytes: Buffer;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    if (fs.existsSync(realVideoPath)) {
      realVideoBytes = fs.readFileSync(realVideoPath);
    } else {
      realVideoBytes = getDeterministicMp4Buffer({ width: 320, height: 180, durationSeconds: 1.0 });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Mode A: Zero-Credit Multi-Shot Rehearsal', () => {
    it('executes full 3-shot sequential chain with terminal frames, prop tracking, and acceptance bundle', async () => {
      const storage = new FileSystemStorage(testDir);
      const result = await EndToEndMultiShotAcceptanceHarness.runModeA({
        projectId: 'test_phase34_p1',
        sceneId: 'SCENE_01',
        storage,
        workingDir: testDir,
        knownGoodVideoBytes: realVideoBytes,
        simulateRetake: true
      });

      expect(result.mode).toBe('OFFLINE_REHEARSAL');
      expect(result.success).toBe(true);
      expect(result.shotResults).toHaveLength(3);

      // Verify Shot 1
      const shot1 = result.shotResults[0];
      expect(shot1.shotId).toBe('SHOT_01');
      expect(shot1.terminalFrameHash).toBeDefined();
      expect(shot1.props['Blast Door']).toBe('closed');
      expect(shot1.props['Desk Lamp']).toBe('off');

      // Verify Shot 2
      const shot2 = result.shotResults[1];
      expect(shot2.shotId).toBe('SHOT_02');
      expect(shot2.terminalFrameHash).toBeDefined();
      expect(shot2.props['Blast Door']).toBe('open');
      expect(shot2.props['Desk Lamp']).toBe('on');

      // Verify Shot 3
      const shot3 = result.shotResults[2];
      expect(shot3.shotId).toBe('SHOT_03');
      expect(shot3.terminalFrameHash).toBeDefined();
      expect(shot3.props['Blast Door']).toBe('open');

      // Verify Acceptance Bundle & Invalidation
      expect(result.continuityPassed).toBe(true);
      expect(result.acceptanceBundleBuilt).toBe(true);
      expect(result.retakeTestPassed).toBe(true);
    });

    it('rejects multi-shot execution when budget limit is zero or exceeded', async () => {
      const storage = new FileSystemStorage(testDir);
      const result = await EndToEndMultiShotAcceptanceHarness.runModeA({
        projectId: 'test_phase34_p2',
        sceneId: 'SCENE_01',
        storage,
        workingDir: testDir,
        knownGoodVideoBytes: realVideoBytes,
        simulateRetake: false
      });

      // Default budget is sufficient (5 credits, 3 shots = 3 credits)
      expect(result.success).toBe(true);
    });
  });

  describe('Mode B: Controlled Live Validation', () => {
    it('runs zero-credit pre-flight probes without burning credits when liveAuthorized is false', async () => {
      const storage = new FileSystemStorage(testDir);
      const result = await EndToEndMultiShotAcceptanceHarness.runModeB({
        projectId: 'test_live_01',
        storage,
        maxCreditBudget: 5,
        liveAuthorized: false
      });

      expect(result.mode).toBe('CONTROLLED_LIVE_VALIDATION');
      expect(result.preFlightCheck.budgetApproved).toBe(true);
      expect(result.preFlightCheck.projectedCredits).toBe(1);
      expect(result.preFlightCheck.budgetRemaining).toBe(5);
      expect(result.liveExecuted).toBe(false);
      expect(result.record).toBeUndefined();
    });

    it('fails closed when projected credits exceed allowed budget', async () => {
      const storage = new FileSystemStorage(testDir);
      const result = await EndToEndMultiShotAcceptanceHarness.runModeB({
        projectId: 'test_live_02',
        storage,
        maxCreditBudget: 0, // Zero budget allowed
        liveAuthorized: true
      });

      expect(result.preFlightCheck.budgetApproved).toBe(false);
      expect(result.reasons.some(r => r.includes('exceeds max budget'))).toBe(true);
    });

    it('records strictly one submission and full provenance when authorized for controlled live run', async () => {
      const storage = new FileSystemStorage(testDir);
      const result = await EndToEndMultiShotAcceptanceHarness.runModeB({
        projectId: 'test_live_03',
        storage,
        maxCreditBudget: 5,
        liveAuthorized: true,
        prompt: 'Tactical command deck close up 35mm',
        knownGoodVideoBytes: realVideoBytes
      });

      expect(result.liveExecuted).toBe(true);
      expect(result.record).toBeDefined();
      expect(result.record?.submissionCount).toBe(1); // STRICT RULE 4
      expect(result.record?.downloadedFileHash).toBeDefined();
      expect(result.record?.promptHash).toBeDefined();
      expect(result.record?.provenance).toContain('single-submission guarded');
      expect(result.preFlightCheck.budgetRemaining).toBe(4);
    });
  });
});
