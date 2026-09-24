import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  FileSystemStorage,
  FileSystemAssetRegistry,
  UniverseManager,
  WorldStateTracker,
  ContinuationEngine,
  DirectorQA,
  DEFAULT_DIRECTOR_PROFILE,
  ShotContract,
  ProductionOrchestrator,
  BudgetController,
  ProductionAcceptanceBundle,
  ProductionMasterVerifier,
  DeterministicOfflineLLMDouble,
  EvidenceStore,
  MediaToolchainDoctor,
} from '../src/index.js';
import { ContinuityError } from '../src/errors/index.js';
import { ProductionSafetyError } from '../src/domain/execution-mode.js';

describe('Phase 21 — Multi-Shot Production Contracts & Deep Invariants', () => {
  const testDir = path.resolve('.studio/temp_phase21_deep_contracts');
  let storage: FileSystemStorage;
  let assetRegistry: FileSystemAssetRegistry;
  let universeManager: UniverseManager;
  let worldStateTracker: WorldStateTracker;
  let evidenceStore: EvidenceStore;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    assetRegistry = new FileSystemAssetRegistry(storage);
    universeManager = new UniverseManager(storage);
    worldStateTracker = new WorldStateTracker(universeManager);
    evidenceStore = new EvidenceStore(storage);
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

  describe('21.2: Multi-Shot DAG & Shot Ordering', () => {
    it('detects circular dependencies in multi-shot DAG and flags errors in DirectorQA', () => {
      const shots: any[] = [
        {
          id: 'SHOT_01',
          sceneId: 'SCENE_01',
          sequence: 1,
          frame: { durationSeconds: 3, aspectRatio: '16:9', targetFps: 24 },
          camera: { shotSize: 'wide', angle: 'eye_level', movement: 'static' },
          lighting: { timeOfDay: 'night', mood: 'tense', colorTemperature: 'neutral' },
          acting: [{ characterId: 'char_kaito', actionPrompt: 'enters room', gazeDirection: 'screen_right' }],
          dialogue: [],
          soundDesign: [],
          renderTier: 'deterministic_hyperframes',
          estimatedDurationSeconds: 3,
          dependsOnShotIds: ['SHOT_02'], // Cycle! SHOT_01 depends on SHOT_02
        },
        {
          id: 'SHOT_02',
          sceneId: 'SCENE_01',
          sequence: 2,
          frame: { durationSeconds: 4, aspectRatio: '16:9', targetFps: 24 },
          camera: { shotSize: 'close_up', angle: 'eye_level', movement: 'pan_right' },
          lighting: { timeOfDay: 'night', mood: 'tense', colorTemperature: 'neutral' },
          acting: [{ characterId: 'char_kaito', actionPrompt: 'looks down', gazeDirection: 'screen_left' }],
          dialogue: [],
          soundDesign: [],
          renderTier: 'deterministic_hyperframes',
          estimatedDurationSeconds: 4,
          dependsOnShotIds: ['SHOT_01'], // Cycle! SHOT_02 depends on SHOT_01
        },
      ];

      const scene = {
        id: 'SCENE_01',
        sceneId: 'SCENE_01',
        sceneName: 'Command Deck',
        scriptExcerpt: 'Alarms pulse in amber waves',
        shots,
      };

      const cyclicGraph = {
        nodes: ['SHOT_01', 'SHOT_02'],
        edges: [
          { from: 'SHOT_02', to: 'SHOT_01' },
          { from: 'SHOT_01', to: 'SHOT_02' },
        ],
        adjacencyList: {
          SHOT_01: ['SHOT_02'],
          SHOT_02: ['SHOT_01'],
        },
      };

      const report = DirectorQA.evaluateScene(scene as any, cyclicGraph, DEFAULT_DIRECTOR_PROFILE);
      expect(report.isValid).toBe(false);
      expect(report.dependencyErrors).toContain('Circular dependency detected in ShotDependencyGraph');
    });
  });

  describe('21.3: Continuation Frame Contracts', () => {
    it('builds typed continuation packet chaining terminal frame and calculating subject/lighting continuity', () => {
      const engine = new ContinuationEngine();
      const shotA: ShotContract = {
        id: 'SHOT_01',
        sceneId: 'SCENE_01',
        sequence: 1,
        camera: { shotSize: 'medium', angle: 'eye_level', movement: 'static' },
        lighting: { timeOfDay: 'day', mood: 'mysterious', colorTemperature: 5600 },
        acting: [{ characterId: 'char_thorne', actionPrompt: 'reaches forward', gazeDirection: 'screen_right' }],
        dialogue: [],
        soundDesign: [],
        renderTier: 'generative_video',
        estimatedDurationSeconds: 4,
        dependsOnShotIds: [],
      };

      const shotB: ShotContract = {
        id: 'SHOT_02',
        sceneId: 'SCENE_01',
        sequence: 2,
        camera: { shotSize: 'close_up', angle: 'eye_level', movement: 'static' },
        lighting: { timeOfDay: 'day', mood: 'mysterious', colorTemperature: 5600 },
        acting: [{ characterId: 'char_thorne', actionPrompt: 'grasps artifact', gazeDirection: 'screen_right' }],
        dialogue: [],
        soundDesign: [],
        renderTier: 'generative_video',
        estimatedDurationSeconds: 3,
        dependsOnShotIds: ['SHOT_01'],
      };

      const packet = engine.buildContinuationPacket(shotA, shotB);
      expect(packet.precedingShotId).toBe('SHOT_01');
      expect(packet.targetShotId).toBe('SHOT_02');
      expect(packet.terminalFrameAssetId).toBe('FRAME_TERMINAL_SHOT_01');
      expect(packet.cutType).toBe('match_cut');
      expect(packet.lightingPreserved).toBe(true);
      expect(packet.subjectState?.characterId).toBe('char_thorne');
      expect(packet.antiBleedDirectives.length).toBeGreaterThan(0);
    });
  });

  describe('21.4, 21.5, 21.6: Character, Location, and Prop Continuity Across Shots', () => {
    it('tracks prop persistence and character location transitions across sequential shots', async () => {
      const seriesId = 'series_prop_test';
      const universe = await universeManager.getOrCreateUniverse(seriesId);

      const now = new Date().toISOString();
      // Add character, location, and prop to universe
      universe.characters['char_kaito'] = {
        id: 'char_kaito',
        seriesId,
        name: 'Kaito',
        description: 'Lead astronaut',
        visualAnchorPrompt: 'Young astronaut in navy flight suit',
        aliases: [],
        traits: ['observant'],
        currentVersion: 1,
        versions: [],
        outfits: [],
        createdAt: now,
        updatedAt: now,
      };

      universe.locations['loc_lab'] = {
        id: 'loc_lab',
        seriesId,
        name: 'Research Lab',
        aliases: [],
        description: 'High-tech subterranean lab',
        zones: [{ id: 'workbench', name: 'Main Workbench', description: 'Central metal bench', keyProps: [] }],
        lightingPresets: {},
        canonicalAssetIds: [],
        createdAt: now,
        updatedAt: now,
      };

      universe.props['prop_crystal'] = {
        id: 'prop_crystal',
        seriesId,
        name: 'Resonant Crystal',
        aliases: [],
        description: 'Glowing blue crystal',
        visualPrompt: 'Glowing cyan crystal in metallic casing',
        isCanonical: true,
        canonicalAssetIds: [],
      };

      universe.currentWorldState.propHolders['prop_crystal'] = 'loc_lab';
      universe.currentWorldState.characterLocations['char_kaito'] = {
        locationId: 'loc_lab',
        zoneId: 'workbench',
        status: 'active',
      };
      await universeManager.saveUniverse(universe);

      // Shot 1: verify initial state
      const state1 = await worldStateTracker.getCurrentWorldState(seriesId);
      expect(state1.propHolders['prop_crystal']).toBe('loc_lab');

      // Shot 2: Kaito picks up crystal
      const state2 = await worldStateTracker.applyTransition(seriesId, {
        trigger: 'Kaito picks up resonant crystal from workbench',
        changes: {
          characterMovements: [],
          propTransfers: [{ propId: 'prop_crystal', fromHolder: 'loc_lab', toHolder: 'char_kaito' }],
          factsAdded: ['Crystal is charged'],
          factsRemoved: [],
        },
      });

      expect(state2.propHolders['prop_crystal']).toBe('char_kaito');
      expect(state2.worldFacts).toContain('Crystal is charged');

      // Shot 3: Attempt illegal prop transfer to non-existent holder -> throws ContinuityError
      await expect(
        worldStateTracker.applyTransition(seriesId, {
          trigger: 'Kaito gives crystal to phantom',
          changes: {
            characterMovements: [],
            propTransfers: [{ propId: 'prop_crystal', fromHolder: 'char_kaito', toHolder: 'char_non_existent' }],
            factsAdded: [],
            factsRemoved: [],
          },
        })
      ).rejects.toThrow(ContinuityError);

      // Prop remains safely with Kaito
      const state3 = await worldStateTracker.getCurrentWorldState(seriesId);
      expect(state3.propHolders['prop_crystal']).toBe('char_kaito');
    });
  });

  describe('21.7 & 21.8: Screen Direction & Eyeline 180-Degree Continuity', () => {
    it('detects eyeline mismatch when two characters gaze in the same screen direction in conversation', () => {
      const shots: any[] = [
        {
          id: 'SHOT_A',
          sceneId: 'SCENE_01',
          sequence: 1,
          purpose: 'dialogue_coverage',
          frame: { durationSeconds: 2, aspectRatio: '16:9', targetFps: 24 },
          camera: { shotSize: 'close_up', angle: 'eye_level', movement: 'static' },
          lighting: { timeOfDay: 'night', mood: 'dramatic', colorTemperature: 'neutral' },
          acting: [{ characterId: 'char_alice', actionPrompt: 'speaking', gazeDirection: 'screen_right' }],
          dialogue: [],
          soundDesign: [],
          renderTier: 'deterministic_hyperframes',
          estimatedDurationSeconds: 2,
          dependsOnShotIds: [],
        },
        {
          id: 'SHOT_B',
          sceneId: 'SCENE_01',
          sequence: 2,
          purpose: 'dialogue_coverage',
          frame: { durationSeconds: 2, aspectRatio: '16:9', targetFps: 24 },
          camera: { shotSize: 'close_up', angle: 'eye_level', movement: 'static' },
          lighting: { timeOfDay: 'night', mood: 'dramatic', colorTemperature: 'neutral' },
          // Alice is looking screen_right; Bob is also looking screen_right -> Eyeline clash!
          acting: [{ characterId: 'char_bob', actionPrompt: 'listening', gazeDirection: 'screen_right' }],
          dialogue: [],
          soundDesign: [],
          renderTier: 'deterministic_hyperframes',
          estimatedDurationSeconds: 2,
          dependsOnShotIds: ['SHOT_A'],
        },
      ];

      const scene = {
        id: 'SCENE_01',
        sceneId: 'SCENE_01',
        sceneName: 'Conversation Scene',
        scriptExcerpt: 'Alice and Bob in dramatic dialogue',
        shots,
      };

      const graph = {
        nodes: ['SHOT_A', 'SHOT_B'],
        edges: [{ from: 'SHOT_A', to: 'SHOT_B' }],
        adjacencyList: { SHOT_A: ['SHOT_B'], SHOT_B: [] },
      };

      const report = DirectorQA.evaluateScene(scene as any, graph, DEFAULT_DIRECTOR_PROFILE);
      expect(report.eyelineWarnings.length).toBeGreaterThan(0);
      expect(report.eyelineWarnings[0].reason).toContain('Eyeline mismatch');
    });
  });

  describe('21.9 & 21.10: Per-Shot Retake Isolation and Lineage', () => {
    it('isolates retakes to the targeted shot without invalidating preceding approved shots', async () => {
      const projectId = 'proj_retake_iso';
      const seriesId = 'series_retake_iso';
      const orchestrator = new ProductionOrchestrator(storage, assetRegistry);

      // Create a 2-shot run
      const run = await orchestrator.createRun({
        projectId,
        seriesId,
        rawScript: 'SCENE 1 - LAB - DAY\nShot 1 action.\nShot 2 action.\n',
        mode: 'LOCAL',
        requiredShotCount: 2,
      });

      // Generate genuine tiny synthetic video fixtures using FFmpeg
      const ffmpeg = MediaToolchainDoctor.getFfmpegPath();
      const media1Path = path.join(testDir, 'shot1.mp4');
      const media2V1Path = path.join(testDir, 'shot2_v1.mp4');
      const media2V2Path = path.join(testDir, 'shot2_v2.mp4');
      execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media1Path], { stdio: 'ignore' });
      execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media2V1Path], { stdio: 'ignore' });
      execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=green:s=160x90:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media2V2Path], { stdio: 'ignore' });

      // Set status to WAITING_FOR_IMPORT for Shot 1
      run.status = 'WAITING_FOR_IMPORT';
      await evidenceStore.saveProductionRun(run);

      // Import and approve Shot 1
      await orchestrator.importShotMedia(projectId, run.runId, 'SHOT_01', media1Path, {
        generationSource: 'SIMULATED_FLOW',
      });
      await orchestrator.approveShot(projectId, run.runId, 'SHOT_01', 'Lead Director', undefined, {
        approvalType: 'AUTOMATED_TEST',
      });

      const afterShot1 = await evidenceStore.loadProductionRun(projectId, run.runId);
      expect(afterShot1?.approvalEvidence['SHOT_01']?.status).toBe('APPROVED');
      const shot1Sha = afterShot1?.approvalEvidence['SHOT_01']?.mediaSha256;

      // Advance status to WAITING_FOR_IMPORT for Shot 2
      const runAfterShot1 = afterShot1!;
      runAfterShot1.status = 'WAITING_FOR_IMPORT';
      await evidenceStore.saveProductionRun(runAfterShot1);

      // Import Shot 2 (v1)
      await orchestrator.importShotMedia(projectId, run.runId, 'SHOT_02', media2V1Path, {
        generationSource: 'SIMULATED_FLOW',
      });
      const afterShot2V1 = await evidenceStore.loadProductionRun(projectId, run.runId);
      expect(afterShot2V1?.mediaEvidence['SHOT_02']).toBeDefined();
      const shot2V1Sha = afterShot2V1?.mediaEvidence['SHOT_02']?.sha256;

      // Retake Shot 2: advance status to WAITING_FOR_IMPORT and re-import Shot 2 with v2 media
      const runAfterV1 = afterShot2V1!;
      runAfterV1.status = 'WAITING_FOR_IMPORT';
      await evidenceStore.saveProductionRun(runAfterV1);

      await orchestrator.importShotMedia(projectId, run.runId, 'SHOT_02', media2V2Path, {
        generationSource: 'SIMULATED_FLOW',
        provenance: 'Retake V2',
      });

      const afterShot2V2 = await evidenceStore.loadProductionRun(projectId, run.runId);
      // Shot 1 must be COMPLETELY unaffected
      expect(afterShot2V2?.approvalEvidence['SHOT_01']?.status).toBe('APPROVED');
      expect(afterShot2V2?.approvalEvidence['SHOT_01']?.mediaSha256).toBe(shot1Sha);

      // Shot 2 media is updated to V2
      expect(afterShot2V2?.mediaEvidence['SHOT_02']?.sha256).not.toBe(shot2V1Sha);
      expect(afterShot2V2?.mediaEvidence['SHOT_02']?.provenance).toBe('Retake V2');
      // Shot 2 approval evidence is not approved yet (pending review)
      expect(afterShot2V2?.approvalEvidence['SHOT_02']).toBeUndefined();
    }, 25000);
  });

  describe('21.11 & 21.15: Multi-Shot Approval Matrix & Acceptance Bundle Tamper Attack', () => {
    it('blocks acceptance when a required shot is missing or unexpected in the 3-shot set', async () => {
      const mockRun = {
        schemaVersion: 1,
        revision: 1,
        runId: 'run_tamper_3shot',
        projectId: 'proj_tamper',
        seriesId: 'series_tamper',
        status: 'COMPLETED' as const,
        mode: 'LOCAL' as const,
        pilotMode: false,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:10:00.000Z',
        currentStage: 'COMPLETED',
        completedShotIds: ['SHOT_01', 'SHOT_02', 'SHOT_03'],
        pendingShotIds: [],
        blockedShotIds: [],
        providerJobs: {},
        mediaEvidence: {},
        qaEvidence: {},
        approvalEvidence: {},
        approvalChallenges: {},
        resumeMetadata: { canResume: false },
      };

      const masterEv = {
        manifestId: 'manifest_tamper',
        sequenceId: 'seq_01',
        masterVideoPath: 'renders/master.mp4',
        masterSha256: 'c'.repeat(64),
        sizeBytes: 1048576,
        durationSeconds: 9.0,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        fps: 24,
        verifiedAt: '2026-09-24T00:09:00.000Z',
        verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED' as const,
        checksSummary: { integrity: true },
      };

      const bundle = await ProductionAcceptanceBundle.build({
        projectId: 'proj_tamper',
        runId: 'run_tamper_3shot',
        storage,
        run: mockRun,
        masterEvidence: masterEv,
        requiredShotIds: ['SHOT_01', 'SHOT_02', 'SHOT_03'],
      });

      // Attack 1: validating with missing expected shot expectation (bundle has extra shot SHOT_02)
      const tamperValidation1 = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage, {
        expectedRequiredShotIds: ['SHOT_01', 'SHOT_03'], // Expected only 2 shots, bundle has 3
      });
      expect(tamperValidation1.valid).toBe(false);
      expect(tamperValidation1.reasons.some((r) => r.includes('unexpected extra shot(s)'))).toBe(true);

      // Attack 2: validating where bundle is missing expected shot SHOT_04
      const tamperValidation2 = await ProductionAcceptanceBundle.validate(bundle.acceptanceDir, storage, {
        expectedRequiredShotIds: ['SHOT_01', 'SHOT_02', 'SHOT_03', 'SHOT_04'], // Expected 4 shots, bundle only has 3
      });
      expect(tamperValidation2.valid).toBe(false);
      expect(tamperValidation2.reasons.some((r) => r.includes('missing expected shot(s)'))).toBe(true);
    });
  });

  describe('21.18 & 21.19: Large Story Guardrails & Budget Contracts', () => {
    it('enforces requiredShotCount limit in pilot mode regardless of scene length', async () => {
      const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
      const longStory =
        'SCENE 1 - BRIDGE - DAY\nShot 1.\nShot 2.\nShot 3.\n' +
        'SCENE 2 - ENGINE ROOM - DAY\nShot 4.\nShot 5.\n' +
        'SCENE 3 - HANGAR - DAY\nShot 6.\nShot 7.\nShot 8.\n';

      const pilotRun = await orchestrator.createRun({
        projectId: 'proj_pilot_limit',
        seriesId: 'series_01',
        rawScript: longStory,
        pilotMode: true,
        requiredShotCount: 1,
      });

      expect(pilotRun.pilotMode).toBe(true);
      expect(pilotRun.requiredShotCount).toBe(1);
    });

    it('BudgetController tracks expenditures and blocks when budget cap is exceeded', () => {
      const budget = new BudgetController({
        maxBudgetUsd: 1.0,
        warningThresholdPercent: 80.0,
        enforceHardCap: true,
      });

      expect(budget.canAfford(0.45)).toBe(true);
      budget.recordExpense(0.45);
      expect(budget.getStatus().spentBudgetUsd).toBe(0.45);
      expect(budget.getStatus().remainingBudgetUsd).toBe(0.55);
      expect(budget.getStatus().isWarning).toBe(false);

      // Record another $0.40 -> total $0.85 (85% >= 80% threshold -> warning)
      budget.recordExpense(0.40);
      expect(budget.getStatus().spentBudgetUsd).toBe(0.85);
      expect(budget.getStatus().isWarning).toBe(true);

      // $0.20 more would reach $1.05 > $1.00 hard cap -> canAfford is false, recordExpense throws
      expect(budget.canAfford(0.20)).toBe(false);
      expect(() => budget.recordExpense(0.20)).toThrow();
    });
  });
});
