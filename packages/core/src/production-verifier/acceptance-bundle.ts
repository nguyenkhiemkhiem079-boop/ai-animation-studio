import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { IStorageProvider } from '../storage/index.js';
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

export interface AcceptanceBundleValidationResult {
  valid: boolean;
  reasons: string[];
  manifest?: AcceptanceManifest;
  metadata?: AcceptanceBundleMetadata;
}

export class ProductionAcceptanceBundle {
  public static readonly REQUIRED_FILES = [
    'production-acceptance.json',
    'provider-evidence.json',
    'media-evidence.json',
    'qa-evidence.json',
    'approval-evidence.json',
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

    // 1. Gather all evidence
    const providerEv = await evidenceStore.loadProviderEvidence(projectId, runId);
    const mediaEv = await evidenceStore.loadMediaEvidence(projectId, runId);
    const qaEv = await evidenceStore.loadQAEvidence(projectId, runId);
    const approvalEv = await evidenceStore.loadApprovalEvidence(projectId, runId);
    const masterEv = (await evidenceStore.loadMasterEvidence(projectId, runId)) ?? masterEvidence;

    // Continuity report
    const continuityPath = `.studio/production/${projectId}/${runId}/continuity_report.json`;
    let continuityEv: any = {};
    if (await storage.exists(continuityPath)) {
      continuityEv = await storage.readJson(continuityPath);
    }

    const metadata: AcceptanceBundleMetadata = {
      bundleVersion: '1.0.0',
      runId,
      projectId,
      seriesId: run.seriesId,
      createdAt: run.createdAt,
      completedAt: new Date().toISOString(),
      providerModelIds: providerModelIds.length > 0 ? providerModelIds : providerEv.map((p) => p.actualModel),
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
    storage: IStorageProvider
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

    // Check acceptance metadata
    let metadata: AcceptanceBundleMetadata | undefined;
    const metaPath = `${acceptanceDir}/production-acceptance.json`;
    if (await storage.exists(metaPath)) {
      try {
        const raw = await storage.readJson<AcceptanceBundleMetadata>(metaPath);
        metadata = AcceptanceBundleMetadataSchema.parse(raw);
      } catch (err: any) {
        reasons.push(`Invalid production-acceptance.json metadata: ${err?.message}`);
      }
    }

    return {
      valid: reasons.length === 0,
      reasons,
      manifest,
      metadata,
    };
  }
}
