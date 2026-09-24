import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LongRunManifestManager,
  LongRunManifestSchema,
  createDefaultQuotaState,
  isDualAgentQuotaExhausted,
  GeminiEngineeringWorker,
  EngineeringTaskPacket,
} from '../src/agent-runtime/index.js';

describe('Phase 28 — Agent Runtime Continuity & Quota Management', () => {
  const testWorkspace = path.join(process.cwd(), '.studio', 'temp_agent_runtime_test');

  beforeEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  describe('Quota State Classification & Dual Exhaustion Guard', () => {
    it('creates default quota state with paid video strictly disabled', () => {
      const quota = createDefaultQuotaState();
      expect(quota.primaryAgent).toBe('AVAILABLE');
      expect(quota.paidVideoApi).toBe('DISABLED');
    });

    it('detects dual agent quota exhaustion when both primary and gemini engineering are exhausted', () => {
      const quota = createDefaultQuotaState();
      expect(isDualAgentQuotaExhausted(quota)).toBe(false);

      quota.primaryAgent = 'EXHAUSTED';
      expect(isDualAgentQuotaExhausted(quota)).toBe(false);

      quota.geminiEngineering = 'EXHAUSTED';
      expect(isDualAgentQuotaExhausted(quota)).toBe(true);
    });
  });

  describe('LongRunManifestManager Persistence & RESUME.md Contract', () => {
    it('initializes and saves manifest and generates valid RESUME.md', () => {
      const mgr = new LongRunManifestManager(testWorkspace);
      expect(mgr.manifestExists()).toBe(false);

      const manifest = mgr.initialize({
        head: 'test_head_abc123',
        currentPhase: 'PHASE_28_TEST',
        nextExactAction: 'npm run test',
        firstCommandToRun: 'npm run test',
        completedTasks: ['Task 1', 'Task 2'],
        remainingTasks: ['Task 3'],
      });

      expect(mgr.manifestExists()).toBe(true);
      expect(manifest.activeEngineeringOwner).toBe('ANTIGRAVITY');
      expect(manifest.repositoryHead).toBe('test_head_abc123');

      const loaded = mgr.loadManifest();
      expect(loaded.missionId).toBe('long-run-production-completion');
      expect(loaded.completedTasks).toHaveLength(2);

      const resumeContent = fs.readFileSync(mgr.getResumeMdPath(), 'utf8');
      expect(resumeContent).toContain('MISSION RESUME CONTRACT');
      expect(resumeContent).toContain('test_head_abc123');
      expect(resumeContent).toContain('Task 1');
      expect(resumeContent).toContain('Task 3');
      expect(resumeContent).toContain('Paid Video API');
      expect(resumeContent).toContain('STRICTLY DISABLED (FREE_ONLY)');
    });

    it('updates engineering owner without corrupting state', () => {
      const mgr = new LongRunManifestManager(testWorkspace);
      mgr.initialize({
        head: 'head_v1',
        currentPhase: 'PHASE_28',
        nextExactAction: 'step',
        firstCommandToRun: 'cmd',
      });

      const updated = mgr.updateOwner('GEMINI_FALLBACK', 'head_v2');
      expect(updated.activeEngineeringOwner).toBe('GEMINI_FALLBACK');
      expect(updated.repositoryHead).toBe('head_v2');

      const reloaded = mgr.loadManifest();
      expect(reloaded.activeEngineeringOwner).toBe('GEMINI_FALLBACK');
    });

    it('tracks quota changes and logs dual quota block events', () => {
      const mgr = new LongRunManifestManager(testWorkspace);
      mgr.initialize({
        head: 'head_v1',
        currentPhase: 'PHASE_28',
        nextExactAction: 'step',
        firstCommandToRun: 'cmd',
      });

      mgr.updateQuota({ primaryAgent: 'EXHAUSTED' });
      let loaded = mgr.loadManifest();
      expect(loaded.quotaState.primaryAgent).toBe('EXHAUSTED');
      expect(loaded.fallbackHistory.primaryAgentQuotaEvents).toBe(1);
      expect(loaded.fallbackHistory.dualQuotaBlockEvents).toBe(0);

      mgr.updateQuota({ geminiEngineering: 'EXHAUSTED' });
      loaded = mgr.loadManifest();
      expect(loaded.fallbackHistory.dualQuotaBlockEvents).toBe(1);
    });
  });

  describe('GeminiEngineeringWorker Architecture', () => {
    it('instantiates worker and checks configuration safely without leaking key', () => {
      const worker = new GeminiEngineeringWorker('dummy_test_key');
      expect(worker.isConfigured()).toBe(true);

      const unconfigured = new GeminiEngineeringWorker('');
      expect(unconfigured.isConfigured()).toBe(false);
    });

    it('throws if attempting to evaluate without key', async () => {
      const worker = new GeminiEngineeringWorker('');
      const packet: EngineeringTaskPacket = {
        missionId: 'test',
        currentPhase: 'P28',
        repositoryHead: 'head',
        objective: 'Test objective',
        relevantFiles: [],
        knownFailures: [],
        acceptanceCriteria: [],
        forbiddenChanges: [],
        testCommands: [],
        nextExactAction: 'next',
      };

      await expect(worker.evaluateTask(packet)).rejects.toThrow('GEMINI_NOT_CONFIGURED');
    });
  });
});
