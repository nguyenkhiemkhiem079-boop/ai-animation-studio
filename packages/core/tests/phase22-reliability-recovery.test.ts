import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  EvidenceStore,
  ProductionRunRepository,
  redactSecrets,
  CorruptedEvidenceError,
} from '../src/index.js';
import { ProductionSafetyError } from '../src/domain/execution-mode.js';
import { ShotPlanner, DEFAULT_DIRECTOR_PROFILE } from '../src/director/shot-planner.js';

describe('Phase 22 — Reliability, Recovery, Concurrency & Stale Evidence Handling', () => {
  const testDir = path.resolve('.studio/temp_phase22_reliability');
  let storage: FileSystemStorage;
  let assetRegistry: FileSystemAssetRegistry;
  let evidenceStore: EvidenceStore;
  let repository: ProductionRunRepository;
  let orchestrator: ProductionOrchestrator;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    assetRegistry = new FileSystemAssetRegistry(storage);
    evidenceStore = new EvidenceStore(storage);
    repository = new ProductionRunRepository(storage);
    orchestrator = new ProductionOrchestrator(storage, assetRegistry);
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

  describe('22.1: Concurrent Run Isolation', () => {
    it('isolates multiple concurrent runs across different projects and within the same project', async () => {
      // Create Run A in Project A
      const runA = await orchestrator.createRun({
        projectId: 'proj_alpha',
        seriesId: 'series_01',
        rawScript: 'SCENE 1 - ALPHA - DAY\nAlpha shot.\n',
      });

      // Create Run B in Project A (concurrent run in same project)
      const runB = await orchestrator.createRun({
        projectId: 'proj_alpha',
        seriesId: 'series_01',
        rawScript: 'SCENE 1 - ALPHA - DAY\nAlpha shot two.\n',
      });

      // Create Run C in Project B (different project)
      const runC = await orchestrator.createRun({
        projectId: 'proj_beta',
        seriesId: 'series_02',
        rawScript: 'SCENE 1 - BETA - NIGHT\nBeta shot.\n',
      });

      expect(runA.runId).not.toBe(runB.runId);
      expect(runA.runId).not.toBe(runC.runId);

      const alphaRuns = await repository.listRuns('proj_alpha');
      const betaRuns = await repository.listRuns('proj_beta');

      expect(alphaRuns).toHaveLength(2);
      expect(alphaRuns.map((r) => r.runId)).toContain(runA.runId);
      expect(alphaRuns.map((r) => r.runId)).toContain(runB.runId);
      expect(alphaRuns.map((r) => r.runId)).not.toContain(runC.runId);

      expect(betaRuns).toHaveLength(1);
      expect(betaRuns[0].runId).toBe(runC.runId);

      // Verify directory structure isolation
      expect(await storage.exists(`.studio/production/proj_alpha/${runA.runId}/production-run.json`)).toBe(true);
      expect(await storage.exists(`.studio/production/proj_alpha/${runB.runId}/production-run.json`)).toBe(true);
      expect(await storage.exists(`.studio/production/proj_beta/${runC.runId}/production-run.json`)).toBe(true);
    });
  });

  describe('22.2 & 22.3: Revision Counters & Stale Write Detection', () => {
    it('detects concurrency conflict when updating with a stale revision', async () => {
      const run = await orchestrator.createRun({
        projectId: 'proj_concurrency',
        seriesId: 'series_01',
        rawScript: 'SCENE 1 - LAB - DAY\nAction.\n',
      });

      expect(run.revision).toBe(1);

      // Process 1 reads run (revision 1)
      const process1Run = (await repository.findById('proj_concurrency', run.runId))!;
      expect(process1Run.revision).toBe(1);

      // Process 2 reads run (revision 1) and updates it to revision 2
      const process2Run = (await repository.findById('proj_concurrency', run.runId))!;
      process2Run.revision = 2;
      process2Run.currentStage = 'process_2_stage';
      await repository.save(process2Run);

      // Process 1 attempts to save expecting revision 1, but disk is now revision 2!
      process1Run.currentStage = 'process_1_stale_stage';
      await expect(
        repository.save(process1Run, { expectedRevision: 1 })
      ).rejects.toThrow(/CONCURRENCY CONFLICT/);

      // Confirm disk was NOT overwritten by stale write
      const authoritative = (await repository.findById('proj_concurrency', run.runId))!;
      expect(authoritative.currentStage).toBe('process_2_stage');
      expect(authoritative.revision).toBe(2);
    });
  });

  describe('22.4: Cancellation Semantics', () => {
    it('cancels active run legally, preserves evidence, and marks unresumable', async () => {
      const run = await orchestrator.createRun({
        projectId: 'proj_cancel_test',
        seriesId: 'series_01',
        rawScript: 'SCENE 1 - DECK - NIGHT\nAction.\n',
      });

      const cancelledRun = await orchestrator.cancelRun('proj_cancel_test', run.runId, 'Operator clicked abort');
      expect(cancelledRun.status).toBe('CANCELLED');
      expect(cancelledRun.resumeMetadata.canResume).toBe(false);
      expect(cancelledRun.resumeMetadata.blockedReason).toContain('Operator clicked abort');

      // Re-reading from disk confirms state is durable
      const onDisk = await repository.findById('proj_cancel_test', run.runId);
      expect(onDisk?.status).toBe('CANCELLED');
      expect(onDisk?.resumeMetadata.canResume).toBe(false);

      // Source story still preserved
      const story = await storage.read(`.studio/production/proj_cancel_test/${run.runId}/source_story.txt`);
      expect(story).toContain('SCENE 1 - DECK - NIGHT');
    });

    it('rejects cancelling a completed run', async () => {
      const run = await orchestrator.createRun({
        projectId: 'proj_completed_cancel',
        seriesId: 'series_01',
        rawScript: 'SCENE 1 - DECK - NIGHT\nAction.\n',
      });

      run.status = 'COMPLETED';
      await repository.save(run);

      await expect(
        orchestrator.cancelRun('proj_completed_cancel', run.runId)
      ).rejects.toThrow(ProductionSafetyError);
    });
  });

  describe('22.9: Corrupted JSON Recovery', () => {
    it('fails loudly and safely with CorruptedEvidenceError on truncated or malformed files', async () => {
      const run = await orchestrator.createRun({
        projectId: 'proj_corrupt_test',
        seriesId: 'series_01',
        rawScript: 'SCENE 1 - LAB - DAY\nAction.\n',
      });

      // Deliberately write corrupted/truncated JSON to production-run.json
      const runPath = `.studio/production/proj_corrupt_test/${run.runId}/production-run.json`;
      await storage.write(runPath, '{"runId": "proj_corrupt_test", "status": "RUNN');

      await expect(
        evidenceStore.loadProductionRun('proj_corrupt_test', run.runId)
      ).rejects.toThrow(CorruptedEvidenceError);

      // Deliberately write corrupted JSON to media-evidence.json
      const mediaPath = `.studio/production/proj_corrupt_test/${run.runId}/media-evidence.json`;
      await storage.write(mediaPath, '{ not valid json syntax }}}');

      await expect(
        evidenceStore.loadMediaEvidence('proj_corrupt_test', run.runId)
      ).rejects.toThrow(CorruptedEvidenceError);
    });
  });

  describe('22.17: Error & Secret Redaction', () => {
    it('redacts Gemini API keys, Bearer tokens, and URL parameters from logs and errors', () => {
      const sampleError = new Error(
        'Request failed with key=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q and header "Bearer eyJhbGciOiJIUzI1NiJ9"'
      );

      const redacted = redactSecrets(sampleError);
      expect(redacted).not.toContain('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q');
      expect(redacted).toContain('[REDACTED_GEMINI_KEY]');
      expect(redacted).toContain('Bearer [REDACTED_TOKEN]');

      // Test payload object
      const payload = {
        apiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta?key=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q',
      };
      const redactedObj = redactSecrets(payload);
      expect(redactedObj).not.toContain('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q');
      expect(redactedObj).toContain('[REDACTED]');
    });
  });

  describe('22.19: Scale Sanity Test', () => {
    it('plans a 20-shot production sequence linearly without pathological slowdown', () => {
      const planner = new ShotPlanner(DEFAULT_DIRECTOR_PROFILE);
      const beats = Array.from({ length: 20 }, (_, idx) => ({
        id: `beat_${idx + 1}`,
        index: idx,
        summary: `Action beat for shot ${idx + 1}`,
        involvedCharacterIds: ['char_lead'],
        sourceTrace: {
          documentId: 'doc_01',
          segmentIndex: 0,
          charStart: 0,
          charEnd: 10,
          contentHash: 'hash_test',
        },
      }));

      const scene = {
        id: 'SCENE_01',
        sceneNumber: 1,
        heading: 'INT. COMMAND DECK - DAY',
        timeOfDay: 'day' as const,
        locationName: 'Command Deck',
        charactersPresent: ['char_lead'],
        beats,
        dialogueLines: [],
        narrationLines: [],
        sourceTrace: [],
      };

      const start = Date.now();
      const planned = planner.planScene(scene, 'proj_perf');
      const elapsedMs = Date.now() - start;

      // 1 establishing shot + 20 narrative beat shots = 21 planned shots
      expect(planned.productionScene.shots).toHaveLength(21);
      expect(Object.keys(planned.dependencyGraph.adjacencyList)).toHaveLength(21);
      expect(elapsedMs).toBeLessThan(1000);
    });
  });
});
