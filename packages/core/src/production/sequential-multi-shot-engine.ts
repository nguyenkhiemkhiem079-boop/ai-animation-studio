import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ShotContract } from '../domain/director.js';
import { CharacterDNA, LocationDNA } from '../domain/universe.js';
import { FrameExtractor } from '../qa/frame-extractor.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
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
  public readonly propTracker: ScenePropStateTracker;
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
    const {
      runId,
      projectId,
      seriesId,
      sceneId,
      shots,
      characterDna,
      locationDna,
      outputDir,
      maxCreditBudget = 50,
      videoGenerator,
    } = input;

    // 1. Budget Projection Check (Fail Closed)
    const budget = SequentialMultiShotEngine.projectBudget(shots, { maxCreditBudget });
    if (!budget.isWithinBudget) {
      throw new Error(
        `[BUDGET_EXCEEDED] Projected Flow credits (${budget.projectedFlowCredits}) exceed configured limit (${budget.maxCreditBudget}). Deficit: ${budget.budgetDeficit} credits.`
      );
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const executedShots: SequentialShotExecutionResult[] = [];
    const boundShots: ShotContract[] = [];
    let previousTerminalFrame: { filePath: string; sha256: string } | undefined;

    // 2. Sequential Execution Loop (32A & 32B)
    for (let i = 0; i < shots.length; i++) {
      let currentShot: ShotContract = {
        ...shots[i],
        acting: shots[i].acting ? shots[i].acting.map((a) => ({ ...a })) : [],
        requiredAssetIds: [...(shots[i].requiredAssetIds || [])],
      };
      const shotDir = path.join(outputDir, currentShot.id);
      fs.mkdirSync(shotDir, { recursive: true });

      // Materially bind CharacterDNA and enforce series isolation (Phase 41)
      if (characterDna && characterDna.length > 0) {
        for (const act of currentShot.acting || []) {
          const char = characterDna.find((c) => c.id === act.characterId);
          if (!char) {
            throw new Error(
              `[CHARACTER_NOT_FOUND] Shot "${currentShot.id}" references character "${act.characterId}", but character is not registered in Universe CharacterDNA.`
            );
          }
          if (char.seriesId !== seriesId) {
            throw new Error(
              `[CROSS_SERIES_CONTAMINATION] Character "${char.id}" belongs to series "${char.seriesId}", but current production is series "${seriesId}". Cross-series asset reuse is strictly prohibited.`
            );
          }
          if (char.canonicalSheetAssetId) {
            currentShot.requiredAssetIds = Array.from(
              new Set([...currentShot.requiredAssetIds, char.canonicalSheetAssetId])
            );
          }
          if (act.outfitId) {
            const outfit = char.outfits.find((o) => o.id === act.outfitId);
            if (outfit?.referenceAssetIds && outfit.referenceAssetIds.length > 0) {
              currentShot.requiredAssetIds = Array.from(
                new Set([...currentShot.requiredAssetIds, ...outfit.referenceAssetIds])
              );
            }
          }
          if (char.visualAnchorPrompt) {
            const anchorTag = `[Character: ${char.name} (${char.visualAnchorPrompt})]`;
            if (!act.actionPrompt?.includes(char.name)) {
              act.actionPrompt = act.actionPrompt ? `${act.actionPrompt} ${anchorTag}`.trim() : anchorTag;
            }
          }
        }
      }

      // Materially bind LocationDNA and enforce series isolation (Phase 41)
      if (locationDna) {
        if (locationDna.seriesId !== seriesId) {
          throw new Error(
            `[CROSS_SERIES_CONTAMINATION] Location "${locationDna.id}" belongs to series "${locationDna.seriesId}", but current production is series "${seriesId}". Cross-series asset reuse is strictly prohibited.`
          );
        }
        currentShot.environmentLocationId = locationDna.id;
        if (locationDna.canonicalAssetIds && locationDna.canonicalAssetIds.length > 0) {
          currentShot.requiredAssetIds = Array.from(
            new Set([...currentShot.requiredAssetIds, ...locationDna.canonicalAssetIds])
          );
        }
        if (locationDna.atmospherePrompt && currentShot.acting && currentShot.acting.length > 0) {
          const locTag = `[Location: ${locationDna.name} - ${locationDna.atmospherePrompt}]`;
          const firstAct = currentShot.acting[0];
          if (!firstAct.actionPrompt?.includes(locationDna.name)) {
            firstAct.actionPrompt = firstAct.actionPrompt ? `${firstAct.actionPrompt} ${locTag}`.trim() : locTag;
          }
        }
      }

      // Apply current scene props to shot contract (32C)
      currentShot = this.propTracker.applyPropsToShotContract(currentShot, seriesId, projectId, sceneId);
      boundShots.push(currentShot);

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

      // Check continuity against previous bound shot (Phase 41 Continuity QA)
      let continuityScore = 100;
      let passedContinuity = true;
      if (boundShots.length > 1) {
        const prevShot = boundShots[boundShots.length - 2];
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

    // 3. Assemble and render Final Multi-Shot Master Video (Phase 40)
    const masterVideoPath = path.join(outputDir, 'final-master.mp4');
    let masterAssembled = false;
    let masterSha256: string | undefined;

    if (executedShots.length > 0) {
      // 3A. Verify all shot video files exist before assembly
      for (const shotRes of executedShots) {
        if (!fs.existsSync(shotRes.clipPath)) {
          throw new Error(
            `[MASTER_ASSEMBLY_FAILED] Required shot clip "${shotRes.shotId}" not found on disk at "${shotRes.clipPath}"`
          );
        }
      }

      // 3B. Concat physical MP4 clips into final master using FFmpeg
      const concatPlanPath = path.join(outputDir, `.concat_${runId}.txt`);
      const concatLines = executedShots.map((s) => `file '${path.resolve(s.clipPath).replace(/\\/g, '/')}'`);
      fs.writeFileSync(concatPlanPath, concatLines.join('\n'), 'utf-8');

      const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
      try {
        execFileSync(
          ffmpegPath,
          [
            '-y',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            concatPlanPath,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            masterVideoPath,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
      } finally {
        if (fs.existsSync(concatPlanPath)) {
          try {
            fs.unlinkSync(concatPlanPath);
          } catch {
            // ignore cleanup
          }
        }
      }

      // 3C. Physically verify assembled master video with FFprobe
      const masterVerif = ArtifactVerifier.verifyVideo(masterVideoPath);
      if (
        masterVerif.exists &&
        masterVerif.nonEmpty &&
        masterVerif.hasVideoStream &&
        (masterVerif.durationSeconds ?? 0) > 0
      ) {
        const masterBytes = fs.readFileSync(masterVideoPath);
        masterSha256 = crypto.createHash('sha256').update(masterBytes).digest('hex');
        masterAssembled = true;
      } else {
        throw new Error(
          `[MASTER_VERIFICATION_FAILED] Assembled master video failed physical stream check: ${masterVerif.error}`
        );
      }
    }

    return {
      runId,
      projectId,
      seriesId,
      totalShots: shots.length,
      shots: executedShots,
      budgetProjection: budget,
      continuityAllPassed,
      masterAssembled,
      masterVideoPath: masterAssembled ? masterVideoPath : undefined,
      masterSha256,
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
