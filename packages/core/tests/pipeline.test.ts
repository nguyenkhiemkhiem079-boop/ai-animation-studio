import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, Pipeline, PipelineError, StudioEventBus, Logger } from '../src/index.js';

describe('Pipeline Engine', () => {
  let storage: MemoryStorage;
  let events: StudioEventBus;
  let logger: Logger;

  beforeEach(() => {
    storage = new MemoryStorage();
    events = new StudioEventBus();
    logger = new Logger({ handlers: [] }); // silent logger for tests
  });

  it('runs multi-step pipeline and accumulates state', async () => {
    const pipeline = new Pipeline({
      name: 'StoryToShotPlan',
      storage,
      events,
      logger,
      steps: [
        {
          id: 'step_ingest',
          name: 'Ingest Content',
          run: async () => ({ sourceText: 'Once upon a time in Hanoi...' }),
        },
        {
          id: 'step_analyze',
          name: 'Analyze Story',
          run: async (ctx) => ({
            characterCount: 1,
            wordCount: (ctx.state.sourceText as string).split(' ').length,
          }),
        },
      ],
    });

    const context = await pipeline.execute('project_1');
    expect(context.state.sourceText).toBe('Once upon a time in Hanoi...');
    expect(context.state.characterCount).toBe(1);
    expect(context.state.wordCount).toBe(6);
    expect(context.completedStepIds).toEqual(['step_ingest', 'step_analyze']);
  });

  it('retries failed step up to configured retry count', async () => {
    let attempts = 0;
    const pipeline = new Pipeline({
      name: 'RetryPipeline',
      storage,
      events,
      logger,
      steps: [
        {
          id: 'step_flaky',
          name: 'Flaky Step',
          retryCount: 2,
          run: async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error('Temporary glitch');
            }
            return { success: true };
          },
        },
      ],
    });

    const context = await pipeline.execute('project_retry');
    expect(attempts).toBe(3);
    expect(context.state.success).toBe(true);
  });

  it('invokes rollback and throws PipelineError on total failure', async () => {
    let rolledBack = false;
    const pipeline = new Pipeline({
      name: 'FailingPipeline',
      storage,
      events,
      logger,
      steps: [
        {
          id: 'step_fail',
          name: 'Unrecoverable Step',
          retryCount: 1,
          run: async () => {
            throw new Error('Fatal error');
          },
          rollback: async () => {
            rolledBack = true;
          },
        },
      ],
    });

    await expect(pipeline.execute('project_fail')).rejects.toThrow(PipelineError);
    expect(rolledBack).toBe(true);
  });

  it('resumes from checkpoint and skips previously completed steps', async () => {
    let step1RunCount = 0;
    let step2RunCount = 0;

    const pipeline = new Pipeline({
      name: 'ResumablePipeline',
      storage,
      events,
      logger,
      steps: [
        {
          id: 'step_1',
          name: 'Step 1 (Saves Checkpoint)',
          saveCheckpointAfter: true,
          run: async () => {
            step1RunCount++;
            return { step1Output: 'done' };
          },
        },
        {
          id: 'step_2',
          name: 'Step 2',
          run: async (ctx) => {
            step2RunCount++;
            return { step2Output: `${ctx.state.step1Output}_and_step2` };
          },
        },
      ],
    });

    // Execute first run
    const context1 = await pipeline.execute('project_resume');
    expect(step1RunCount).toBe(1);
    expect(step2RunCount).toBe(1);

    // List checkpoints created
    const checkpoints = await context1.checkpoints.listCheckpoints('project_resume');
    expect(checkpoints.length).toBeGreaterThan(0);
    const step1Checkpoint = checkpoints[0].id;

    // Simulate resuming from the step 1 checkpoint
    const context2 = await pipeline.execute('project_resume', {}, { resumeFromCheckpointId: step1Checkpoint });

    // Step 1 should have been skipped! Step 2 re-run with loaded state
    expect(step1RunCount).toBe(1); // unchanged!
    expect(step2RunCount).toBe(2);
    expect(context2.state.step2Output).toBe('done_and_step2');
  });
});
