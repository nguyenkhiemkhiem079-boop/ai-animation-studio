import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import {
  SequentialMultiShotEngine,
  MultiShotBudgetProjection,
} from '../src/production/sequential-multi-shot-engine.js';
import { ScenePropStateTracker } from '../src/world/scene-prop-tracker.js';
import { ShotContract } from '../domain/director.js';

describe('Phase 32: Real Three-Shot Sequential Production Engine', () => {
  const scratchDir = path.resolve(process.cwd(), '.studio', 'scratch', 'test_phase32_multishot');
  const knownClipPath = path.resolve(
    process.cwd(),
    '.studio',
    'production',
    'project_flow_real',
    'run_1790328582248',
    'SHOT_SC01_SH01',
    'clip.mp4'
  );

  beforeEach(async () => {
    await fs.mkdir(scratchDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(scratchDir, { recursive: true, force: true });
    } catch {}
  });

  const createShot = (id: string, seq: number, prompt: string): ShotContract => ({
    id,
    sceneId: 'SC01',
    sequenceIndex: seq,
    frame: { durationSeconds: 4 },
    camera: { movement: 'static', shotSize: 'medium' },
    acting: [{ characterId: 'CHAR_KAITO', actionPrompt: prompt }],
    directorNotes: { coverage: 'Medium', emotionalBeat: 'Focus', cinematicSkill: 'Classic' },
    visualElements: [],
    audioElements: [],
    continuityRequirements: [],
    sourceTraceability: { narrativeBeatId: `BEAT_${seq}`, sourceTextHash: `hash_${seq}` },
    promptEngineering: { compiledPromptText: prompt },
  });

  it('32H — projects credit budget accurately and fails closed when budget is exceeded', () => {
    const shots = [
      createShot('SHOT_01', 1, 'Establishing city'),
      createShot('SHOT_02', 2, 'Detective walks'),
      createShot('SHOT_03', 3, 'Close up face'),
    ];

    // Case 1: Within budget
    const projPass = SequentialMultiShotEngine.projectBudget(shots, { maxCreditBudget: 5 });
    expect(projPass.isWithinBudget).toBe(true);
    expect(projPass.projectedFlowCredits).toBe(3);
    expect(projPass.budgetDeficit).toBe(0);

    // Case 2: Exceeds budget (e.g. maxCreditBudget = 2)
    const projFail = SequentialMultiShotEngine.projectBudget(shots, { maxCreditBudget: 2 });
    expect(projFail.isWithinBudget).toBe(false);
    expect(projFail.projectedFlowCredits).toBe(3);
    expect(projFail.budgetDeficit).toBe(1);
  });

  it('32C — ScenePropStateTracker manages per-scene prop continuity and surgical rollback', () => {
    const tracker = new ScenePropStateTracker();
    const seriesId = 'series_test_01';
    const projectId = 'proj_test_01';
    const sceneId = 'scene_deck_01';

    // Initial state
    tracker.registerProp(seriesId, projectId, sceneId, 'prop_door', 'Blast Door', 'closed');
    tracker.registerProp(seriesId, projectId, sceneId, 'prop_lamp', 'Desk Lamp', 'off');

    // Shot 1 opens blast door
    tracker.mutateProp(seriesId, projectId, sceneId, 'SHOT_01', 'prop_door', 'Blast Door', 'open');
    expect(tracker.getActiveProps(seriesId, projectId, sceneId)['Blast Door']).toBe('open');
    expect(tracker.getActiveProps(seriesId, projectId, sceneId)['Desk Lamp']).toBe('off');

    // Shot 2 turns on lamp
    tracker.mutateProp(seriesId, projectId, sceneId, 'SHOT_02', 'prop_lamp', 'Desk Lamp', 'on');
    expect(tracker.getActiveProps(seriesId, projectId, sceneId)['Blast Door']).toBe('open');
    expect(tracker.getActiveProps(seriesId, projectId, sceneId)['Desk Lamp']).toBe('on');

    // Apply props to downstream Shot 3 contract
    const shot3 = createShot('SHOT_03', 3, 'Elena inspects the console.');
    const updatedShot3 = tracker.applyPropsToShotContract(shot3, seriesId, projectId, sceneId);
    expect(updatedShot3.promptEngineering?.compiledPromptText).toContain('Blast Door: open');
    expect(updatedShot3.promptEngineering?.compiledPromptText).toContain('Desk Lamp: on');

    // Surgical retake of Shot 2: rolls back lamp mutation
    const rollback = tracker.invalidateMutationsForShot(seriesId, projectId, sceneId, 'SHOT_02');
    expect(rollback.affectedProps).toContain('prop_lamp');
    expect(tracker.getActiveProps(seriesId, projectId, sceneId)['Blast Door']).toBe('open');
    expect(tracker.getActiveProps(seriesId, projectId, sceneId)['Desk Lamp']).toBe('off'); // rolled back!
  });

  it('32A & 32B — executes 3-shot sequential pipeline with terminal frame extraction and continuity flow', async () => {
    // Only run if real physical clip is available
    if (!syncFs.existsSync(knownClipPath)) {
      return;
    }

    const engine = new SequentialMultiShotEngine();
    const tracker = engine.getPropTracker();
    const seriesId = 'series_3shot_test';
    const projectId = 'proj_3shot_test';
    const sceneId = 'scene_01';

    tracker.registerProp(seriesId, projectId, sceneId, 'prop_door', 'Hangar Door', 'closed');

    const shots = [
      createShot('SHOT_01', 1, 'Wide establishing view of hangar.'),
      createShot('SHOT_02', 2, 'Kaito opens the hangar door.'),
      createShot('SHOT_03', 3, 'Close-up on Kaito staring into the storm.'),
    ];

    const terminalHandoffs: Record<string, string | undefined> = {};

    const result = await engine.executeSequence({
      runId: 'run_seq_3shot_01',
      projectId,
      seriesId,
      sceneId,
      shots,
      outputDir: scratchDir,
      maxCreditBudget: 10,
      videoGenerator: async (shot, terminalFramePath) => {
        terminalHandoffs[shot.id] = terminalFramePath;

        if (shot.id === 'SHOT_02') {
          tracker.mutateProp(seriesId, projectId, sceneId, shot.id, 'prop_door', 'Hangar Door', 'open');
        }

        const outClip = path.join(scratchDir, shot.id, 'clip.mp4');
        await fs.mkdir(path.dirname(outClip), { recursive: true });
        await fs.copyFile(knownClipPath, outClip);
        const sha256 = 'clip_sha_dummy';
        return { videoPath: outClip, sha256 };
      },
    });

    expect(result.shots.length).toBe(3);
    expect(result.totalShots).toBe(3);

    // Shot 1 has no upstream terminal frame
    expect(terminalHandoffs['SHOT_01']).toBeUndefined();

    // Shot 2 received Shot 1's terminal frame!
    expect(terminalHandoffs['SHOT_02']).toBeDefined();
    expect(terminalHandoffs['SHOT_02']).toContain('SHOT_01');

    // Shot 3 received Shot 2's terminal frame!
    expect(terminalHandoffs['SHOT_03']).toBeDefined();
    expect(terminalHandoffs['SHOT_03']).toContain('SHOT_02');

    // Terminal frames were extracted and exist physically on disk
    expect(syncFs.existsSync(result.shots[0].terminalFramePath!)).toBe(true);
    expect(syncFs.existsSync(result.shots[1].terminalFramePath!)).toBe(true);
    expect(syncFs.existsSync(result.shots[2].terminalFramePath!)).toBe(true);

    // Prop state in Shot 3 reflects mutation made in Shot 2
    expect(result.shots[2].propsAtExecution['Hangar Door']).toBe('open');
  });

  it('32G — surgical retake preserves upstream work and invalidates downstream subtree', () => {
    const engine = new SequentialMultiShotEngine();
    const tracker = engine.getPropTracker();
    const seriesId = 'series_retake_test';
    const projectId = 'proj_retake_test';
    const sceneId = 'scene_retake_01';

    tracker.registerProp(seriesId, projectId, sceneId, 'prop_terminal', 'Console Terminal', 'off');
    tracker.mutateProp(seriesId, projectId, sceneId, 'SHOT_02', 'prop_terminal', 'Console Terminal', 'active');

    const shots = [
      createShot('SHOT_01', 1, 'Establishing room'),
      createShot('SHOT_02', 2, 'Elena activates console'),
      createShot('SHOT_03', 3, 'Close-up of console interface'),
    ];

    // Retake Shot 2
    const retakeRes = engine.surgicalRetake(seriesId, projectId, sceneId, 'SHOT_02', shots);

    // Shot 1 preserved!
    expect(retakeRes.preservedShotIds).toEqual(['SHOT_01']);

    // Shot 2 and downstream Shot 3 invalidated!
    expect(retakeRes.invalidatedShotIds).toEqual(['SHOT_02', 'SHOT_03']);

    // Prop mutation rolled back!
    expect(retakeRes.rolledBackProps).toContain('prop_terminal');
    expect(tracker.getActiveProps(seriesId, projectId, sceneId)['Console Terminal']).toBe('off');
  });
});
