import * as path from 'node:path';
import * as syncFs from 'node:fs';
import { ProductionRun } from '../domain/production-run.js';
import { IStorageProvider } from '../storage/index.js';

export interface ProductionStepStatus {
  stepIndex: number;
  name: string;
  status: string;
  details?: string;
}

export interface ProductionNextActionResult {
  state: string;
  blockingReason?: string;
  nextAction: string;
  recommendedCommand: string;
  operatorRequired: boolean;
  providerRequired: boolean;
  handoffPath?: string;
  expectedImportCommand?: string;
  stepMatrix: ProductionStepStatus[];
}

export class ProductionNextActionResolver {
  /**
   * Deterministically resolves the next production action and 11-step status matrix
   * from a ProductionRun entity and disk evidence.
   */
  public static async resolve(
    run: ProductionRun,
    storage?: IStorageProvider
  ): Promise<ProductionNextActionResult> {
    const targetShotId = run.resumeMetadata.targetShotId || run.currentShotId || 'SHOT_01';
    const media = run.mediaEvidence[targetShotId];
    const qa = run.qaEvidence[targetShotId];
    const approval = run.approvalEvidence[targetShotId];
    const master = run.masterEvidence;

    const handoffPath = `.studio/production/${run.projectId}/${run.runId}/handoff/${targetShotId}`;
    const expectedImportCommand = `studio production import ${run.runId} ${targetShotId} <path_to_downloaded_mp4> --source google-flow --real-external`;

    // 1. Evaluate 11 Steps
    const steps: ProductionStepStatus[] = [];

    // [1] STORY
    const storyExists = storage
      ? await storage.exists(`.studio/production/${run.projectId}/${run.runId}/source_story.txt`)
      : true;
    steps.push({
      stepIndex: 1,
      name: 'STORY',
      status: storyExists ? 'READY' : 'PENDING',
    });

    // [2] SHOT CONTRACT
    const shotsPlanned = run.pendingShotIds.length > 0 || run.completedShotIds.length > 0;
    steps.push({
      stepIndex: 2,
      name: 'SHOT CONTRACT',
      status: shotsPlanned ? 'READY' : (storyExists ? 'READY' : 'PENDING'),
    });

    // [3] FLOW HANDOFF
    let handoffReady = false;
    if (syncFs.existsSync(handoffPath) || (storage && await storage.exists(`${handoffPath}/handoff-manifest.json`))) {
      handoffReady = true;
    }
    steps.push({
      stepIndex: 3,
      name: 'FLOW HANDOFF',
      status: handoffReady ? 'READY' : (run.status === 'NEEDS_USER_ACTION' ? 'READY' : 'PENDING'),
      details: handoffReady ? handoffPath : undefined,
    });

    // [4] REAL MEDIA
    let mediaStatus = 'PENDING';
    if (media) {
      if (media.generationSource === 'GOOGLE_FLOW_REAL') {
        mediaStatus = 'VERIFIED';
      } else {
        mediaStatus = `REHEARSAL (${media.generationSource})`;
      }
    } else if (run.status === 'NEEDS_USER_ACTION' || run.status === 'WAITING_FOR_IMPORT') {
      mediaStatus = 'WAITING FOR IMPORT';
    }
    steps.push({
      stepIndex: 4,
      name: 'REAL MEDIA',
      status: mediaStatus,
      details: media ? `${media.width}x${media.height} (${media.container.toUpperCase()})` : undefined,
    });

    // [5] LIVE VISUAL QA
    let qaStatus = 'PENDING';
    if (qa) {
      if (qa.providerTrust === 'LIVE_EXTERNAL' && qa.passed) {
        qaStatus = 'VERIFIED';
      } else if (qa.passed) {
        qaStatus = `PASSED (${qa.mechanism})`;
      } else {
        qaStatus = 'FAILED';
      }
    }
    steps.push({
      stepIndex: 5,
      name: 'LIVE VISUAL QA',
      status: qaStatus,
      details: qa ? `Overall: ${qa.overallStatus}, Defects: ${qa.totalDefects}` : undefined,
    });

    // [6] HUMAN REVIEW
    let reviewStatus = 'PENDING';
    const challenge = Object.values(run.approvalChallenges ?? {}).find((c) => c.shotId === targetShotId && c.consumedAt === null);
    if (approval?.approvalType === 'HUMAN') {
      reviewStatus = 'COMPLETED';
    } else if (challenge) {
      reviewStatus = `CHALLENGE ISSUED (${challenge.challengeId})`;
    } else if (run.status === 'APPROVAL_REQUIRED') {
      reviewStatus = 'PENDING REVIEW';
    }
    steps.push({
      stepIndex: 6,
      name: 'HUMAN REVIEW',
      status: reviewStatus,
    });

    // [7] CANON APPROVAL
    let canonStatus = 'PENDING';
    if (approval) {
      if (approval.status === 'APPROVED') {
        canonStatus = approval.approvalType === 'HUMAN' ? 'VERIFIED (HUMAN)' : 'AUTOMATED_TEST';
      } else {
        canonStatus = 'REJECTED';
      }
    }
    steps.push({
      stepIndex: 7,
      name: 'CANON APPROVAL',
      status: canonStatus,
    });

    // [8] TIMELINE
    const timelineReady = run.completedShotIds.length > 0 && run.pendingShotIds.length === 0;
    steps.push({
      stepIndex: 8,
      name: 'TIMELINE',
      status: master ? 'READY' : (timelineReady ? 'READY' : 'PENDING'),
    });

    // [9] CONTINUITY
    const continuityPath = `.studio/production/${run.projectId}/${run.runId}/continuity_report.json`;
    const continuityReportExists = storage ? await storage.exists(continuityPath) : syncFs.existsSync(continuityPath);
    steps.push({
      stepIndex: 9,
      name: 'CONTINUITY',
      status: continuityReportExists ? 'VERIFIED' : 'PENDING',
    });

    // [10] MASTER
    let masterStatus = 'PENDING';
    if (master) {
      masterStatus = master.verificationStatus === 'MASTER_PRODUCTION_VERIFIED' ? 'MASTER_VERIFIED' : master.verificationStatus;
    }
    steps.push({
      stepIndex: 10,
      name: 'MASTER',
      status: masterStatus,
    });

    // [11] ACCEPTANCE
    const acceptanceManifestPath = `.studio/production/${run.projectId}/${run.runId}/acceptance/acceptance-manifest.json`;
    const acceptanceExists = storage ? await storage.exists(acceptanceManifestPath) : syncFs.existsSync(acceptanceManifestPath);
    steps.push({
      stepIndex: 11,
      name: 'ACCEPTANCE',
      status: acceptanceExists ? 'VERIFIED' : 'PENDING',
    });

    // 2. Determine State, Blocking Reason, and Next Action
    let state = run.status.toString();
    let blockingReason = run.resumeMetadata.blockedReason;
    let nextAction = run.resumeMetadata.nextAction || 'Continue production run.';
    let recommendedCommand = run.resumeMetadata.recommendedCommand || `studio production run ${run.runId}`;
    let operatorRequired = false;
    let providerRequired = false;

    if (run.status === 'WAITING_FOR_PROVIDER') {
      providerRequired = true;
      operatorRequired = false;
      // Distinguish Visual QA quota block from general pipeline quota block
      if (run.resumeMetadata.resumeStage === 'VISUAL_QA') {
        state = 'WAITING_FOR_GEMINI_VISUAL_QA_QUOTA';
        blockingReason = blockingReason || 'Gemini Visual QA rate limited.';
        nextAction = `Retry existing media QA for shot "${targetShotId}" after quota resets. Existing media evidence is preserved — no re-import or Flow regeneration needed.`;
        recommendedCommand = `studio production resume ${run.runId} --live`;
      } else {
        state = 'WAITING_FOR_GEMINI_QUOTA';
        blockingReason = blockingReason || 'Gemini API quota exceeded or provider unavailable.';
        nextAction = 'Wait for quota reset or update GEMINI_API_KEY, then resume.';
        recommendedCommand = `studio production resume ${run.runId}`;
      }
    } else if (run.status === 'NEEDS_USER_ACTION') {
      state = 'WAITING_FOR_FLOW_GENERATION';
      operatorRequired = true;
      providerRequired = false;
      nextAction = `Generate shot "${targetShotId}" in Google Flow using package at "${handoffPath}", then import downloaded MP4.`;
      recommendedCommand = expectedImportCommand;
    } else if (run.status === 'WAITING_FOR_IMPORT') {
      state = 'WAITING_FOR_MEDIA_IMPORT';
      operatorRequired = true;
      providerRequired = false;
      nextAction = `Import rendered video file for shot "${targetShotId}".`;
      recommendedCommand = expectedImportCommand;
    } else if (run.status === 'APPROVAL_REQUIRED') {
      state = 'WAITING_FOR_HUMAN_REVIEW';
      operatorRequired = true;
      providerRequired = false;
      nextAction = `Perform operator challenge ceremony to review and approve candidate for shot "${targetShotId}".`;
      recommendedCommand = `studio production approve ${run.runId} ${targetShotId} --human`;
    } else if (run.status === 'ASSEMBLING' || (timelineReady && !master)) {
      state = 'READY_FOR_TIMELINE';
      operatorRequired = false;
      providerRequired = false;
      nextAction = 'All required shots approved into Canon. Assemble timeline, mix audio, and render master.';
      recommendedCommand = `studio production resume ${run.runId}`;
    } else if (run.status === 'COMPLETED') {
      state = 'COMPLETED';
      operatorRequired = false;
      providerRequired = false;
      nextAction = 'Production run completed and master deliverable verified.';
      recommendedCommand = `studio production status ${run.runId}`;
    }

    return {
      state,
      blockingReason,
      nextAction,
      recommendedCommand,
      operatorRequired,
      providerRequired,
      handoffPath: handoffReady ? handoffPath : undefined,
      expectedImportCommand,
      stepMatrix: steps,
    };
  }
}
