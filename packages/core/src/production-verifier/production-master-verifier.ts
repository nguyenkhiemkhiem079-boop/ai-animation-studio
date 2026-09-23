import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import {
  ProductionRun,
  MasterProductionEvidence,
  MasterProductionEvidenceSchema,
} from '../domain/production-run.js';
import { ProductionSafetyError } from '../domain/execution-mode.js';
import { ProductionLeakDetector } from './production-leak-detector.js';

export interface MasterVerificationInput {
  run: ProductionRun;
  requiredShotIds: string[];
  masterVideoPath: string;
  manifestId: string;
  sequenceId: string;
  continuityReport?: any;
}

export interface MasterVerificationResult {
  passed: boolean;
  status: 'MASTER_PRODUCTION_VERIFIED' | 'FAILED_VERIFICATION';
  evidence?: MasterProductionEvidence;
  checksSummary: Record<string, boolean>;
  reasons: string[];
}

export class ProductionMasterVerifier {
  /**
   * Performs an exhaustive 13-point production verification audit.
   * If any check fails, returns FAILED_VERIFICATION and reasons without fabricating pass.
   */
  public static verify(input: MasterVerificationInput): MasterVerificationResult {
    const {
      run,
      requiredShotIds,
      masterVideoPath,
      manifestId,
      sequenceId,
      continuityReport,
    } = input;

    const reasons: string[] = [];
    const checksSummary: Record<string, boolean> = {
      everyShotHasAuthoritativeMedia: true,
      everyMediaFilePhysicallyExists: true,
      everyMediaPassesArtifactVerifier: true,
      mediaCryptographicChecksumValid: true,
      zeroTestOrSmokeLeakage: true,
      visualSemanticCoverageEvaluated: true,
      noUnresolvedCriticalVisualDefects: true,
      noPendingRetakes: true,
      allCandidatesApprovedIntoCanon: true,
      timelineUsesApprovedCanonMedia: true,
      continuityQAMeetsProductionCriteria: true,
      finalMasterFilePhysicallyExistsAndNonZero: true,
      finalMasterFFprobeValidStream: true,
    };

    // 1. Every required shot has authoritative media in run.mediaEvidence
    for (const shotId of requiredShotIds) {
      const media = run.mediaEvidence[shotId];
      if (!media) {
        checksSummary.everyShotHasAuthoritativeMedia = false;
        reasons.push(`Shot "${shotId}" is missing authoritative media evidence in ProductionRun.`);
        continue;
      }

      // 2. Physical file exists
      if (!fs.existsSync(media.physicalPath)) {
        checksSummary.everyMediaFilePhysicallyExists = false;
        reasons.push(`Authoritative media for shot "${shotId}" not found on disk at "${media.physicalPath}".`);
        continue;
      }

      // 3. ArtifactVerifier checks
      const verif = ArtifactVerifier.verify(media.physicalPath, { requireVideoStream: true });
      if (!verif.exists || !verif.nonEmpty || !verif.hasVideoStream) {
        checksSummary.everyMediaPassesArtifactVerifier = false;
        reasons.push(`Authoritative media for shot "${shotId}" failed ArtifactVerifier: ${verif.error || 'Invalid media'}.`);
      }

      // 4. Cryptographic SHA-256 match
      if (verif.checksumSha256 !== media.sha256) {
        checksSummary.mediaCryptographicChecksumValid = false;
        reasons.push(
          `Checksum mismatch for shot "${shotId}": recorded ${media.sha256}, disk computed ${verif.checksumSha256}.`
        );
      }

      // 5. Leakage check
      if (run.mode === 'PRODUCTION') {
        if (ProductionLeakDetector.isTestOrSmokeArtifact(media.physicalPath)) {
          checksSummary.zeroTestOrSmokeLeakage = false;
          reasons.push(
            `Authoritative media for shot "${shotId}" at "${media.physicalPath}" leaks from a test/smoke/fixture directory in PRODUCTION mode.`
          );
        }
      }

      // 6. Visual Semantic QA evaluated
      const qa = run.qaEvidence[shotId];
      if (!qa) {
        checksSummary.visualSemanticCoverageEvaluated = false;
        reasons.push(`Visual QA evidence missing for shot "${shotId}".`);
      } else {
        if (qa.criticalDefects > 0) {
          checksSummary.noUnresolvedCriticalVisualDefects = false;
          reasons.push(`Shot "${shotId}" has ${qa.criticalDefects} unresolved critical visual defect(s).`);
        }
        if (qa.retakesRecommended > 0) {
          checksSummary.noPendingRetakes = false;
          reasons.push(`Shot "${shotId}" has ${qa.retakesRecommended} pending retake recommendation(s).`);
        }
      }

      // 7. Human approval
      const approval = run.approvalEvidence[shotId];
      if (!approval || approval.status !== 'APPROVED') {
        checksSummary.allCandidatesApprovedIntoCanon = false;
        reasons.push(`Shot "${shotId}" candidate asset has not been approved by a human into Canon.`);
      }
    }

    // 8. Continuity QA check
    if (continuityReport) {
      if (continuityReport.overallPassed === false) {
        checksSummary.continuityQAMeetsProductionCriteria = false;
        reasons.push(`Continuity QA overall status failed.`);
      }
      const criticals = continuityReport.issues?.filter((i: any) => i.severity === 'critical') ?? [];
      if (criticals.length > 0) {
        checksSummary.continuityQAMeetsProductionCriteria = false;
        reasons.push(`Continuity QA has ${criticals.length} unresolved critical defect(s).`);
      }
    }

    // 9. Final master file existence and non-zero size
    if (!fs.existsSync(masterVideoPath)) {
      checksSummary.finalMasterFilePhysicallyExistsAndNonZero = false;
      reasons.push(`Final master video file does not exist at "${masterVideoPath}".`);
    } else {
      const stats = fs.statSync(masterVideoPath);
      if (stats.size === 0) {
        checksSummary.finalMasterFilePhysicallyExistsAndNonZero = false;
        reasons.push(`Final master video file at "${masterVideoPath}" is empty (0 bytes).`);
      }
    }

    // 10. FFprobe analysis of master
    let masterSha256 = '';
    let masterDuration = 1.0;
    let masterWidth = 1920;
    let masterHeight = 1080;
    let masterVideoCodec = 'h264';
    let masterAudioCodec: string | null = null;
    let masterFps: number | null = null;
    let masterSizeBytes = 0;

    if (checksSummary.finalMasterFilePhysicallyExistsAndNonZero) {
      const masterVerif = ArtifactVerifier.verify(masterVideoPath, { requireVideoStream: true });
      if (!masterVerif.hasVideoStream || !masterVerif.checksumSha256) {
        checksSummary.finalMasterFFprobeValidStream = false;
        reasons.push(`Final master video file at "${masterVideoPath}" does not contain a valid playable video stream.`);
      } else {
        masterSha256 = masterVerif.checksumSha256;
        masterDuration = masterVerif.durationSeconds && masterVerif.durationSeconds > 0 ? masterVerif.durationSeconds : 1.0;
        masterWidth = masterVerif.width || 1920;
        masterHeight = masterVerif.height || 1080;
        masterVideoCodec = masterVerif.videoCodec || 'h264';
        masterAudioCodec = masterVerif.audioCodec ?? null;
        masterFps = masterVerif.fps ?? null;
        masterSizeBytes = masterVerif.sizeBytes ?? 0;
      }
    } else {
      checksSummary.finalMasterFFprobeValidStream = false;
    }

    const allPassed = Object.values(checksSummary).every(Boolean) && reasons.length === 0;

    if (!allPassed) {
      return {
        passed: false,
        status: 'FAILED_VERIFICATION',
        checksSummary,
        reasons,
      };
    }

    const evidence: MasterProductionEvidence = {
      manifestId,
      sequenceId,
      masterVideoPath: path.resolve(masterVideoPath),
      masterSha256,
      sizeBytes: masterSizeBytes,
      durationSeconds: masterDuration,
      width: masterWidth,
      height: masterHeight,
      videoCodec: masterVideoCodec,
      audioCodec: masterAudioCodec,
      fps: masterFps,
      verifiedAt: new Date().toISOString(),
      verificationStatus: 'MASTER_PRODUCTION_VERIFIED',
      checksSummary,
    };

    return {
      passed: true,
      status: 'MASTER_PRODUCTION_VERIFIED',
      evidence: MasterProductionEvidenceSchema.parse(evidence),
      checksSummary,
      reasons: [],
    };
  }

  /**
   * Asserts verification, throwing ProductionSafetyError if verification fails.
   */
  public static assertVerified(input: MasterVerificationInput): MasterProductionEvidence {
    const result = this.verify(input);
    if (!result.passed || !result.evidence) {
      throw new ProductionSafetyError(
        `Master production verification failed:\n- ${result.reasons.join('\n- ')}`
      );
    }
    return result.evidence;
  }
}
