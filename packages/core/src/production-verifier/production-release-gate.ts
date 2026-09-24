import * as fs from 'node:fs';
import * as path from 'node:path';
import { IStorageProvider, FileSystemStorage } from '../storage/index.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { GeminiProvider } from '../llm/gemini-provider.js';
import { LiveAuthorizationPolicy } from '../llm/live-authorization.js';
import { ProductionRun } from '../domain/production-run.js';
import { ProductionAcceptanceBundle } from './acceptance-bundle.js';
import { ProductionInvariantValidator } from './production-invariants.js';
import { ProductionLeakDetector } from './production-leak-detector.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';

export type ReleaseGateStatus =
  | 'BLOCKED_ENVIRONMENT'
  | 'READY_FOR_LIVE_PILOT'
  | 'WAITING_FOR_PROVIDER'
  | 'NEEDS_USER_ACTION'
  | 'LIVE_PILOT_IN_PROGRESS'
  | 'LIVE_PILOT_VERIFIED'
  | 'MASTER_PRODUCTION_VERIFIED';

export interface ReleaseGateCheckDetail {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
}

export interface ReleaseGateReport {
  status: ReleaseGateStatus;
  isVerified: boolean;
  derivedAt: string;
  runId?: string;
  projectId?: string;
  reasons: string[];
  blockers: string[];
  checks: Record<string, boolean>;
  checkDetails: ReleaseGateCheckDetail[];
  nextAction: string;
  recommendedCommand: string;
  operatorRequired: boolean;
  providerRequired: boolean;
}

export interface EvaluateReleaseGateOptions {
  runId?: string;
  projectId?: string;
  storyFilePath?: string;
  storage?: IStorageProvider;
  run?: ProductionRun;
}

export class ProductionReleaseGate {
  /**
   * Evaluates the authoritative release gate for AI Animation Studio.
   *
   * MASTER_PRODUCTION_VERIFIED is strictly DERIVED from physical evidence on disk.
   * It is NEVER assigned manually or defaulted to success.
   *
   * Returns one of:
   * - BLOCKED_ENVIRONMENT
   * - READY_FOR_LIVE_PILOT
   * - WAITING_FOR_PROVIDER
   * - NEEDS_USER_ACTION
   * - LIVE_PILOT_IN_PROGRESS
   * - LIVE_PILOT_VERIFIED
   * - MASTER_PRODUCTION_VERIFIED
   */
  public static async evaluate(options: EvaluateReleaseGateOptions = {}): Promise<ReleaseGateReport> {
    const reasons: string[] = [];
    const blockers: string[] = [];
    const checkDetails: ReleaseGateCheckDetail[] = [];
    const checks: Record<string, boolean> = {
      nodeRuntimeValid: false,
      ffmpegAvailable: false,
      ffprobeAvailable: false,
      geminiConfigured: false,
      liveAuthorizationGranted: false,
      allShotsAuthoritativeMedia: false,
      allMediaPhysicallyExists: false,
      zeroTestOrSmokeLeakage: false,
      mediaCryptographicChecksumValid: false,
      allShotsRealFlowGenerated: false,
      multimodalQAPassed: false,
      allShotsHumanApproved: false,
      approvalChallengeCeremonyValid: false,
      masterMediaPhysicallyVerified: false,
      acceptanceBundleValid: false,
      productionInvariantsValid: false,
    };

    // ── 1. Toolchain & Runtime Environment Checks
    const nodeVer = process.version;
    const majorVer = parseInt(nodeVer.replace(/^v/, '').split('.')[0], 10);
    if (majorVer >= 20) {
      checks.nodeRuntimeValid = true;
      checkDetails.push({ id: 'node', name: 'Node.js Runtime', passed: true, message: nodeVer });
    } else {
      checks.nodeRuntimeValid = false;
      blockers.push(`Node.js version ${nodeVer} is unsupported. Node >= 20.0.0 is required.`);
      checkDetails.push({ id: 'node', name: 'Node.js Runtime', passed: false, message: `${nodeVer} (< 20.0.0)` });
    }

    const mediaDiag = MediaToolchainDoctor.diagnose();
    if (mediaDiag.ffmpeg.available) {
      checks.ffmpegAvailable = true;
      checkDetails.push({ id: 'ffmpeg', name: 'FFmpeg Binary', passed: true, message: mediaDiag.ffmpeg.path });
    } else {
      checks.ffmpegAvailable = false;
      blockers.push('FFmpeg binary is missing from PATH or system directories.');
      checkDetails.push({ id: 'ffmpeg', name: 'FFmpeg Binary', passed: false, message: 'Not found' });
    }

    if (mediaDiag.ffprobe.available) {
      checks.ffprobeAvailable = true;
      checkDetails.push({ id: 'ffprobe', name: 'FFprobe Binary', passed: true, message: mediaDiag.ffprobe.path });
    } else {
      checks.ffprobeAvailable = false;
      blockers.push('FFprobe binary is missing from PATH or system directories.');
      checkDetails.push({ id: 'ffprobe', name: 'FFprobe Binary', passed: false, message: 'Not found' });
    }

    // Fail immediately if core environment is blocked
    if (!checks.nodeRuntimeValid || !checks.ffmpegAvailable || !checks.ffprobeAvailable) {
      return {
        status: 'BLOCKED_ENVIRONMENT',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        reasons: blockers,
        blockers,
        checks,
        checkDetails,
        nextAction: 'Install required toolchain components (Node >= 20, FFmpeg, FFprobe).',
        recommendedCommand: 'studio doctor',
        operatorRequired: true,
        providerRequired: false,
      };
    }

    // ── 2. Gemini Provider Credential & Live Authorization Check
    const isLiveOptIn = process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
    const gemini = new GeminiProvider({ allowLiveCalls: isLiveOptIn });
    const hasApiKey = gemini.isConfigured();
    const maskedKey = gemini.getMaskedApiKey();
    const liveAuth = LiveAuthorizationPolicy.isLiveAuthorized();

    checks.geminiConfigured = hasApiKey;
    checkDetails.push({
      id: 'gemini_key',
      name: 'Gemini API Key',
      passed: hasApiKey,
      message: hasApiKey ? maskedKey : 'Not configured',
    });

    checks.liveAuthorizationGranted = liveAuth;
    checkDetails.push({
      id: 'live_auth',
      name: 'Live Authorization Policy',
      passed: liveAuth,
      message: liveAuth ? 'AUTHORIZED' : 'OFFLINE_ONLY',
    });

    const storage = options.storage ?? new FileSystemStorage(process.cwd());

    // ── 3. Resolve ProductionRun if not directly provided
    let run: ProductionRun | undefined = options.run;
    if (!run && options.runId) {
      run = await this.findProductionRun(options.runId, options.projectId, storage);
    }

    // If no active run is being evaluated: preflight readiness evaluation
    if (!run) {
      if (!hasApiKey) {
        return {
          status: 'WAITING_FOR_PROVIDER',
          isVerified: false,
          derivedAt: new Date().toISOString(),
          reasons: ['GEMINI_API_KEY environment variable is not configured.'],
          blockers: ['Missing GEMINI_API_KEY'],
          checks,
          checkDetails,
          nextAction: 'Configure GEMINI_API_KEY to enable live Gemini provider integration.',
          recommendedCommand: 'export GEMINI_API_KEY=your_key_here',
          operatorRequired: true,
          providerRequired: true,
        };
      }

      return {
        status: 'READY_FOR_LIVE_PILOT',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        reasons: ['Environment and live Gemini credentials are verified. Ready to initiate live pilot.'],
        blockers: [],
        checks,
        checkDetails,
        nextAction: 'Initiate genuine live pilot using the canonical pilot story.',
        recommendedCommand: 'studio production pilot examples/stories/pilot-01.txt --live',
        operatorRequired: true,
        providerRequired: false,
      };
    }

    // ── 4. Lifecycle State Checks from ProductionRun
    const targetShotId = run.resumeMetadata.targetShotId || run.currentShotId || run.pendingShotIds[0] || 'SHOT_01';
    const handoffPath = `.studio/production/${run.projectId}/${run.runId}/handoff/${targetShotId}`;
    const expectedImportCmd = `studio production import ${run.runId} ${targetShotId} <path_to_downloaded_mp4> --source google-flow --real-external`;

    if (run.status === 'WAITING_FOR_PROVIDER') {
      return {
        status: 'WAITING_FOR_PROVIDER',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons: [run.resumeMetadata.blockedReason || 'Gemini API quota exceeded or provider temporarily unavailable.'],
        blockers: ['Provider quota exhausted or rate limited'],
        checks,
        checkDetails,
        nextAction: 'Wait for Gemini API quota window to reset, then resume the run.',
        recommendedCommand: `studio production resume ${run.runId}`,
        operatorRequired: false,
        providerRequired: true,
      };
    }

    if (run.status === 'NEEDS_USER_ACTION' || run.status === 'WAITING_FOR_IMPORT') {
      return {
        status: 'NEEDS_USER_ACTION',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons: [`Shot "${targetShotId}" requires external Google Flow generation and operator media import.`],
        blockers: [`Awaiting video import for shot "${targetShotId}"`],
        checks,
        checkDetails,
        nextAction: `Generate video in Google Flow using package at "${handoffPath}", then import downloaded MP4.`,
        recommendedCommand: expectedImportCmd,
        operatorRequired: true,
        providerRequired: false,
      };
    }

    if (run.status === 'APPROVAL_REQUIRED') {
      return {
        status: 'NEEDS_USER_ACTION',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons: [`Shot "${targetShotId}" is awaiting interactive human operator review ceremony.`],
        blockers: [`Awaiting HUMAN approval for shot "${targetShotId}"`],
        checks,
        checkDetails,
        nextAction: `Operator must review QA findings and execute interactive challenge approval ceremony.`,
        recommendedCommand: `studio production approve ${run.runId} ${targetShotId} --human`,
        operatorRequired: true,
        providerRequired: false,
      };
    }

    if (
      run.status === 'RUNNING' ||
      run.status === 'VERIFYING_MEDIA' ||
      run.status === 'VISUAL_QA' ||
      run.status === 'ASSEMBLING' ||
      run.status === 'MASTER_QA'
    ) {
      return {
        status: 'LIVE_PILOT_IN_PROGRESS',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons: [`Production run is actively in progress (state: ${run.status}).`],
        blockers: [],
        checks,
        checkDetails,
        nextAction: 'Resume or continue the active production pipeline step.',
        recommendedCommand: `studio production resume ${run.runId}`,
        operatorRequired: false,
        providerRequired: true,
      };
    }

    // ── 5. Forensic Derivation of MASTER_PRODUCTION_VERIFIED from Physical Disk Evidence
    const shotSet = new Set<string>([...run.completedShotIds, ...run.pendingShotIds, ...run.blockedShotIds]);
    for (const s of Object.keys(run.mediaEvidence)) {
      shotSet.add(s);
    }
    const requiredShots = Array.from(shotSet);

    if (requiredShots.length === 0) {
      return {
        status: 'NEEDS_USER_ACTION',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons: ['No required shots defined or planned for this production run.'],
        blockers: ['No required shots'],
        checks,
        checkDetails,
        nextAction: 'Plan shots or resume story breakdown.',
        recommendedCommand: `studio production resume ${run.runId}`,
        operatorRequired: true,
        providerRequired: false,
      };
    }

    let allShotsHaveAuthoritativeMedia = true;
    let allMediaPhysicallyExists = true;
    let zeroTestOrSmokeLeakage = true;
    let mediaCryptographicChecksumValid = true;
    let allShotsRealFlowGenerated = true;
    let multimodalQAPassed = true;
    let allShotsHumanApproved = true;
    let approvalChallengeCeremonyValid = true;

    for (const shotId of requiredShots) {
      const media = run.mediaEvidence[shotId];
      if (!media) {
        allShotsHaveAuthoritativeMedia = false;
        allMediaPhysicallyExists = false;
        mediaCryptographicChecksumValid = false;
        reasons.push(`Shot "${shotId}" is missing authoritative media record.`);
        continue;
      }

      if (ProductionLeakDetector.isTestOrSmokeArtifact(media.physicalPath)) {
        zeroTestOrSmokeLeakage = false;
        reasons.push(`Shot "${shotId}" media leaks from a test, fixture, or smoke directory.`);
      }

      if (!fs.existsSync(media.physicalPath)) {
        allMediaPhysicallyExists = false;
        mediaCryptographicChecksumValid = false;
        reasons.push(`Media file for shot "${shotId}" does not exist on disk at "${media.physicalPath}".`);
        continue;
      }

      const fileStat = fs.statSync(media.physicalPath);
      if (fileStat.size === 0) {
        allMediaPhysicallyExists = false;
        reasons.push(`Media file for shot "${shotId}" at "${media.physicalPath}" is 0 bytes.`);
      }

      const verif = ArtifactVerifier.verify(media.physicalPath, { requireVideoStream: true });
      if (!verif.hasVideoStream) {
        allMediaPhysicallyExists = false;
        reasons.push(`Media file for shot "${shotId}" lacks a playable video stream.`);
      }

      if (verif.checksumSha256 !== media.sha256) {
        mediaCryptographicChecksumValid = false;
        reasons.push(
          `SHA-256 mismatch for shot "${shotId}": recorded ${media.sha256}, disk ${verif.checksumSha256}.`
        );
      }

      // Check Real Google Flow generation
      if (media.generationSource !== 'GOOGLE_FLOW_REAL') {
        allShotsRealFlowGenerated = false;
        reasons.push(
          `Shot "${shotId}" generation source is "${media.generationSource}", but MASTER_PRODUCTION_VERIFIED requires GOOGLE_FLOW_REAL.`
        );
      }

      // Check Multimodal QA
      const qa = run.qaEvidence[shotId];
      if (!qa) {
        multimodalQAPassed = false;
        reasons.push(`QA evidence missing for shot "${shotId}".`);
      } else {
        if (!qa.passed || qa.overallStatus !== 'PASS') {
          multimodalQAPassed = false;
          reasons.push(`QA for shot "${shotId}" failed (status: ${qa.overallStatus}).`);
        }
        if (qa.criticalDefects > 0) {
          multimodalQAPassed = false;
          reasons.push(`Shot "${shotId}" has ${qa.criticalDefects} unresolved critical defect(s).`);
        }
        if (qa.retakesRecommended > 0) {
          multimodalQAPassed = false;
          reasons.push(`Shot "${shotId}" has ${qa.retakesRecommended} pending retake(s).`);
        }
        if (qa.isSynthetic || qa.providerTrust !== 'LIVE_EXTERNAL') {
          multimodalQAPassed = false;
          reasons.push(
            `QA for shot "${shotId}" used non-live mechanism "${qa.mechanism}" with trust "${qa.providerTrust}".`
          );
        }
        if (qa.mediaSha256 !== media.sha256) {
          multimodalQAPassed = false;
          reasons.push(
            `QA SHA-256 for shot "${shotId}" (${qa.mediaSha256}) does not match current media SHA-256 (${media.sha256}).`
          );
        }
      }

      // Check Human Approval
      const approval = run.approvalEvidence[shotId];
      if (!approval || approval.status !== 'APPROVED') {
        allShotsHumanApproved = false;
        reasons.push(`Shot "${shotId}" is not approved into Canon.`);
      } else {
        if (approval.approvalType !== 'HUMAN') {
          allShotsHumanApproved = false;
          reasons.push(
            `Shot "${shotId}" approval type is "${approval.approvalType}". Only HUMAN approval satisfies master production truth.`
          );
        }
        if (approval.mediaSha256 !== media.sha256) {
          allShotsHumanApproved = false;
          reasons.push(`Shot "${shotId}" approval media SHA does not match current media SHA. Stale approval.`);
        }

        // Verify challenge ceremony binding
        const challenges = run.approvalChallenges || {};
        const matchingChallenge = Object.values(challenges).find(
          (c) =>
            c.shotId === shotId &&
            c.candidateAssetId === approval.candidateAssetId &&
            c.mediaSha256 === approval.mediaSha256 &&
            c.consumedAt !== null
        );
        if (!matchingChallenge) {
          approvalChallengeCeremonyValid = false;
          allShotsHumanApproved = false;
          reasons.push(`Shot "${shotId}" has approvalType=HUMAN but no valid consumed challenge ceremony is recorded.`);
        }
      }
    }

    checks.allShotsAuthoritativeMedia = allShotsHaveAuthoritativeMedia;
    checks.allMediaPhysicallyExists = allMediaPhysicallyExists;
    checks.zeroTestOrSmokeLeakage = zeroTestOrSmokeLeakage;
    checks.mediaCryptographicChecksumValid = mediaCryptographicChecksumValid;
    checks.allShotsRealFlowGenerated = allShotsRealFlowGenerated;
    checks.multimodalQAPassed = multimodalQAPassed;
    checks.allShotsHumanApproved = allShotsHumanApproved;
    checks.approvalChallengeCeremonyValid = approvalChallengeCeremonyValid;

    // ── 6. Master Video Deliverable Check
    let masterMediaPhysicallyVerified = false;
    const masterEv = run.masterEvidence;
    if (!masterEv) {
      reasons.push('Master evidence record is missing from ProductionRun.');
    } else if (!fs.existsSync(masterEv.masterVideoPath)) {
      reasons.push(`Master video file not found on disk at "${masterEv.masterVideoPath}".`);
    } else {
      const masterStat = fs.statSync(masterEv.masterVideoPath);
      if (masterStat.size === 0) {
        reasons.push(`Master video file at "${masterEv.masterVideoPath}" is 0 bytes.`);
      } else {
        const masterVerif = ArtifactVerifier.verify(masterEv.masterVideoPath, { requireVideoStream: true });
        if (!masterVerif.hasVideoStream) {
          reasons.push(`Master video file at "${masterEv.masterVideoPath}" lacks a playable video stream.`);
        } else if (masterVerif.checksumSha256 !== masterEv.masterSha256) {
          reasons.push(
            `Master video checksum mismatch: recorded ${masterEv.masterSha256}, disk computed ${masterVerif.checksumSha256}.`
          );
        } else if (ProductionLeakDetector.isTestOrSmokeArtifact(masterEv.masterVideoPath)) {
          zeroTestOrSmokeLeakage = false;
          reasons.push(`Master video path "${masterEv.masterVideoPath}" leaks from a test/smoke/fixture directory.`);
        } else {
          masterMediaPhysicallyVerified = true;
        }
      }
    }
    checks.masterMediaPhysicallyVerified = masterMediaPhysicallyVerified;

    // ── 7. Acceptance Bundle Validation
    let acceptanceBundleValid = false;
    const acceptanceDir = `.studio/production/${run.projectId}/${run.runId}/acceptance`;
    if (await storage.exists(`${acceptanceDir}/acceptance-manifest.json`)) {
      const bundleValidation = await ProductionAcceptanceBundle.validate(acceptanceDir, storage, {
        expectedRequiredShotIds: requiredShots,
        expectedMasterChecksum: masterEv?.masterSha256,
      });
      if (bundleValidation.valid) {
        acceptanceBundleValid = true;
      } else {
        reasons.push(`Acceptance bundle validation failed:\n- ${(bundleValidation.reasons || []).join('\n- ')}`);
      }
    } else {
      reasons.push(`Acceptance bundle manifest not found at "${acceptanceDir}/acceptance-manifest.json".`);
    }
    checks.acceptanceBundleValid = acceptanceBundleValid;

    // ── 8. Invariants Validation
    const invariantResult = ProductionInvariantValidator.validate(run);
    checks.productionInvariantsValid = invariantResult.valid;
    if (!invariantResult.valid) {
      reasons.push(...invariantResult.violations);
    }

    // ── 9. Final Authoritative Derivation
    const isMasterProductionVerified =
      checks.allShotsAuthoritativeMedia &&
      checks.allMediaPhysicallyExists &&
      checks.zeroTestOrSmokeLeakage &&
      checks.mediaCryptographicChecksumValid &&
      checks.allShotsRealFlowGenerated &&
      checks.multimodalQAPassed &&
      checks.allShotsHumanApproved &&
      checks.approvalChallengeCeremonyValid &&
      checks.masterMediaPhysicallyVerified &&
      checks.acceptanceBundleValid &&
      checks.productionInvariantsValid;

    if (isMasterProductionVerified) {
      return {
        status: 'MASTER_PRODUCTION_VERIFIED',
        isVerified: true,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons: [],
        blockers: [],
        checks,
        checkDetails,
        nextAction: 'Production master and durable acceptance bundle are verified.',
        recommendedCommand: `studio production export-evidence ${run.runId}`,
        operatorRequired: false,
        providerRequired: false,
      };
    }

    // If not master production verified, determine the exact truthful intermediate status
    if (
      checks.allShotsAuthoritativeMedia &&
      checks.allShotsRealFlowGenerated &&
      checks.multimodalQAPassed &&
      !checks.allShotsHumanApproved
    ) {
      return {
        status: 'NEEDS_USER_ACTION',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons,
        blockers: reasons,
        checks,
        checkDetails,
        nextAction: `Shot candidate passed live QA. Complete interactive HUMAN approval ceremony.`,
        recommendedCommand: `studio production approve ${run.runId} ${targetShotId} --human`,
        operatorRequired: true,
        providerRequired: false,
      };
    }

    if (!checks.allShotsRealFlowGenerated) {
      return {
        status: 'NEEDS_USER_ACTION',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons,
        blockers: reasons,
        checks,
        checkDetails,
        nextAction: `Awaiting real Google Flow video generation and import for shot "${targetShotId}".`,
        recommendedCommand: expectedImportCmd,
        operatorRequired: true,
        providerRequired: false,
      };
    }

    if (
      checks.allShotsAuthoritativeMedia &&
      checks.allShotsRealFlowGenerated &&
      checks.allShotsHumanApproved &&
      !checks.masterMediaPhysicallyVerified
    ) {
      return {
        status: 'LIVE_PILOT_VERIFIED',
        isVerified: false,
        derivedAt: new Date().toISOString(),
        runId: run.runId,
        projectId: run.projectId,
        reasons,
        blockers: reasons,
        checks,
        checkDetails,
        nextAction: 'Shots verified live with human approval. Render final master video deliverable.',
        recommendedCommand: `studio production render-master ${run.runId}`,
        operatorRequired: false,
        providerRequired: false,
      };
    }

    return {
      status: 'NEEDS_USER_ACTION',
      isVerified: false,
      derivedAt: new Date().toISOString(),
      runId: run.runId,
      projectId: run.projectId,
      reasons,
      blockers: reasons,
      checks,
      checkDetails,
      nextAction: 'Resolve blocking items to advance production release pipeline.',
      recommendedCommand: `studio production resume ${run.runId}`,
      operatorRequired: true,
      providerRequired: false,
    };
  }

  /**
   * Helper to locate a ProductionRun by runId across projects if projectId is omitted.
   */
  private static async findProductionRun(
    runId: string,
    projectId?: string,
    storage?: IStorageProvider
  ): Promise<ProductionRun | undefined> {
    const s = storage ?? new FileSystemStorage(process.cwd());
    if (projectId) {
      const runPath = `.studio/production/${projectId}/${runId}/production-run.json`;
      if (await s.exists(runPath)) {
        return s.readJson<ProductionRun>(runPath);
      }
      return undefined;
    }

    // Search .studio/production/
    const baseDir = '.studio/production';
    if (!fs.existsSync(baseDir)) return undefined;

    const projectDirs = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const dirent of projectDirs) {
      if (dirent.isDirectory()) {
        const candidate = `${baseDir}/${dirent.name}/${runId}/production-run.json`;
        if (fs.existsSync(candidate)) {
          return s.readJson<ProductionRun>(candidate);
        }
      }
    }

    return undefined;
  }
}
