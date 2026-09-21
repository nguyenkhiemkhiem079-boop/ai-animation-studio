import { describe, it, expect, beforeEach } from 'vitest';
import {
  Pipeline,
  MemoryStorage,
  createShotPlanningStep,
  StoryAnalysis,
} from '../src/index.js';

describe('Shot Planning Pipeline Step', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('executes shot planning step within pipeline and creates checkpoint', async () => {
    const mockStoryAnalysis: StoryAnalysis = {
      id: 'analysis_test',
      projectId: 'proj_dir_step',
      sourceDocumentId: 'doc_1',
      sourceContentHash: 'hash_1',
      characterCandidates: [],
      locationCandidates: [],
      propCandidates: [],
      relationshipCandidates: [],
      eventCandidates: [],
      sceneCandidates: [
        {
          id: 'SC_01',
          sceneNumber: 1,
          heading: 'INT. UNDERGROUND VAULT - NIGHT',
          timeOfDay: 'night',
          locationName: 'UNDERGROUND VAULT',
          charactersPresent: ['MINH'],
          beats: [
            {
              id: 'B1',
              index: 0,
              summary: 'Minh discovers the glowing core',
              involvedCharacterIds: ['MINH'],
              sourceTrace: { documentId: 'doc_1', segmentIndex: 0, charStart: 0, charEnd: 10, contentHash: 'h' },
            },
          ],
          dialogueLines: [],
          narrationLines: [],
          sourceTrace: [],
        },
      ],
      coverage: { coveragePercentage: 100, totalCharacters: 10, coveredCharacters: 10, coveredRanges: [], uncoveredRanges: [] },
      hallucinationReport: { isValid: true, violations: [], ungroundedEntities: [] },
      canonConflicts: [],
      analyzedAt: new Date().toISOString(),
    };

    const pipeline = new Pipeline({
      name: 'DirectorPipeline',
      storage,
      steps: [createShotPlanningStep({ saveCheckpointAfter: true })],
    });

    const context = await pipeline.execute('proj_dir_step', {
      storyAnalysis: mockStoryAnalysis,
    });

    expect(context.state.productionScenes).toBeDefined();
    expect(context.state.dependencyGraphs).toBeDefined();
    expect(context.state.directorQAReports).toBeDefined();
    expect(context.state.totalPlannedShots).toBeGreaterThanOrEqual(2);

    const checkpoints = await context.checkpoints.listCheckpoints('proj_dir_step');
    expect(checkpoints.length).toBeGreaterThan(0);
    expect(checkpoints[0].stage).toBe('shot_planning');
  });
});
