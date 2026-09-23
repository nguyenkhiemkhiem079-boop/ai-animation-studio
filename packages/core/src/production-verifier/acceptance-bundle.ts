import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { IStorageProvider } from '../storage/index.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import {
  AcceptanceManifest,
  AcceptanceManifestSchema,
  AcceptanceBundleMetadata,
  AcceptanceBundleMetadataSchema,
  MasterProductionEvidence,
  ProductionRun,
} from '../domain/production-run.js';
import { ProductionSafetyError } from '../domain/execution-mode.js';
import { EvidenceStore } from '../production-evidence/evidence-store.js';

export interface BuildAcceptanceBundleOptions {
  projectId: string;
  runId: string;
  storage: IStorageProvider;
  run: ProductionRun;
  masterEvidence: MasterProductionEvidence;
  requiredShotIds: string[];
  providerModelIds?: string[];
}

export interface ValidateAcceptanceBundleOptions {
  expectedRequiredShotIds?: string[];
  finalMasterVideoPath?: string;
  expectedMasterChecksum?: string;
  expectedVerificationStatus?: string;
}

export interface AcceptanceBundleValidationResult {
  valid: boolean;
  reasons: string[];
  manifest?: AcceptanceManifest;
  metadata?: AcceptanceBundleMetadata;
}

/**
 * Production Acceptance Bundle Builder & Integrity Verifier.
 *
 * NOTE ON INTEGRITY SEMANTICS:
 * The Acceptance Bundle employs SHA-256 integrity checksum verification and manifest
 * self-integrity hashing to detect accidental corruption or subsequent unauthorized file
 * modifications when the manifest is held authoritative. It provides content integrity
 * and checksum verification rather than asymmetric digital signatures or cryptographic
 * non-repudiation against an adversary capable of rewriting the entire bundle and recomputing hashes.
 */
export class ProductionAcceptanceBundle {
  public static readonly REQUIRED_FILES = [
    'production-acceptance.json',
    'provider-evidence.json',
    'media-evidence.json',
    'qa-evidence.json',
    'approval-evidence.json',
    'approval-challenges.json',
    'continuity-evidence.json',
    'master-evidence.json',
  ] as const;

  /**
   * Builds the durable acceptance bundle in .studio/production/<projectId>/<runId>/acceptance/
   */
  public static async build(options: BuildAcceptanceBundleOptions): Promise<{
    acceptanceDir: string;
    manifest: AcceptanceManifest;
    metadata: AcceptanceBundleMetadata;
  }> {
    const {
      projectId,
      runId,
      storage,
      run,
      masterEvidence,
      requiredShotIds,
      providerModelIds = [],
    } = options;

    const evidenceStore = new EvidenceStore(storage);
    const acceptanceDir = `.studio/production/${projectId}/${runId}/acceptance`;

    // Secret sanitization helper ensuring zero secret leakage in acceptance bundles
    const sanitize = (raw: any): any => {
      const str = JSON.stringify(raw);
      const cleaned = str
        .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_GEMINI_KEY]')
        .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]')
        .replace(/"apiKey":\s*"[^"]*"/gi, '"apiKey": "[REDACTED]"')
        .replace(/"GEMINI_API_KEY":\s*"[^"]*"/gi, '"GEMINI_API_KEY": "[REDACTED]"');
      return JSON.parse(cleaned);
    };

    // 1. Gather all evidence
    const providerEv = sanitize(await evidenceStore.loadProviderEvidence(projectId, runId));
    const mediaEv = sanitize(await evidenceStore.loadMediaEvidence(projectId, runId));
    const qaEv = sanitize(await evidenceStore.loadQAEvidence(projectId, runId));
    const approvalEv = sanitize(await evidenceStore.loadApprovalEvidence(projectId, runId));
    const challengesEv = sanitize(await evidenceStore.loadApprovalChallenges(projectId, runId));
    const masterEv = sanitize((await evidenceStore.loadMasterEvidence(projectId, runId)) ?? masterEvidence);

    // Continuity report
    const continuityPath = `.studio/production/${projectId}/${runId}/continuity_report.json`;
    let continuityEv: any = {};
    if (await storage.exists(continuityPath)) {
      continuityEv = sanitize(await storage.readJson(continuityPath));
    }

    const metadata: AcceptanceBundleMetadata = {
      bundleVersion: '1.0.0',
      runId,
      projectId,
      seriesId: run.seriesId,
      createdAt: run.createdAt,
      completedAt: new Date().toISOString(),
      providerModelIds: providerModelIds.length > 0 ? providerModelIds : (providerEv as any[]).map((p) => p.actualModel),
      requiredShotIds,
      finalMasterChecksum: masterEvidence.masterSha256,
      verificationStatus: masterEvidence.verificationStatus,
      allChecksPassed: masterEvidence.verificationStatus === 'MASTER_PRODUCTION_VERIFIED',
      checksSummary: masterEvidence.checksSummary,
    };

    // 2. Write individual evidence files
    const fileContents: Record<string, string> = {
      'production-acceptance.json': JSON.stringify(metadata, null, 2),
      'provider-evidence.json': JSON.stringify(providerEv, null, 2),
      'media-evidence.json': JSON.stringify(mediaEv, null, 2),
      'qa-evidence.json': JSON.stringify(qaEv, null, 2),
      'approval-evidence.json': JSON.stringify(approvalEv, null, 2),
      'approval-challenges.json': JSON.stringify(challengesEv, null, 2),
      'continuity-evidence.json': JSON.stringify(continuityEv, null, 2),
      'master-evidence.json': JSON.stringify(masterEv, null, 2),
    };

    const filesManifest: AcceptanceManifest['files'] = {};

    for (const fileName of this.REQUIRED_FILES) {
      const content = fileContents[fileName] || '{}';
      const filePath = `${acceptanceDir}/${fileName}`;
      await storage.write(filePath, content);

      const hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
      const sizeBytes = Buffer.byteLength(content, 'utf-8');

      filesManifest[fileName] = {
        path: fileName,
        sha256: hash,
        sizeBytes,
      };
    }

    // 3. Create acceptance manifest
    const manifestWithoutHash: AcceptanceManifest = {
      manifestVersion: '1.0.0',
      runId,
      projectId,
      seriesId: run.seriesId,
      createdAt: new Date().toISOString(),
      files: filesManifest,
    };

    const manifestContent = JSON.stringify(manifestWithoutHash, null, 2);
    const manifestSha = crypto.createHash('sha256').update(manifestContent, 'utf-8').digest('hex');
    manifestWithoutHash.manifestSha256 = manifestSha;

    await storage.writeJson(`${acceptanceDir}/acceptance-manifest.json`, manifestWithoutHash);

    return {
      acceptanceDir,
      manifest: manifestWithoutHash,
      metadata,
    };
  }

  /**
   * Validates a previously written acceptance bundle against its acceptance-manifest.json
   */
  public static async validate(
    acceptanceDir: string,
    storage: IStorageProvider,
    options?: ValidateAcceptanceBundleOptions
  ): Promise<AcceptanceBundleValidationResult> {
    const reasons: string[] = [];
    const manifestPath = `${acceptanceDir}/acceptance-manifest.json`;

    if (!(await storage.exists(manifestPath))) {
      reasons.push(`Acceptance manifest does not exist at "${manifestPath}".`);
      return { valid: false, reasons };
    }

    let manifest: AcceptanceManifest;
    try {
      const raw = await storage.readJson<AcceptanceManifest>(manifestPath);
      manifest = AcceptanceManifestSchema.parse(raw);
    } catch (err: any) {
      reasons.push(`Invalid acceptance manifest schema at "${manifestPath}": ${err?.message}`);
      return { valid: false, reasons };
    }

    // ── Self-integrity: recompute manifest SHA-256 (excluding the manifestSha256 field itself)
    if (manifest.manifestSha256) {
      const manifestForHashing = { ...manifest };
      delete manifestForHashing.manifestSha256;
      const recomputedManifestContent = JSON.stringify(manifestForHashing, null, 2);
      const recomputedSha = crypto.createHash('sha256').update(recomputedManifestContent, 'utf-8').digest('hex');
      if (recomputedSha !== manifest.manifestSha256) {
        reasons.push(
          `Acceptance manifest self-integrity check failed: recorded manifestSha256 is ${manifest.manifestSha256}, recomputed ${recomputedSha}. Manifest has been tampered with.`
        );
      }
    } else {
      reasons.push('Acceptance manifest is missing its own manifestSha256 self-integrity field.');
    }

    // Check each required file
    for (const fileName of this.REQUIRED_FILES) {
      const record = manifest.files[fileName];
      if (!record) {
        reasons.push(`Acceptance manifest is missing record for required file "${fileName}".`);
        continue;
      }

      const filePath = `${acceptanceDir}/${fileName}`;
      if (!(await storage.exists(filePath))) {
        reasons.push(`Required acceptance bundle file "${fileName}" is missing at "${filePath}".`);
        continue;
      }

      const content = await storage.read(filePath);
      const actualHash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
      const actualSize = Buffer.byteLength(content, 'utf-8');

      if (actualHash !== record.sha256) {
        reasons.push(
          `Cryptographic checksum mismatch for "${fileName}": manifest recorded ${record.sha256}, actual ${actualHash}.`
        );
      }
      if (actualSize !== record.sizeBytes) {
        reasons.push(
          `Size mismatch for "${fileName}": manifest recorded ${record.sizeBytes} bytes, actual ${actualSize} bytes.`
        );
      }
    }

    // Check master-evidence.json
    let masterEv: MasterProductionEvidence | undefined;
    const masterPath = `${acceptanceDir}/master-evidence.json`;
    if (await storage.exists(masterPath)) {
      try {
        masterEv = await storage.readJson<MasterProductionEvidence>(masterPath);
      } catch (err: any) {
        reasons.push(`Invalid master-evidence.json in acceptance bundle: ${err?.message}`);
      }
    } else {
      reasons.push('Acceptance bundle is missing required master-evidence.json.');
    }

    // Check acceptance metadata
    let metadata: AcceptanceBundleMetadata | undefined;
    const metaPath = `${acceptanceDir}/production-acceptance.json`;
    if (await storage.exists(metaPath)) {
      try {
        const raw = await storage.readJson<AcceptanceBundleMetadata>(metaPath);
        metadata = AcceptanceBundleMetadataSchema.parse(raw);

        // ── Metadata consistency: runId / projectId / seriesId must match the manifest
        if (metadata.runId !== manifest.runId) {
          reasons.push(
            `Metadata consistency failure: production-acceptance.json runId "${metadata.runId}" does not match manifest runId "${manifest.runId}".`
          );
        }
        if (metadata.projectId !== manifest.projectId) {
          reasons.push(
            `Metadata consistency failure: production-acceptance.json projectId "${metadata.projectId}" does not match manifest projectId "${manifest.projectId}".`
          );
        }
        if (metadata.seriesId !== manifest.seriesId) {
          reasons.push(
            `Metadata consistency failure: production-acceptance.json seriesId "${metadata.seriesId}" does not match manifest seriesId "${manifest.seriesId}".`
          );
        }

        // ── Master Checksum and Status Consistency with master-evidence.json
        if (masterEv) {
          if (metadata.finalMasterChecksum !== masterEv.masterSha256) {
            reasons.push(
              `Metadata consistency failure: production-acceptance.json finalMasterChecksum ("${metadata.finalMasterChecksum}") does not match master-evidence.json masterSha256 ("${masterEv.masterSha256}").`
            );
          }
          if (metadata.verificationStatus !== masterEv.verificationStatus) {
            reasons.push(
              `Metadata consistency failure: production-acceptance.json verificationStatus ("${metadata.verificationStatus}") does not match master-evidence.json verificationStatus ("${masterEv.verificationStatus}").`
            );
          }
        }

        if (options?.expectedMasterChecksum && metadata.finalMasterChecksum !== options.expectedMasterChecksum) {
          reasons.push(
            `Metadata consistency failure: finalMasterChecksum ("${metadata.finalMasterChecksum}") does not match expected master checksum ("${options.expectedMasterChecksum}").`
          );
        }
        if (options?.expectedVerificationStatus && metadata.verificationStatus !== options.expectedVerificationStatus) {
          reasons.push(
            `Metadata consistency failure: verificationStatus ("${metadata.verificationStatus}") does not match expected verification status ("${options.expectedVerificationStatus}").`
          );
        }

        // ── Check providerModelIds has no empty or undefined entries
        if (
          metadata.providerModelIds &&
          metadata.providerModelIds.some((m) => !m || typeof m !== 'string' || m.trim() === '')
        ) {
          reasons.push('Metadata consistency failure: providerModelIds contains empty or undefined entries.');
        }

        // ── Required Shot Set Comparison (Reject missing, extra, duplicate)
        const bundleShots = metadata.requiredShotIds || [];
        const seenShots = new Set<string>();
        for (const s of bundleShots) {
          if (!s || typeof s !== 'string' || s.trim() === '') {
            reasons.push(`Metadata consistency failure: requiredShotIds contains empty or invalid shot ID.`);
          } else if (seenShots.has(s)) {
            reasons.push(`Metadata consistency failure: requiredShotIds contains duplicate shot ID: "${s}".`);
          }
          seenShots.add(s);
        }

        let expectedShots = options?.expectedRequiredShotIds;
        if (!expectedShots) {
          const mediaPath = `${acceptanceDir}/media-evidence.json`;
          if (await storage.exists(mediaPath)) {
            try {
              const mediaEv = await storage.readJson<Record<string, any>>(mediaPath);
              expectedShots = Object.keys(mediaEv);
            } catch {
              // ignore
            }
          }
        }

        if (expectedShots && expectedShots.length > 0) {
          const expectedSet = new Set(expectedShots);
          const bundleSet = new Set(bundleShots);

          const missing = [...expectedSet].filter((s) => !bundleSet.has(s));
          if (missing.length > 0) {
            reasons.push(`Metadata consistency failure: requiredShotIds is missing expected shot(s): ${missing.join(', ')}.`);
          }

          const extra = [...bundleSet].filter((s) => !expectedSet.has(s));
          if (extra.length > 0) {
            reasons.push(`Metadata consistency failure: requiredShotIds contains unexpected extra shot(s): ${extra.join(', ')}.`);
          }
        }

        // ── Final physical master video on disk vs finalMasterChecksum
        const masterVideoPath = options?.finalMasterVideoPath || masterEv?.masterVideoPath;
        if (masterVideoPath && fs.existsSync(masterVideoPath)) {
          const diskVerif = ArtifactVerifier.verify(masterVideoPath, { requireVideoStream: true });
          if (diskVerif.checksumSha256 && diskVerif.checksumSha256 !== metadata.finalMasterChecksum) {
            reasons.push(
              `Acceptance metadata finalMasterChecksum (${metadata.finalMasterChecksum}) does not match physical master video SHA-256 (${diskVerif.checksumSha256}) on disk at "${masterVideoPath}".`
            );
          }
        }

        // ── Evidence Consistency across files in bundle
        const mediaPath = `${acceptanceDir}/media-evidence.json`;
        const qaPath = `${acceptanceDir}/qa-evidence.json`;
        const approvalPath = `${acceptanceDir}/approval-evidence.json`;
        if ((await storage.exists(mediaPath)) && (await storage.exists(qaPath))) {
          try {
            const mediaRecords = await storage.readJson<Record<string, any>>(mediaPath);
            const qaRecords = await storage.readJson<Record<string, any>>(qaPath);
            const approvalRecords = (await storage.exists(approvalPath))
              ? await storage.readJson<Record<string, any>>(approvalPath)
              : {};

            for (const shotId of bundleShots) {
              const m = mediaRecords[shotId];
              const q = qaRecords[shotId];
              const a = approvalRecords[shotId];

              if (m && q) {
                if (q.mediaSha256 && q.mediaSha256 !== m.sha256) {
                  reasons.push(
                    `Bundle evidence consistency failure: Shot "${shotId}" QA media SHA-256 (${q.mediaSha256}) does not match media evidence SHA-256 (${m.sha256}).`
                  );
                }
                if (q.candidateAssetId && m.assetId && q.candidateAssetId !== m.assetId) {
                  reasons.push(
                    `Bundle evidence consistency failure: Shot "${shotId}" QA candidateAssetId ("${q.candidateAssetId}") does not match media asset ID ("${m.assetId}").`
                  );
                }
              }
              if (a && m) {
                if (a.mediaSha256 && a.mediaSha256 !== m.sha256) {
                  reasons.push(
                    `Bundle evidence consistency failure: Shot "${shotId}" approval media SHA-256 (${a.mediaSha256}) does not match media evidence SHA-256 (${m.sha256}).`
                  );
                }
              }
            }
          } catch {
            // ignore
          }
        }
      } catch (err: any) {
        reasons.push(`Invalid production-acceptance.json metadata: ${err?.message}`);
      }
    } else {
      reasons.push('Missing production-acceptance.json in acceptance bundle.');
    }

    return {
      valid: reasons.length === 0,
      reasons,
      manifest,
      metadata,
    };
  }
}
