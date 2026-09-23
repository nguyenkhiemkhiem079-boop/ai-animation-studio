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
import { ShotContract } from '../domain/director.js';

export interface MasterVerificationInput {
  run: ProductionRun;
  requiredShotIds: string[];
  masterVideoPath: string;
  manifestId: string;
  sequenceId: string;
  continuityReport?: any;
  timelineSequence?: any;
  shotVideoMap?: Record<string, string>;
  shots?: ShotContract[];
  allowRehearsal?: boolean;
  acceptanceBundle?: {
    valid: boolean;
    reasons?: string[];
  };
}

export interface MasterVerificationResult {
  passed: boolean;
  status:
    | 'MASTER_PRODUCTION_VERIFIED'
    | 'OFFLINE_REHEARSAL_VERIFIED'
    | 'LOCAL_PRODUCTION_PIPELINE_VERIFIED'
    | 'FAILED_VERIFICATION';
  evidence?: MasterProductionEvidence;
  checksSummary: Record<string, boolean>;
  reasons: string[];
}

export class ProductionMasterVerifier {
  /**
   * Performs an exhaustive production verification audit.
   * In PRODUCTION mode, synthetic, offline, test doubles, mock providers, and automated approvals
   * MUST NEVER produce MASTER_PRODUCTION_VERIFIED.
   */
  public static verify(input: MasterVerificationInput): MasterVerificationResult {
    const {
      run,
      requiredShotIds,
      masterVideoPath,
      manifestId,
      sequenceId,
      continuityReport,
      timelineSequence,
      shotVideoMap,
      shots,
      allowRehearsal = false,
    } = input;

    const reasons: string[] = [];
    const checksSummary: Record<string, boolean> = {
      everyShotHasAuthoritativeMedia: false,
      everyMediaFilePhysicallyExists: false,
      everyMediaPassesArtifactVerifier: false,
      mediaCryptographicChecksumValid: false,
      zeroTestOrSmokeLeakage: false,
      allCandidatesApprovedIntoCanon: false,
      humanApprovalVerified: false,
      approvalChecksumMatchesMedia: false,
      noSimulatedMediaInProduction: false,
      timelineUsesApprovedCanonMedia: false,
      qaPassedAndDefectFree: false,
      qaChecksumMatchesMedia: false,
      visualSemanticCoverageEvaluated: false,
      continuityQAMeetsProductionCriteria: false,
      noPendingRetakes: false,
      finalMasterFilePhysicallyExistsAndNonZero: false,
      finalMasterFFprobeValidStream: false,
      acceptanceBundleVerified: false,
    };

    if (requiredShotIds.length === 0) {
      reasons.push('No required shots provided for production verification.');
      return {
        passed: false,
        status: 'FAILED_VERIFICATION',
        checksSummary,
        reasons,
      };
    }

    let allShotsHaveMedia = true;
    let allMediaFilesExist = true;
    let allMediaPassArtifact = true;
    let allChecksumsValid = true;
    let zeroLeakage = true;
    let allApprovedIntoCanon = true;
    let allHumanApproved = true;
    let allApprovalChecksumsValid = true;
    let noSimulatedFlow = true;
    let allQaPassedAndDefectFree = true;
    let allQaChecksumsValid = true;
    let allSemanticCoverageVerified = true;
    let allTimelineMediaValid = true;
    let allNoPendingRetakes = true;

    for (const shotId of requiredShotIds) {
      const media = run.mediaEvidence[shotId];
      if (!media) {
        allShotsHaveMedia = false;
        allMediaFilesExist = false;
        allMediaPassArtifact = false;
        allChecksumsValid = false;
        allApprovalChecksumsValid = false;
        allQaChecksumsValid = false;
        reasons.push(`Shot "${shotId}" is missing authoritative media evidence in ProductionRun.`);
        continue;
      }

      // Check 2: Physical existence
      if (!fs.existsSync(media.physicalPath)) {
        allMediaFilesExist = false;
        allMediaPassArtifact = false;
        allChecksumsValid = false;
        reasons.push(`Authoritative media for shot "${shotId}" not found on disk at "${media.physicalPath}".`);
        continue;
      }
      const fileStat = fs.statSync(media.physicalPath);
      if (fileStat.size === 0) {
        allMediaFilesExist = false;
        reasons.push(`Authoritative media for shot "${shotId}" at "${media.physicalPath}" is empty (0 bytes).`);
      }

      // Check 3: ArtifactVerifier
      const verif = ArtifactVerifier.verify(media.physicalPath, { requireVideoStream: true });
      if (!verif.exists || !verif.nonEmpty || !verif.hasVideoStream) {
        allMediaPassArtifact = false;
        reasons.push(`Authoritative media for shot "${shotId}" failed ArtifactVerifier: ${verif.error || 'Invalid video stream'}.`);
      }

      // Check 4: Cryptographic SHA-256 match
      if (verif.checksumSha256 !== media.sha256) {
        allChecksumsValid = false;
        reasons.push(
          `Checksum mismatch for shot "${shotId}": recorded ${media.sha256}, disk computed ${verif.checksumSha256}.`
        );
      }

      // Check 5: Leakage check
      if (run.mode === 'PRODUCTION') {
        if (ProductionLeakDetector.isTestOrSmokeArtifact(media.physicalPath)) {
          zeroLeakage = false;
          reasons.push(
            `Authoritative media for shot "${shotId}" at "${media.physicalPath}" leaks from a test/smoke/fixture directory in PRODUCTION mode.`
          );
        }
      }

      // Check 6 & 7: Approval checks
      const approval = run.approvalEvidence[shotId];
      if (!approval || approval.status !== 'APPROVED') {
        allApprovedIntoCanon = false;
        reasons.push(`Shot "${shotId}" candidate asset has not been approved into Canon.`);
      }
      if (!approval || approval.approvalType !== 'HUMAN') {
        allHumanApproved = false;
        reasons.push(
          `Shot "${shotId}" approval type is "${approval?.approvalType || 'NONE'}", but genuine production master requires HUMAN approval.`
        );
      }

      // Check 11: Approval checksum binding & invalidation
      if (approval) {
        if (!approval.mediaSha256) {
          if (run.mode === 'PRODUCTION' && !allowRehearsal) {
            allApprovalChecksumsValid = false;
            reasons.push(`Shot "${shotId}" approval is missing bound media SHA-256.`);
          }
        } else if (approval.mediaSha256 !== media.sha256) {
          allApprovalChecksumsValid = false;
          allHumanApproved = false;
          reasons.push(
            `Shot "${shotId}" approval checksum mismatch: approved SHA-256 is ${approval.mediaSha256}, but recorded media is ${media.sha256}. Media changed after approval; previous approval invalidated.`
          );
        } else if (verif.checksumSha256 && verif.checksumSha256 !== approval.mediaSha256) {
          allApprovalChecksumsValid = false;
          allHumanApproved = false;
          reasons.push(
            `Shot "${shotId}" approval checksum mismatch: approved SHA-256 is ${approval.mediaSha256}, but current disk file has ${verif.checksumSha256}. Media modified on disk after approval; approval invalidated.`
          );
        }
      } else {
        allApprovalChecksumsValid = false;
      }

      // Check 8: No simulated Flow media in genuine production
      if (media.generationSource === 'SIMULATED_FLOW') {
        noSimulatedFlow = false;
        reasons.push(
          `Shot "${shotId}" uses simulated Flow media (SIMULATED_FLOW) which cannot satisfy real production truth.`
        );
      }

      // Check 9: Timeline uses approved canonical media
      let boundTimelinePath: string | undefined;
      if (shotVideoMap) {
        boundTimelinePath = shotVideoMap[`clip_v1_${shotId}`] || shotVideoMap[shotId];
      } else if (timelineSequence) {
        for (const track of timelineSequence.tracks || []) {
          for (const clip of track.clips || []) {
            if (
              clip.metadata?.shotId === shotId ||
              clip.clipId === `clip_v1_${shotId}` ||
              clip.clipId === shotId
            ) {
              boundTimelinePath = clip.sourceVideoUri || clip.videoUri || clip.mediaPath;
              break;
            }
          }
        }
      }

      if (!boundTimelinePath) {
        allTimelineMediaValid = false;
        reasons.push(`Timeline does not contain a verified media binding for shot "${shotId}".`);
      } else if (!fs.existsSync(boundTimelinePath)) {
        allTimelineMediaValid = false;
        reasons.push(`Timeline media for shot "${shotId}" does not exist at "${boundTimelinePath}".`);
      } else {
        const timelineArtifact = ArtifactVerifier.verify(boundTimelinePath, { requireVideoStream: true });
        if (!timelineArtifact.exists || !timelineArtifact.nonEmpty || !timelineArtifact.hasVideoStream) {
          allTimelineMediaValid = false;
          reasons.push(`Timeline media for shot "${shotId}" at "${boundTimelinePath}" is not a valid video artifact.`);
        } else if (timelineArtifact.checksumSha256 !== media.sha256) {
          allTimelineMediaValid = false;
          reasons.push(
            `Timeline media for shot "${shotId}" checksum mismatch: timeline file has ${timelineArtifact.checksumSha256}, expected approved canonical ${media.sha256}.`
          );
        } else if (approval?.mediaSha256 && timelineArtifact.checksumSha256 !== approval.mediaSha256) {
          allTimelineMediaValid = false;
          reasons.push(
            `Timeline media for shot "${shotId}" checksum mismatch: timeline file has ${timelineArtifact.checksumSha256}, expected approved ${approval.mediaSha256}.`
          );
        }
      }

      // Check 10 & 11: QA evaluation and semantic coverage
      const qa = run.qaEvidence[shotId];
      if (!qa) {
        allQaPassedAndDefectFree = false;
        allSemanticCoverageVerified = false;
        allQaChecksumsValid = false;
        allNoPendingRetakes = false;
        reasons.push(`Visual QA evidence missing for shot "${shotId}".`);
      } else {
        // QA checksum binding
        if (qa.mediaSha256 && qa.mediaSha256 !== media.sha256) {
          allQaChecksumsValid = false;
          allQaPassedAndDefectFree = false;
          reasons.push(
            `Shot "${shotId}" QA evidence checksum mismatch: QA evaluated on ${qa.mediaSha256}, recorded media is ${media.sha256}. Re-QA required.`
          );
        }
        if (qa.mediaSha256 && verif.checksumSha256 && verif.checksumSha256 !== qa.mediaSha256) {
          allQaChecksumsValid = false;
          allQaPassedAndDefectFree = false;
          reasons.push(
            `Shot "${shotId}" QA evidence checksum mismatch: QA evaluated on ${qa.mediaSha256}, current disk file has ${verif.checksumSha256}. Re-QA required.`
          );
        }
        if (approval?.mediaSha256 && qa.mediaSha256 && qa.mediaSha256 !== approval.mediaSha256) {
          allQaChecksumsValid = false;
          allQaPassedAndDefectFree = false;
          reasons.push(
            `Shot "${shotId}" QA media checksum (${qa.mediaSha256}) does not match approved checksum (${approval.mediaSha256}). FAIL CLOSED.`
          );
        }

        // QA structural pass
        if (!qa.passed) {
          allQaPassedAndDefectFree = false;
          reasons.push(`Visual QA for shot "${shotId}" has passed=false.`);
        }
        if (qa.overallStatus === 'FAIL' || qa.overallStatus === 'NOT_EVALUATED' || qa.overallStatus === 'MISSING_ARTIFACT') {
          allQaPassedAndDefectFree = false;
          reasons.push(`Visual QA for shot "${shotId}" has overallStatus="${qa.overallStatus}".`);
        }
        if (qa.criticalDefects > 0) {
          allQaPassedAndDefectFree = false;
          reasons.push(`Shot "${shotId}" has ${qa.criticalDefects} unresolved critical visual defect(s).`);
        }
        if (qa.retakesRecommended > 0) {
          allQaPassedAndDefectFree = false;
          allNoPendingRetakes = false;
          reasons.push(`Shot "${shotId}" has ${qa.retakesRecommended} pending retake recommendation(s).`);
        }

        // Production semantic coverage eligibility
        const isSyntheticQa =
          qa.isSynthetic === true ||
          qa.mechanism === 'LOCAL_MEDIA_METADATA' ||
          qa.mechanism === 'OFFLINE_TEST_DOUBLE' ||
          qa.mechanism === 'MOCK';
        const isEligibleProvider = qa.providerTrust === 'LIVE_EXTERNAL' || qa.providerTrust === 'LOCAL_REAL';

        if (isSyntheticQa || !isEligibleProvider) {
          allSemanticCoverageVerified = false;
          reasons.push(
            `QA evidence for shot "${shotId}" used mechanism "${qa.mechanism}" with trust "${qa.providerTrust || 'UNKNOWN'}", which cannot establish production semantic truth.`
          );
        }

        // Semantic coverage by shot characteristics
        const shotContract = shots?.find((s) => s.id === shotId);
        const hasCharacters = Boolean(shotContract?.acting && shotContract.acting.length > 0);
        const hasMotion = Boolean(shotContract ? (shotContract.frame?.durationSeconds ?? 0) > 0 : true);
        const hasAction = Boolean(shotContract?.acting && shotContract.acting.length > 0) || shotContract?.purpose === 'action';

        const coverage = (qa.coverage as any) || {};
        if (hasCharacters && coverage.identityVisual !== 'VERIFIED') {
          allSemanticCoverageVerified = false;
          reasons.push(
            `Shot "${shotId}" has characters present, but visual identity coverage is "${coverage.identityVisual || 'NOT_EVALUATED'}".`
          );
        }
        if (hasMotion && coverage.temporalArtifactVisual !== 'VERIFIED') {
          allSemanticCoverageVerified = false;
          reasons.push(
            `Shot "${shotId}" has rendered motion, but temporal artifact coverage is "${coverage.temporalArtifactVisual || 'NOT_EVALUATED'}".`
          );
        }
        if (hasAction && coverage.semanticAction !== 'VERIFIED') {
          allSemanticCoverageVerified = false;
          reasons.push(
            `Shot "${shotId}" has action/acting, but semantic action coverage is "${coverage.semanticAction || 'NOT_EVALUATED'}".`
          );
        }
      }
    }

    checksSummary.everyShotHasAuthoritativeMedia = allShotsHaveMedia;
    checksSummary.everyMediaFilePhysicallyExists = allMediaFilesExist;
    checksSummary.everyMediaPassesArtifactVerifier = allMediaPassArtifact;
    checksSummary.mediaCryptographicChecksumValid = allChecksumsValid;
    checksSummary.zeroTestOrSmokeLeakage = zeroLeakage;
    checksSummary.allCandidatesApprovedIntoCanon = allApprovedIntoCanon;
    checksSummary.humanApprovalVerified = allHumanApproved;
    checksSummary.approvalChecksumMatchesMedia = allApprovalChecksumsValid;
    checksSummary.noSimulatedMediaInProduction = noSimulatedFlow;
    checksSummary.timelineUsesApprovedCanonMedia = allTimelineMediaValid;
    checksSummary.qaPassedAndDefectFree = allQaPassedAndDefectFree;
    checksSummary.qaChecksumMatchesMedia = allQaChecksumsValid;
    checksSummary.visualSemanticCoverageEvaluated = allSemanticCoverageVerified;
    checksSummary.noPendingRetakes = allNoPendingRetakes;

    // Check 12: Continuity QA
    if (!continuityReport) {
      checksSummary.continuityQAMeetsProductionCriteria = false;
      reasons.push('Continuity QA report is missing. Continuity verification is required for production.');
    } else {
      let contPassed = true;
      if (continuityReport.overallPassed !== true) {
        contPassed = false;
        reasons.push('Continuity QA overall status failed.');
      }
      const criticals = continuityReport.issues?.filter((i: any) => i.severity === 'critical') ?? [];
      if (criticals.length > 0) {
        contPassed = false;
        reasons.push(`Continuity QA has ${criticals.length} unresolved critical defect(s).`);
      }
      checksSummary.continuityQAMeetsProductionCriteria = contPassed;
    }

    // Check 18: Acceptance bundle validation
    let acceptanceValid = true;
    if (input.acceptanceBundle) {
      if (!input.acceptanceBundle.valid) {
        acceptanceValid = false;
        reasons.push(
          `Acceptance bundle verification failed:\n- ${(input.acceptanceBundle.reasons || []).join('\n- ')}`
        );
      }
    }
    checksSummary.acceptanceBundleVerified = acceptanceValid;

    // Check 13: Final master file existence and non-zero size
    let masterSha256 = '';
    let masterDuration = 1.0;
    let masterWidth = 1920;
    let masterHeight = 1080;
    let masterVideoCodec = 'h264';
    let masterAudioCodec: string | null = null;
    let masterFps: number | null = null;
    let masterSizeBytes = 0;

    if (!fs.existsSync(masterVideoPath)) {
      checksSummary.finalMasterFilePhysicallyExistsAndNonZero = false;
      checksSummary.finalMasterFFprobeValidStream = false;
      reasons.push(`Final master video file does not exist at "${masterVideoPath}".`);
    } else {
      const stats = fs.statSync(masterVideoPath);
      if (stats.size === 0) {
        checksSummary.finalMasterFilePhysicallyExistsAndNonZero = false;
        checksSummary.finalMasterFFprobeValidStream = false;
        reasons.push(`Final master video file at "${masterVideoPath}" is empty (0 bytes).`);
      } else {
        checksSummary.finalMasterFilePhysicallyExistsAndNonZero = true;

        // Check 14: FFprobe analysis of master
        const masterVerif = ArtifactVerifier.verify(masterVideoPath, { requireVideoStream: true });
        if (!masterVerif.hasVideoStream || !masterVerif.checksumSha256) {
          checksSummary.finalMasterFFprobeValidStream = false;
          reasons.push(
            `Final master video file at "${masterVideoPath}" does not contain a valid playable video stream.`
          );
        } else {
          checksSummary.finalMasterFFprobeValidStream = true;
          masterSha256 = masterVerif.checksumSha256;
          masterDuration =
            masterVerif.durationSeconds && masterVerif.durationSeconds > 0
              ? masterVerif.durationSeconds
              : 1.0;
          masterWidth = masterVerif.width || 1920;
          masterHeight = masterVerif.height || 1080;
          masterVideoCodec = masterVerif.videoCodec || 'h264';
          masterAudioCodec = masterVerif.audioCodec ?? null;
          masterFps = masterVerif.fps ?? null;
          masterSizeBytes = masterVerif.sizeBytes ?? 0;
        }
      }
    }

    const structuralPassed =
      checksSummary.everyShotHasAuthoritativeMedia &&
      checksSummary.everyMediaFilePhysicallyExists &&
      checksSummary.everyMediaPassesArtifactVerifier &&
      checksSummary.mediaCryptographicChecksumValid &&
      checksSummary.allCandidatesApprovedIntoCanon &&
      checksSummary.timelineUsesApprovedCanonMedia &&
      checksSummary.qaPassedAndDefectFree &&
      checksSummary.qaChecksumMatchesMedia &&
      checksSummary.finalMasterFilePhysicallyExistsAndNonZero &&
      checksSummary.finalMasterFFprobeValidStream;

    const productionTruthPassed =
      structuralPassed &&
      checksSummary.zeroTestOrSmokeLeakage &&
      checksSummary.humanApprovalVerified &&
      checksSummary.approvalChecksumMatchesMedia &&
      checksSummary.noSimulatedMediaInProduction &&
      checksSummary.visualSemanticCoverageEvaluated &&
      checksSummary.continuityQAMeetsProductionCriteria &&
      checksSummary.noPendingRetakes &&
      checksSummary.acceptanceBundleVerified;

    if (productionTruthPassed) {
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

    if (structuralPassed && allowRehearsal) {
      const rehearsalStatus =
        run.mode === 'LOCAL'
          ? 'LOCAL_PRODUCTION_PIPELINE_VERIFIED'
          : 'OFFLINE_REHEARSAL_VERIFIED';

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
        verificationStatus: rehearsalStatus,
        failureReason: reasons.join('; '),
        checksSummary,
      };

      return {
        passed: true,
        status: rehearsalStatus,
        evidence: MasterProductionEvidenceSchema.parse(evidence),
        checksSummary,
        reasons,
      };
    }

    return {
      passed: false,
      status: 'FAILED_VERIFICATION',
      checksSummary,
      reasons,
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
