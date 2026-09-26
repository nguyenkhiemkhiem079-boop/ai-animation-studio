import * as path from 'node:path';
import * as syncFs from 'node:fs';
import * as fs from 'node:fs/promises';
import { ProductionRun, ProductionRunStatus } from '../domain/production-run.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { ProductionRunStateMachine } from './production-run-state-machine.js';

export type InterruptionStage =
  | 'AFTER_PLANNING'
  | 'AFTER_PROMPT_COMPILATION'
  | 'SUBMITTED_AWAITING_PROVIDER'
  | 'PROVIDER_ASSET_DISCOVERED'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'MEDIA_VERIFIED'
  | 'APPROVAL_REQUIRED'
  | 'TIMELINE_ASSEMBLED'
  | 'MASTER_RENDERED'
  | 'UNKNOWN';

export interface CrashRecoveryAssessment {
  runId: string;
  projectId: string;
  interruptionStage: InterruptionStage;
  canSafelyResume: boolean;
  requiresOperatorIntervention: boolean;
  duplicateSubmissionRisk: boolean;
  reusableShotIds: string[];
  pendingShotIds: string[];
  corruptedShotIds: string[];
  recommendedAction: string;
}

export class ProductionCrashRecoveryManager {
  /**
   * Assesses an interrupted or crashed production run and generates a safe recovery plan.
   */
  public static assessRecovery(
    run: ProductionRun,
    projectRunDir: string = path.resolve(process.cwd(), '.studio', 'production', run.projectId, run.runId)
  ): CrashRecoveryAssessment {
    const reusableShotIds: string[] = [];
    const pendingShotIds: string[] = [];
    const corruptedShotIds: string[] = [];

    const allShotIds = [
      ...run.completedShotIds,
      ...run.pendingShotIds,
      ...run.blockedShotIds,
    ];
    const uniqueShotIds = Array.from(new Set(allShotIds));

    for (const shotId of uniqueShotIds) {
      const shotDir = path.join(projectRunDir, shotId);
      const clipPath = path.join(shotDir, 'clip.mp4');

      if (syncFs.existsSync(clipPath)) {
        const verif = ArtifactVerifier.verifyVideo(clipPath);
        if (verif.exists && verif.nonEmpty && verif.hasVideoStream && (verif.durationSeconds ?? 0) > 0) {
          reusableShotIds.push(shotId);
        } else {
          corruptedShotIds.push(shotId);
          pendingShotIds.push(shotId);
        }
      } else {
        pendingShotIds.push(shotId);
      }
    }

    // Determine interruption stage
    let interruptionStage: InterruptionStage = 'UNKNOWN';
    let duplicateSubmissionRisk = false;
    let requiresOperator = false;
    let recommendedAction = 'Resume pipeline execution from current checkpoint.';

    const status = run.status;
    const stage = run.currentStage;

    if (status === 'COMPLETED') {
      interruptionStage = 'MASTER_RENDERED';
      recommendedAction = 'Production already completed. Final master is intact.';
    } else if (status === 'MASTER_QA' || stage === 'master_render') {
      interruptionStage = 'TIMELINE_ASSEMBLED';
      recommendedAction = 'Resume at master QA and final delivery.';
    } else if (status === 'ASSEMBLING' || stage === 'timeline_assembly' || stage === 'media_verified') {
      interruptionStage = 'MEDIA_VERIFIED';
      recommendedAction = 'Assemble timeline from verified physical media clips.';
    } else if (status === 'APPROVAL_REQUIRED') {
      interruptionStage = 'APPROVAL_REQUIRED';
      requiresOperator = true;
      recommendedAction = 'Awaiting human operator approval challenge.';
    } else if (status === 'VERIFYING_MEDIA' || status === 'VISUAL_QA' || stage === 'downloaded') {
      interruptionStage = 'DOWNLOADED';
      recommendedAction = 'Execute technical and visual QA on downloaded assets.';
    } else if (stage === 'flow_downloading' || stage === 'downloading') {
      interruptionStage = 'DOWNLOADING';
      recommendedAction = 'Resume downloading in-flight provider video asset.';
    } else if (status === 'WAITING_FOR_IMPORT' || status === 'NEEDS_USER_ACTION') {
      interruptionStage = 'PROVIDER_ASSET_DISCOVERED';
      recommendedAction = 'Import or download the discovered provider video asset.';
    } else if (status === 'WAITING_FOR_PROVIDER' || stage === 'flow_generating') {
      interruptionStage = 'SUBMITTED_AWAITING_PROVIDER';
      duplicateSubmissionRisk = true;
      recommendedAction =
        'Poll existing in-flight provider generation. DO NOT issue duplicate submission.';
    } else if (stage === 'prompt_compilation') {
      interruptionStage = 'AFTER_PROMPT_COMPILATION';
      recommendedAction = 'Submit compiled batch prompt to provider.';
    } else if (stage === 'planning' || status === 'PREFLIGHT') {
      interruptionStage = 'AFTER_PLANNING';
      recommendedAction = 'Proceed from shot planning to routing.';
    }

    return {
      runId: run.runId,
      projectId: run.projectId,
      interruptionStage,
      canSafelyResume: !requiresOperator,
      requiresOperatorIntervention: requiresOperator,
      duplicateSubmissionRisk,
      reusableShotIds,
      pendingShotIds,
      corruptedShotIds,
      recommendedAction,
    };
  }

  /**
   * Cleans any corrupted (0-byte or invalid stream) downloaded clips so they can be freshly re-downloaded.
   */
  public static cleanCorruptedArtifacts(
    corruptedShotIds: string[],
    projectRunDir: string
  ): void {
    for (const shotId of corruptedShotIds) {
      const clipPath = path.join(projectRunDir, shotId, 'clip.mp4');
      if (syncFs.existsSync(clipPath)) {
        try {
          syncFs.unlinkSync(clipPath);
        } catch {}
      }
    }
  }

  /**
   * Prepares the state machine for deterministic resume without duplicate generation.
   */
  public static prepareResumeStateMachine(
    run: ProductionRun,
    assessment: CrashRecoveryAssessment
  ): ProductionRunStateMachine {
    const sm = new ProductionRunStateMachine(run);

    // If corrupted clips existed, ensure those shots are marked pending
    for (const corruptedId of assessment.corruptedShotIds) {
      sm.invalidateApprovalForShot(corruptedId);
    }

    // Update resume metadata
    sm.setResumeMetadata({
      canResume: assessment.canSafelyResume,
      resumeStage: assessment.interruptionStage,
      nextAction: assessment.recommendedAction,
    });

    return sm;
  }
}
