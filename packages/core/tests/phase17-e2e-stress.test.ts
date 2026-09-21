import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  StudioPipelineFactory,
  MemoryStorage,
  InMemoryAssetRegistry,
  defaultLogger,
  MediaToolchainDoctor,
} from '../src/index.js';

describe('Phase 17 — Full End-to-End Stress Test with Multimodal Visual QA', () => {
  const testDir = path.resolve('.studio', 'tests', 'phase17-stress');
  const shot1Video = path.join(testDir, 'SHOT_SC01_SH01.mp4');
  const shot2Video = path.join(testDir, 'SHOT_SC01_SH02.mp4');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const ffmpeg = MediaToolchainDoctor.getFfmpegPath();

    // Generate real test videos for shots
    execSync(`"${ffmpeg}" -y -f lavfi -i testsrc=size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${shot1Video}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execSync(`"${ffmpeg}" -y -f lavfi -i testsrc=size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${shot2Video}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('executes full 12-step master pipeline under multi-scene stress with real video and visual QA', async () => {
    const storage = new MemoryStorage();
    const assetRegistry = new InMemoryAssetRegistry();

    const pipeline = StudioPipelineFactory.createPipeline({
      storage,
      assetRegistry,
      logger: defaultLogger,
      autoRepairContinuity: true,
    });

    const multiSceneStory = `SCENE 1 - COMMAND DECK - NIGHT
Commander Kaito stands at the central tactical console, eyes fixed on the sensor readout.
KAITO
Sensors confirm the breach. Prepare defensive countermeasures.
Lieutenant Elena checks her sidearm and nods calmly.
ELENA
Shields holding at seventy percent.

SCENE 2 - LOWER CORRIDOR - NIGHT
Elena rushes down the metallic hallway as alarm klaxons flash crimson.
ELENA
All hands, battle stations!`;

    const initialState = {
      projectId: 'proj_stress_17',
      seriesId: 'series_stress_17',
      sourceText: multiSceneStory,
      sourceDocumentId: 'doc_stress_17',
      shotVideoMap: {
        SHOT_SC01_SH01: shot1Video,
        SHOT_SC01_SH02: shot2Video,
      },
    };

    // Execute complete 12-step pipeline
    const context = await pipeline.execute('proj_stress_17', initialState);

    // 1. Verify topological step execution
    expect(context.completedStepIds).toHaveLength(12);
    expect(context.completedStepIds).toEqual([
      'story_intelligence',
      'shot_planning',
      'character_asset_resolution',
      'world_environment_resolution',
      'production_planning_router',
      'hyperframes_deterministic_execution',
      'generative_video_step',
      'visual_semantic_qa_step',
      'audio_production_step',
      'timeline_editing_step',
      'continuity_qa_step',
      'master_export_step',
    ]);

    // 2. Verify Story & Shot Planning
    expect(context.state.productionScenes).toBeDefined();
    expect(Array.isArray(context.state.productionScenes)).toBe(true);
    expect(context.state.shotContracts).toBeDefined();
    expect(Array.isArray(context.state.shotContracts)).toBe(true);

    // 3. Verify Visual Semantic QA step outputs
    expect(context.state.visualQAReports).toBeDefined();
    expect(Array.isArray(context.state.visualQAReports)).toBe(true);
    expect(context.state.visualQASummary).toBeDefined();
    const visSummary = context.state.visualQASummary as any;
    expect(visSummary.evaluatedShotsCount).toBeGreaterThanOrEqual(2);
    expect(visSummary.averageVisualScore).toBeGreaterThanOrEqual(0.8);

    // 4. Verify Continuity QA & Auto-Repair
    expect(context.state.continuityReport).toBeDefined();
    const contReport = context.state.continuityReport as any;
    expect(contReport.reportId).toBeDefined();
    expect(contReport.evaluatedAt).toBeDefined();

    // 5. Verify Timeline Sequence
    expect(context.state.timelineSequence).toBeDefined();
    const seq = context.state.timelineSequence as any;
    expect(seq.tracks.length).toBeGreaterThanOrEqual(4);
    expect(seq.totalDuration).toBeGreaterThan(0);

    // 6. Verify Master Export Packaging
    expect(context.state.exportManifest).toBeDefined();
    expect(context.state.exportHtml5).toBeDefined();
    expect(context.state.exportOtio).toBeDefined();
    expect(context.state.exportEdl).toBeDefined();

    // 7. Verify Checkpoints
    const checkpoints = await context.checkpoints.listCheckpoints('proj_stress_17');
    expect(checkpoints.length).toBeGreaterThanOrEqual(12);

    // 8. Verify Asset Registry entries
    const assets = await assetRegistry.query({ seriesId: 'series_stress_17' });
    const qaReports = assets.filter((a) => a.type === 'qa_report');
    expect(qaReports.length).toBeGreaterThanOrEqual(2);
  }, 30000);
});
