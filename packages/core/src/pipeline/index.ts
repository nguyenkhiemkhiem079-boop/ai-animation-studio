/**
 * Step-driven, resumable pipeline execution engine for AI Animation Studio.
 */

import { CheckpointManager } from '../checkpoint/index.js';
import { StudioEventBus, defaultEventBus } from '../events/index.js';
import { PipelineError } from '../errors/index.js';
import { Logger, defaultLogger } from '../logging/index.js';
import type { IStorageProvider } from '../storage/index.js';

export interface PipelineContext {
  projectId: string;
  state: Record<string, unknown>;
  storage: IStorageProvider;
  events: StudioEventBus;
  logger: Logger;
  checkpoints: CheckpointManager;
  completedStepIds: string[];
}

export interface PipelineStep {
  id: string;
  name: string;
  description?: string;
  saveCheckpointAfter?: boolean;
  retryCount?: number;
  run: (context: PipelineContext) => Promise<Record<string, unknown>>;
  rollback?: (context: PipelineContext) => Promise<void>;
  shouldSkip?: (context: PipelineContext) => boolean;
}

export interface PipelineOptions {
  name: string;
  steps: PipelineStep[];
  storage: IStorageProvider;
  events?: StudioEventBus;
  logger?: Logger;
}

export class Pipeline {
  public readonly name: string;
  private steps: PipelineStep[];
  private storage: IStorageProvider;
  private events: StudioEventBus;
  private logger: Logger;
  private checkpoints: CheckpointManager;

  constructor(options: PipelineOptions) {
    this.name = options.name;
    this.steps = options.steps;
    this.storage = options.storage;
    this.events = options.events ?? defaultEventBus;
    this.logger = options.logger ?? defaultLogger;
    this.checkpoints = new CheckpointManager(this.storage);
  }

  public getSteps(): ReadonlyArray<PipelineStep> {
    return [...this.steps];
  }

  public async execute(
    projectId: string,
    initialState: Record<string, unknown> = {},
    options: { resumeFromCheckpointId?: string } = {}
  ): Promise<PipelineContext> {
    let state = { ...initialState };
    let completedStepIds: string[] = [];

    // Check if resuming from a previous checkpoint
    if (options.resumeFromCheckpointId) {
      this.logger.info(`Resuming pipeline "${this.name}" from checkpoint: ${options.resumeFromCheckpointId}`, {
        projectId,
      });
      const loaded = await this.checkpoints.restoreCheckpoint(projectId, options.resumeFromCheckpointId);
      state = { ...state, ...loaded };
      if (Array.isArray(state.__completedStepIds)) {
        completedStepIds = [...(state.__completedStepIds as string[])];
      }
      await this.events.emit('checkpoint:restored', {
        projectId,
        checkpointId: options.resumeFromCheckpointId,
      });
    }

    const context: PipelineContext = {
      projectId,
      state,
      storage: this.storage,
      events: this.events,
      logger: this.logger.child({ projectId, pipeline: this.name }),
      checkpoints: this.checkpoints,
      completedStepIds,
    };

    await this.events.emit('pipeline:started', {
      pipelineName: this.name,
      projectId,
      stepCount: this.steps.length,
    });

    for (const step of this.steps) {
      // Check if already completed in resumed state
      if (completedStepIds.includes(step.id)) {
        context.logger.info(`Skipping already completed step: ${step.name} (${step.id})`, { stepId: step.id });
        continue;
      }

      // Check conditional skip
      if (step.shouldSkip && step.shouldSkip(context)) {
        context.logger.info(`Step skipped by rule: ${step.name} (${step.id})`, { stepId: step.id });
        continue;
      }

      await this.events.emit('pipeline:step_started', {
        projectId,
        stepId: step.id,
        stepName: step.name,
      });

      const maxAttempts = (step.retryCount ?? 0) + 1;
      let attempt = 0;
      let stepSuccess = false;
      let lastError: Error | undefined;

      while (attempt < maxAttempts && !stepSuccess) {
        attempt++;
        try {
          context.logger.info(`Executing step: ${step.name} (attempt ${attempt}/${maxAttempts})`, { stepId: step.id });
          const resultDelta = await step.run(context);
          if (resultDelta && typeof resultDelta === 'object') {
            context.state = { ...context.state, ...resultDelta };
          }
          stepSuccess = true;
        } catch (err: any) {
          lastError = err;
          context.logger.warn(`Step ${step.id} failed on attempt ${attempt}: ${err.message}`, { stepId: step.id });
        }
      }

      if (!stepSuccess) {
        await this.events.emit('pipeline:step_failed', {
          projectId,
          stepId: step.id,
          error: lastError?.message,
        });

        if (step.rollback) {
          try {
            context.logger.info(`Running rollback handler for step ${step.id}`);
            await step.rollback(context);
          } catch (rbErr: any) {
            context.logger.error(`Rollback failed for step ${step.id}: ${rbErr.message}`);
          }
        }

        throw new PipelineError(
          `Pipeline step "${step.name}" (${step.id}) failed after ${maxAttempts} attempts: ${lastError?.message}`,
          step.id,
          { originalError: lastError }
        );
      }

      completedStepIds.push(step.id);
      context.completedStepIds = completedStepIds;
      context.state.__completedStepIds = completedStepIds;

      await this.events.emit('pipeline:step_completed', {
        projectId,
        stepId: step.id,
        stepName: step.name,
      });

      // Save checkpoint if requested
      if (step.saveCheckpointAfter) {
        const checkpointId = `ckpt_step_${step.id}_${Date.now()}`;
        context.logger.info(`Saving pipeline checkpoint: ${checkpointId}`);
        await this.checkpoints.createCheckpoint(projectId, checkpointId, context.state, {
          name: `After step: ${step.name}`,
          stage: step.id,
          tags: ['pipeline-step', step.id],
        });
        await this.events.emit('checkpoint:created', { projectId, checkpointId, stepId: step.id });
      }
    }

    await this.events.emit('pipeline:completed', {
      pipelineName: this.name,
      projectId,
      completedSteps: completedStepIds,
    });

    return context;
  }
}

export * from './studio-pipeline-factory.js';
export * from './production-summary.js';
