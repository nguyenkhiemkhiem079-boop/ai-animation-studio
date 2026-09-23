import {
  ProductionRun,
  ProductionRunStatus,
  assertLegalProductionRunTransition,
  ProductionMediaEvidence,
  ProductionQAEvidence,
  ProductionApprovalEvidence,
  ProductionApprovalChallenge,
  MasterProductionEvidence,
  ResumeMetadata,
} from '../domain/production-run.js';

export class ProductionRunStateMachine {
  constructor(private run: ProductionRun) {}

  public getRun(): ProductionRun {
    return { ...this.run };
  }

  public get status(): ProductionRunStatus {
    return this.run.status;
  }

  public get runId(): string {
    return this.run.runId;
  }

  public get projectId(): string {
    return this.run.projectId;
  }

  public get seriesId(): string {
    return this.run.seriesId;
  }

  public get mode(): 'MOCK' | 'LOCAL' | 'PRODUCTION' {
    return this.run.mode;
  }

  /**
   * Transitions to a new status. Throws ProductionSafetyError if transition is illegal.
   */
  public transition(nextStatus: ProductionRunStatus, contextMessage?: string): void {
    assertLegalProductionRunTransition(this.run.status, nextStatus, contextMessage);
    this.run.status = nextStatus;
    this.run.updatedAt = new Date().toISOString();

    if (nextStatus === 'RUNNING' && !this.run.startedAt) {
      this.run.startedAt = new Date().toISOString();
    }
    if ((nextStatus === 'COMPLETED' || nextStatus === 'FAILED' || nextStatus === 'CANCELLED') && !this.run.completedAt) {
      this.run.completedAt = new Date().toISOString();
    }
  }

  public setStage(stage: string, currentShotId?: string): void {
    this.run.currentStage = stage;
    if (currentShotId) {
      this.run.currentShotId = currentShotId;
    }
    this.run.updatedAt = new Date().toISOString();
  }

  public markShotCompleted(shotId: string): void {
    if (!this.run.completedShotIds.includes(shotId)) {
      this.run.completedShotIds.push(shotId);
    }
    this.run.pendingShotIds = this.run.pendingShotIds.filter((id) => id !== shotId);
    this.run.blockedShotIds = this.run.blockedShotIds.filter((id) => id !== shotId);
    this.run.updatedAt = new Date().toISOString();
  }

  public markShotBlocked(shotId: string): void {
    if (!this.run.blockedShotIds.includes(shotId)) {
      this.run.blockedShotIds.push(shotId);
    }
    this.run.pendingShotIds = this.run.pendingShotIds.filter((id) => id !== shotId);
    this.run.updatedAt = new Date().toISOString();
  }

  public setPendingShots(shotIds: string[]): void {
    this.run.pendingShotIds = [...shotIds];
    this.run.updatedAt = new Date().toISOString();
  }

  public recordMediaEvidence(evidence: ProductionMediaEvidence): void {
    this.run.mediaEvidence[evidence.shotId] = evidence;
    this.run.updatedAt = new Date().toISOString();
  }

  public recordQAEvidence(evidence: ProductionQAEvidence): void {
    this.run.qaEvidence[evidence.shotId] = evidence;
    this.run.updatedAt = new Date().toISOString();
  }

  public recordApprovalEvidence(evidence: ProductionApprovalEvidence): void {
    this.run.approvalEvidence[evidence.shotId] = evidence;
    if (this.run.mediaEvidence[evidence.shotId]) {
      this.run.mediaEvidence[evidence.shotId].approvalStatus = evidence.status;
    }
    this.run.updatedAt = new Date().toISOString();
  }

  public recordApprovalChallenge(challenge: ProductionApprovalChallenge): void {
    if (!this.run.approvalChallenges) {
      this.run.approvalChallenges = {};
    }
    this.run.approvalChallenges[challenge.challengeId] = challenge;
    this.run.updatedAt = new Date().toISOString();
  }

  public invalidateApprovalChallengesForShot(shotId: string): void {
    if (!this.run.approvalChallenges) return;
    const now = new Date().toISOString();
    for (const ch of Object.values(this.run.approvalChallenges)) {
      if (ch.shotId === shotId && ch.consumedAt === null) {
        ch.consumedAt = now;
      }
    }
    this.run.updatedAt = now;
  }

  public recordMasterEvidence(evidence: MasterProductionEvidence): void {
    this.run.masterEvidence = evidence;
    this.run.updatedAt = new Date().toISOString();
  }

  public setResumeMetadata(metadata: Partial<ResumeMetadata>): void {
    this.run.resumeMetadata = {
      ...this.run.resumeMetadata,
      ...metadata,
    };
    this.run.updatedAt = new Date().toISOString();
  }

  public fail(stage: string, message: string, errorCategory?: string): void {
    this.run.failure = {
      stage,
      errorCategory,
      message,
      timestamp: new Date().toISOString(),
    };
    this.transition('FAILED', message);
  }
}
