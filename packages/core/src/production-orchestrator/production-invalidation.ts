/**
 * ProductionInvalidationEngine: Formalizes cascading invalidation rules across
 * media, QA reports, approval challenges, canonical assets, timeline, and master deliverables.
 */

import { ProductionRun } from '../domain/production-run.js';
import { IStorageProvider } from '../storage/index.js';

export interface InvalidationCascadeReport {
  shotId?: string;
  invalidatedQA: boolean;
  invalidatedApproval: boolean;
  invalidatedChallengesCount: number;
  invalidatedMaster: boolean;
  invalidatedAcceptance: boolean;
  reason: string;
}

export class ProductionInvalidationEngine {
  /**
   * Cascading invalidation when a shot's media is replaced, altered, or re-imported.
   * Cascade: Media -> QA -> Approval Challenge -> Approval -> Completed State -> Master Evidence -> Acceptance.
   */
  public static invalidateOnMediaChange(run: ProductionRun, shotId: string, reason: string): InvalidationCascadeReport {
    let invalidatedQA = false;
    let invalidatedApproval = false;
    let invalidatedChallengesCount = 0;
    let invalidatedMaster = false;
    let invalidatedAcceptance = false;

    // 1. Invalidate QA
    if (run.qaEvidence[shotId]) {
      delete run.qaEvidence[shotId];
      invalidatedQA = true;
    }

    // 2. Invalidate Approval Challenges
    if (run.approvalChallenges) {
      const now = new Date().toISOString();
      for (const challenge of Object.values(run.approvalChallenges)) {
        if (challenge.shotId === shotId && challenge.consumedAt === null) {
          challenge.consumedAt = now; // Expire/invalidate open challenge
          invalidatedChallengesCount++;
        }
      }
    }

    // 3. Invalidate Approval
    if (run.approvalEvidence[shotId]) {
      delete run.approvalEvidence[shotId];
      invalidatedApproval = true;
    }

    // 4. Update Shot Completion State
    run.completedShotIds = run.completedShotIds.filter((id) => id !== shotId);
    if (!run.pendingShotIds.includes(shotId)) {
      run.pendingShotIds.push(shotId);
    }
    if (run.mediaEvidence[shotId]) {
      run.mediaEvidence[shotId].approvalStatus = 'PENDING';
    }

    // 5. Invalidate Master Evidence and downstream verification
    if (run.masterEvidence) {
      delete run.masterEvidence;
      invalidatedMaster = true;
      invalidatedAcceptance = true;
    }

    run.updatedAt = new Date().toISOString();

    return {
      shotId,
      invalidatedQA,
      invalidatedApproval,
      invalidatedChallengesCount,
      invalidatedMaster,
      invalidatedAcceptance,
      reason,
    };
  }

  /**
   * Cascading invalidation when QA is re-evaluated or altered.
   * Cascade: QA -> Approval Challenge -> Approval -> Completed State -> Master Evidence.
   */
  public static invalidateOnQAChange(run: ProductionRun, shotId: string, reason: string): InvalidationCascadeReport {
    let invalidatedApproval = false;
    let invalidatedChallengesCount = 0;
    let invalidatedMaster = false;
    let invalidatedAcceptance = false;

    // 1. Invalidate any open approval challenges bound to prior QA
    if (run.approvalChallenges) {
      const now = new Date().toISOString();
      for (const challenge of Object.values(run.approvalChallenges)) {
        if (challenge.shotId === shotId && challenge.consumedAt === null) {
          challenge.consumedAt = now;
          invalidatedChallengesCount++;
        }
      }
    }

    // 2. Invalidate Approval
    if (run.approvalEvidence[shotId]) {
      delete run.approvalEvidence[shotId];
      invalidatedApproval = true;
    }

    // 3. Update Shot Completion State
    run.completedShotIds = run.completedShotIds.filter((id) => id !== shotId);
    if (!run.pendingShotIds.includes(shotId)) {
      run.pendingShotIds.push(shotId);
    }
    if (run.mediaEvidence[shotId]) {
      run.mediaEvidence[shotId].approvalStatus = 'PENDING';
    }

    // 4. Invalidate Master Evidence
    if (run.masterEvidence) {
      delete run.masterEvidence;
      invalidatedMaster = true;
      invalidatedAcceptance = true;
    }

    run.updatedAt = new Date().toISOString();

    return {
      shotId,
      invalidatedQA: false,
      invalidatedApproval,
      invalidatedChallengesCount,
      invalidatedMaster,
      invalidatedAcceptance,
      reason,
    };
  }

  /**
   * Invalidates master deliverable and acceptance bundle when timeline is modified.
   */
  public static invalidateOnTimelineChange(run: ProductionRun, reason: string): InvalidationCascadeReport {
    let invalidatedMaster = false;
    let invalidatedAcceptance = false;

    if (run.masterEvidence) {
      delete run.masterEvidence;
      invalidatedMaster = true;
      invalidatedAcceptance = true;
    }

    run.updatedAt = new Date().toISOString();

    return {
      invalidatedQA: false,
      invalidatedApproval: false,
      invalidatedChallengesCount: 0,
      invalidatedMaster,
      invalidatedAcceptance,
      reason,
    };
  }

  /**
   * Cascading invalidation when a ShotContract is modified.
   * Cascade: ShotContract -> QA -> Approval Challenges -> Approval -> Completed State -> Master Evidence -> Acceptance.
   */
  public static invalidateOnShotContractChange(run: ProductionRun, shotId: string, reason: string): InvalidationCascadeReport {
    let invalidatedQA = false;
    let invalidatedApproval = false;
    let invalidatedChallengesCount = 0;
    let invalidatedMaster = false;
    let invalidatedAcceptance = false;

    // 1. Invalidate QA
    if (run.qaEvidence[shotId]) {
      delete run.qaEvidence[shotId];
      invalidatedQA = true;
    }

    // 2. Invalidate Challenges
    if (run.approvalChallenges) {
      const now = new Date().toISOString();
      for (const challenge of Object.values(run.approvalChallenges)) {
        if (challenge.shotId === shotId && challenge.consumedAt === null) {
          challenge.consumedAt = now;
          invalidatedChallengesCount++;
        }
      }
    }

    // 3. Invalidate Approval
    if (run.approvalEvidence[shotId]) {
      delete run.approvalEvidence[shotId];
      invalidatedApproval = true;
    }

    // 4. Update Shot Completion State
    run.completedShotIds = run.completedShotIds.filter((id) => id !== shotId);
    if (!run.pendingShotIds.includes(shotId)) {
      run.pendingShotIds.push(shotId);
    }
    if (run.mediaEvidence[shotId]) {
      run.mediaEvidence[shotId].approvalStatus = 'PENDING';
    }

    // 5. Invalidate Master & Acceptance
    if (run.masterEvidence) {
      delete run.masterEvidence;
      invalidatedMaster = true;
      invalidatedAcceptance = true;
    }

    run.updatedAt = new Date().toISOString();

    return {
      shotId,
      invalidatedQA,
      invalidatedApproval,
      invalidatedChallengesCount,
      invalidatedMaster,
      invalidatedAcceptance,
      reason,
    };
  }

  /**
   * Invalidates acceptance bundle when master deliverable is re-rendered or modified.
   */
  public static invalidateOnMasterChange(run: ProductionRun, reason: string): InvalidationCascadeReport {
    let invalidatedAcceptance = false;

    if (run.masterEvidence) {
      run.masterEvidence.verificationStatus = 'FAILED_VERIFICATION';
      run.masterEvidence.failureReason = `Master invalidated: ${reason}`;
      invalidatedAcceptance = true;
    }

    run.updatedAt = new Date().toISOString();

    return {
      invalidatedQA: false,
      invalidatedApproval: false,
      invalidatedChallengesCount: 0,
      invalidatedMaster: false,
      invalidatedAcceptance,
      reason,
    };
  }
}
