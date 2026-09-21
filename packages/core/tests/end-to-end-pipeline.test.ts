import { describe, it, expect } from 'vitest';
import {
  StudioPipelineFactory,
  ProductionSummaryCalculator,
  MemoryStorage,
  InMemoryAssetRegistry,
  defaultLogger,
  defaultEventBus,
} from '../src/index.js';

describe('Phase 14 — End-to-End Pipeline DAG Orchestrator', () => {
  it('instantiates all 11 production steps in correct topological order', () => {
    const storage = new MemoryStorage();
    const pipeline = StudioPipelineFactory.createPipeline({ storage });

    const steps = pipeline.getSteps();
    expect(steps).toHaveLength(11);

    const stepIds = steps.map((s) => s.id);
    expect(stepIds).toEqual([
      'story_intelligence',
      'shot_planning',
      'character_asset_resolution',
      'world_environment_resolution',
      'production_planning_router',
      'hyperframes_deterministic_execution',
      'generative_video_step',
      'audio_production_step',
      'timeline_editing_step',
      'continuity_qa_step',
      'master_export_step',
    ]);
  });

  it('calculates financial savings through Deterministic Animation First architecture', () => {
    const summary = ProductionSummaryCalculator.calculate(
      'proj_calc_test',
      'series_calc_test',
      undefined,
      undefined,
      undefined,
      {
        deterministicShots: 3,
        generativeShots: 1,
        dialogueLines: 2,
        musicTracks: 1,
        sfxCues: 2,
      }
    );

    expect(summary.costBreakdown.deterministicAnimationCostUsd).toBe(0.0);
    expect(summary.costBreakdown.generativeVideoCostUsd).toBe(0.50);
    expect(summary.costBreakdown.audioDialogueCostUsd).toBe(0.10); // 2 * $0.05
    expect(summary.costBreakdown.audioMusicCostUsd).toBe(0.05); // 1 * $0.05
    expect(summary.costBreakdown.audioSfxCostUsd).toBe(0.10); // 2 * $0.05
    expect(summary.costBreakdown.totalActualCostUsd).toBe(0.75);

    // Pure generative estimate: 4 shots * $0.75 + $0.25 audio = $3.25
    expect(summary.costBreakdown.pureGenerativeEstimatedCostUsd).toBe(3.25);
    expect(summary.costBreakdown.totalSavedUsd).toBe(2.50);
    expect(summary.costBreakdown.savingsPercentage).toBeGreaterThan(70);
  });

  it('executes full end-to-end pipeline from raw script to master deliverables with checkpoints', async () => {
    const storage = new MemoryStorage();
    const assetRegistry = new InMemoryAssetRegistry();
    const pipeline = StudioPipelineFactory.createPipeline({
      storage,
      assetRegistry,
      logger: defaultLogger,
    });

    const rawStory = `SCENE 1 - COMMAND DECK - NIGHT
Commander Kaito stands at the tactical console, eyes fixed on the sensor readout.
KAITO
Sensors confirm the breach. Prepare defensive countermeasures.
Lieutenant Elena checks her sidearm and nods.
ELENA
Shields holding at seventy percent.`;

    const initialState = {
      projectId: 'proj_e2e_test',
      seriesId: 'series_e2e_test',
      sourceText: rawStory,
      sourceDocumentId: 'doc_e2e_01',
    };

    // Execute full pipeline
    const context = await pipeline.execute('proj_e2e_test', initialState);

    // Verify all 11 steps completed
    expect(context.completedStepIds).toHaveLength(11);

    // Verify key state outputs
    expect(context.state.productionScenes).toBeDefined();
    expect(context.state.shotContracts).toBeDefined();
    expect(context.state.timelineSequence).toBeDefined();
    expect(context.state.continuityReport).toBeDefined();
    expect(context.state.exportManifest).toBeDefined();
    expect(context.state.exportHtml5).toBeDefined();
    expect(context.state.exportOtio).toBeDefined();
    expect(context.state.exportEdl).toBeDefined();

    // Verify checkpoint snapshots were created
    const checkpoints = await context.checkpoints.listCheckpoints('proj_e2e_test');
    expect(checkpoints.length).toBeGreaterThanOrEqual(11);

    // Verify assets registered in AssetRegistry
    const allAssets = await assetRegistry.query({ seriesId: 'series_e2e_test' });
    expect(allAssets.length).toBeGreaterThanOrEqual(4);
  });

  it('supports resuming pipeline from a saved checkpoint without re-running earlier steps', async () => {
    const storage = new MemoryStorage();
    const pipeline = StudioPipelineFactory.createPipeline({ storage });

    const rawStory = `SCENE 1 - CORRIDOR - DAY
Kaito walks quickly down the corridor.`;

    const initialState = {
      projectId: 'proj_resume_test',
      seriesId: 'series_resume_test',
      sourceText: rawStory,
      sourceDocumentId: 'doc_resume_01',
    };

    // 1. Run first 3 steps
    const firstContext = await pipeline.execute('proj_resume_test', initialState);
    const checkpoints = await firstContext.checkpoints.listCheckpoints('proj_resume_test');
    const midCheckpoint = checkpoints[2]; // after character_asset_step

    // 2. Resume from mid checkpoint
    const resumedContext = await pipeline.execute(
      'proj_resume_test',
      {},
      { resumeFromCheckpointId: midCheckpoint.id }
    );

    expect(resumedContext.completedStepIds).toContain('master_export_step');
    expect(resumedContext.state.exportManifest).toBeDefined();
  });
});
