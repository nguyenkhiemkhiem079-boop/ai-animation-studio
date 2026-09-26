import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { ShotContract } from '../domain/director.js';
import { CharacterDNA, LocationDNA } from '../domain/universe.js';
import { FrameExtractor } from '../qa/frame-extractor.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { ScenePropStateTracker } from '../world/scene-prop-tracker.js';
import { ContinuityQAEvaluator } from '../qa/continuity-qa-evaluator.js';
import { ProductionInvalidationEngine } from '../production-orchestrator/production-invalidation.js';
import { ProductionRun } from '../domain/production-run.js';

export interface MultiShotBudgetProjection {
  totalShots: number;
  externalShotsCount: number;
  deterministicLocalShotsCount: number;
  cachedShotsCount: number;
  projectedFlowCredits: number;
  maxCreditBudget: number;
  isWithinBudget: boolean;
  budgetDeficit: number;
}

export interface SequentialShotExecutionResult {
  shotId: string;
  sequenceIndex: number;
  clipPath: string;
  clipSha256: string;
  terminalFramePath?: string;
  terminalFrameSha256?: string;
  propsAtExecution: Record<string, string>;
  continuityScore: number;
  passedContinuity: boolean;
}

export interface MultiShotSequenceResult {
  runId: string;
  projectId: string;
  seriesId: string;
  totalShots: number;
  shots: SequentialShotExecutionResult[];
  budgetProjection: MultiShotBudgetProjection;
  continuityAllPassed: boolean;
  masterAssembled: boolean;
  masterVideoPath?: string;
  masterSha256?: string;
}

export class SequentialMultiShotEngine {
  private readonly propTracker: ScenePropStateTracker;
  private readonly continuityQa: ContinuityQAEvaluator;

  constructor() {
    this.propTracker = new ScenePropStateTracker();
    this.continuityQa = new ContinuityQAEvaluator();
  }

  public getPropTracker(): ScenePropStateTracker {
    return this.propTracker;
  }

  /**
   * Phase 32H — Projects provider credit usage before execution.
   * Fails closed if projected cost exceeds configured Studio guard.
   */
  public static projectBudget(
    shots: ShotContract[],
    options: {
      maxCreditBudget?: number;
      creditCostPerExternalShot?: number;
      cachedShotIds?: string[];
    } = {}
  ): MultiShotBudgetProjection {
    const maxCreditBudget = options.maxCreditBudget ?? 50;
    const creditCostPerExternalShot = options.creditCostPerExternalShot ?? 1;
    const cachedSet = new Set(options.cachedShotIds || []);

    let externalShotsCount = 0;
    let deterministicLocalShotsCount = 0;
    let cachedShotsCount = 0;

    for (const shot of shots) {
      if (cachedSet.has(shot.id)) {
        cachedShotsCount++;
      } else if (
        (shot as any).routingPreference === 'LOCAL_PREFERRED' ||
        (shot as any).routingPreference === 'LOCAL_ONLY'
      ) {
        deterministicLocalShotsCount++;
      } else {
        externalShotsCount++;
      }
    }

    const projectedFlowCredits = externalShotsCount * creditCostPerExternalShot;
    const isWithinBudget = projectedFlowCredits <= maxCreditBudget;
    const budgetDeficit = isWithinBudget ? 0 : projectedFlowCredits - maxCreditBudget;

    return {
      totalShots: shots.length,
      externalShotsCount,
      deterministicLocalShotsCount,
      cachedShotsCount,
      projectedFlowCredits,
      maxCreditBudget,
      isWithinBudget,
      budgetDeficit,
    };
  }

  /**
   * Executes a sequential 3-shot production pipeline.
   * Enforces:
   * - Shot N+1 depends on Shot N's verified terminal frame
   * - Props flow forward across shots
   * - Continuity QA checks screen direction and character consistency
   */
  public async executeSequence(
    input: {
      runId: string;
      projectId: string;
      seriesId: string;
      sceneId: string;
      shots: ShotContract[];
      characterDna?: CharacterDNA[];
      locationDna?: LocationDNA;
      outputDir: string;
      maxCreditBudget?: number;
      videoGenerator: (shot: ShotContract, terminalFramePath?: string) => Promise<{ videoPath: string; sha256: string }>;
    }
  ): Promise<MultiShotSequenceResult> {
    const { runId, projectId, seriesId, sceneId, shots, outputDir, maxCreditBudget = 50, videoGenerator } = input;

    // 1. Budget Projection Check (Fail Closed)
    const budget = SequentialMultiShotEngine.projectBudget(shots, { maxCreditBudget });
    if (!budget.isWithinBudget) {
      throw new Error(
        `[BUDGET_EXCEEDED] Projected Flow credits (${budget.projectedFlowCredits}) exceed configured limit (${budget.maxCreditBudget}). Deficit: ${budget.budgetDeficit} credits.`
      );
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const executedShots: SequentialShotExecutionResult[] = [];
    let previousTerminalFrame: { filePath: string; sha256: string } | undefined;

    // 2. Sequential Execution Loop (32A & 32B)
    for (let i = 0; i < shots.length; i++) {
      let currentShot = shots[i];
      const shotDir = path.join(outputDir, currentShot.id);
      fs.mkdirSync(shotDir, { recursive: true });

      // Apply current scene props to shot contract (32C)
      currentShot = this.propTracker.applyPropsToShotContract(currentShot, seriesId, projectId, sceneId);

      // If downstream shot has terminal frame conditioning dependency, attach previous terminal frame
      const terminalFrameDependency = previousTerminalFrame?.filePath;

      // Generate video using provided generator (provider or mock)
      const genResult = await videoGenerator(currentShot, terminalFrameDependency);

      // Verify physical video artifact
      const verif = ArtifactVerifier.verifyVideo(genResult.videoPath);
      if (!verif.exists || !verif.nonEmpty || !verif.hasVideoStream || (verif.durationSeconds ?? 0) <= 0) {
        throw new Error(`[MEDIA_INVALID] Shot "${currentShot.id}" failed physical video verification: ${verif.error}`);
      }

      // 32B: Extract deterministic terminal frame for downstream handoff
      const terminalFrame = FrameExtractor.extractTerminalFrame(
        genResult.videoPath,
        path.join(shotDir, 'terminal_frame.jpg')
      );
      previousTerminalFrame = terminalFrame;

      // Record snapshot of active props for evidence
      const activeProps = this.propTracker.getActiveProps(seriesId, projectId, sceneId);

      // Check continuity against previous shot
      let continuityScore = 100;
      let passedContinuity = true;
      if (executedShots.length > 0) {
        const prevShot = shots[i - 1];
        const report = ContinuityQAEvaluator.evaluate({
          projectId,
          sceneId,
          shots: [prevShot, currentShot],
        });
        passedContinuity = report.overallPassed;
        continuityScore = report.overallPassed ? 100 : Math.max(0, 100 - report.issues.length * 20);
      }

      executedShots.push({
        shotId: currentShot.id,
        sequenceIndex: i + 1,
        clipPath: genResult.videoPath,
        clipSha256: genResult.sha256,
        terminalFramePath: terminalFrame.filePath,
        terminalFrameSha256: terminalFrame.sha256,
        propsAtExecution: activeProps,
        continuityScore,
        passedContinuity,
      });
    }

    const continuityAllPassed = executedShots.every((s) => s.passedContinuity);

    return {
      runId,
      projectId,
      seriesId,
      totalShots: shots.length,
      shots: executedShots,
      budgetProjection: budget,
      continuityAllPassed,
      masterAssembled: false,
    };
  }

  /**
   * Phase 32G — Surgical Retake Invalidation.
   * If Shot N is retaken:
   * 1. Preserves Shot 1..N-1.
   * 2. Invalidates Shot N and downstream dependent shots (N+1..end).
   * 3. Rolls back prop state mutations caused by Shot N and downstream.
   */
  public surgicalRetake(
    seriesId: string,
    projectId: string,
    sceneId: string,
    retakeShotId: string,
    allShots: ShotContract[],
    run?: ProductionRun
  ): {
    preservedShotIds: string[];
    invalidatedShotIds: string[];
    rolledBackProps: string[];
  } {
    const retakeIndex = allShots.findIndex((s) => s.id === retakeShotId);
    if (retakeIndex === -1) {
      throw new Error(`Cannot perform surgical retake: shot "${retakeShotId}" not found in sequence.`);
    }

    const preservedShotIds = allShots.slice(0, retakeIndex).map((s) => s.id);
    const invalidatedShotIds = allShots.slice(retakeIndex).map((s) => s.id);

    // Rollback prop mutations for all invalidated shots in reverse order
    const rolledBackPropsSet = new Set<string>();
    for (const shotId of [...invalidatedShotIds].reverse()) {
      const rollback = this.propTracker.invalidateMutationsForShot(seriesId, projectId, sceneId, shotId);
      for (const p of rollback.affectedProps) {
        rolledBackPropsSet.add(p);
      }
    }

    // If a ProductionRun was provided, cascade invalidation in production state machine
    if (run) {
      for (const shotId of invalidatedShotIds) {
        ProductionInvalidationEngine.invalidateOnMediaChange(
          run,
          shotId,
          `Surgical retake of upstream shot "${retakeShotId}"`
        );
      }
    }

    return {
      preservedShotIds,
      invalidatedShotIds,
      rolledBackProps: Array.from(rolledBackPropsSet),
    };
  }
}
