import { describe, it, expect, beforeEach } from 'vitest';
import {
  Pipeline,
  MemoryStorage,
  createStoryIntelligenceStep,
  UniverseManager,
} from '../src/index.js';

describe('Story Intelligence Pipeline Step', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
  });

  it('runs story intelligence step in pipeline and stores results & checkpoints', async () => {
    const rawScript = `INT. COFFEE SHOP - DAY

MINH: The case is finally closed.
LAN: Are you certain?`;

    const pipeline = new Pipeline({
      name: 'StoryToShots',
      storage,
      steps: [
        createStoryIntelligenceStep({ saveCheckpointAfter: true }),
      ],
    });

    const context = await pipeline.execute('proj_pipeline_test', {
      rawScript,
      scriptTitle: 'Coffee Shop Scene',
      seriesId: 'series_detective',
    });

    expect(context.state.sourceDocument).toBeDefined();
    expect(context.state.storyAnalysis).toBeDefined();
    expect(context.state.sceneCount).toBe(1);
    expect(context.state.characterCandidateCount).toBe(2);

    // Verify checkpoint was automatically created
    const checkpoints = await context.checkpoints.listCheckpoints('proj_pipeline_test');
    expect(checkpoints.length).toBeGreaterThan(0);
    expect(checkpoints[0].stage).toBe('story_intelligence');
  });
});
