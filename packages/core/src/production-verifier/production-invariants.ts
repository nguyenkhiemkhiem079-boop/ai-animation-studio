/**
 * ProductionInvariantValidator: Evaluates formal state invariants across a ProductionRun
 * and its associated evidence to guarantee fail-closed production truth.
 */

import { ProductionRun } from '../domain/production-run.js';
import { ProductionSafetyError } from '../domain/execution-mode.js';

export interface InvariantValidationResult {
  valid: boolean;
  violations: string[];
}

export class ProductionInvariantValidator {
  /**
   * Validates all formal production invariants for a given run.
   */
  public static validate(run: ProductionRun): InvariantValidationResult {
    const violations: string[] = [];

    // 1. Completion Invariant: COMPLETED requires master evidence
    if (run.status === 'COMPLETED') {
      if (!run.masterEvidence) {
        violations.push(`Invariant Violation: ProductionRun "${run.runId}" is marked COMPLETED but lacks masterEvidence.`);
      } else {
        if (!run.masterEvidence.masterSha256 || run.masterEvidence.masterSha256.length !== 64) {
          violations.push(`Invariant Violation: ProductionRun "${run.runId}" is COMPLETED but has invalid masterSha256.`);
        }
      }
    }

    // 2. Production Truth Invariant: MASTER_PRODUCTION_VERIFIED cannot coexist with simulated or offline doubles
    if (run.masterEvidence?.verificationStatus === 'MASTER_PRODUCTION_VERIFIED') {
      for (const [shotId, media] of Object.entries(run.mediaEvidence)) {
        if (media.generationSource === 'SIMULATED_FLOW') {
          violations.push(
            `Invariant Violation: MASTER_PRODUCTION_VERIFIED coexists with synthetic media "${media.generationSource}" for shot "${shotId}".`
          );
        }
      }
      for (const [shotId, qa] of Object.entries(run.qaEvidence)) {
        if (qa.isSynthetic || qa.providerTrust !== 'LIVE_EXTERNAL' || qa.mechanism === 'OFFLINE_TEST_DOUBLE' || qa.mechanism === 'MOCK') {
          violations.push(
            `Invariant Violation: MASTER_PRODUCTION_VERIFIED coexists with non-live/synthetic QA evidence for shot "${shotId}".`
          );
        }
      }
    }

    // 3. Human Approval Ceremony Invariant: HUMAN approval requires challenge ceremony proof
    for (const [shotId, approval] of Object.entries(run.approvalEvidence)) {
      if (approval.approvalType === 'HUMAN') {
        const challenges = run.approvalChallenges || {};
        const matchingChallenge = Object.values(challenges).find(
          (c) =>
            c.shotId === shotId &&
            c.candidateAssetId === approval.candidateAssetId &&
            c.mediaSha256 === approval.mediaSha256 &&
            c.consumedAt !== null
        );

        if (!matchingChallenge) {
          violations.push(
            `Invariant Violation: Shot "${shotId}" has approvalType="HUMAN" but no valid consumed approval challenge ceremony was found in evidence.`
          );
        }
      }
    }

    // 4. Authoritative QA Invariant: Approved media must have passed Visual QA with matching SHA-256
    for (const [shotId, approval] of Object.entries(run.approvalEvidence)) {
      if (approval.status === 'APPROVED') {
        const qa = run.qaEvidence[shotId];
        if (!qa) {
          violations.push(`Invariant Violation: Shot "${shotId}" is APPROVED but has no QA evidence.`);
        } else if (!qa.passed) {
          violations.push(`Invariant Violation: Shot "${shotId}" is APPROVED but QA status is FAILED.`);
        } else if (qa.mediaSha256 !== approval.mediaSha256) {
          violations.push(
            `Invariant Violation: Shot "${shotId}" approval media SHA (${approval.mediaSha256}) does not match QA media SHA (${qa.mediaSha256}).`
          );
        }
      }
    }

    // 5. Media Integrity Invariant: Recorded media SHA must match QA and approval where present
    for (const [shotId, media] of Object.entries(run.mediaEvidence)) {
      const qa = run.qaEvidence[shotId];
      if (qa && qa.mediaSha256 !== media.sha256) {
        violations.push(
          `Invariant Violation: Shot "${shotId}" media SHA (${media.sha256}) contradicts QA record SHA (${qa.mediaSha256}).`
        );
      }
      const approval = run.approvalEvidence[shotId];
      if (approval && approval.mediaSha256 !== media.sha256) {
        violations.push(
          `Invariant Violation: Shot "${shotId}" media SHA (${media.sha256}) contradicts approval record SHA (${approval.mediaSha256}).`
        );
      }
    }

    // 6. Retake Consistency Invariant: Pending retakes cannot coexist with completed state
    for (const [shotId, qa] of Object.entries(run.qaEvidence)) {
      if (qa.retakesRecommended > 0 && run.completedShotIds.includes(shotId)) {
        violations.push(
          `Invariant Violation: Shot "${shotId}" has ${qa.retakesRecommended} pending retakes but is marked completed in run.`
        );
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Asserts all invariants pass or throws ProductionSafetyError.
   */
  public static assertInvariants(run: ProductionRun): void {
    const result = this.validate(run);
    if (!result.valid) {
      throw new ProductionSafetyError(
        `Production State Invariant Failure:\n${result.violations.map((v) => ` - ${v}`).join('\n')}`
      );
    }
  }
}
