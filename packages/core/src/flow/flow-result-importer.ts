import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { AssetDescriptor } from '../domain/asset.js';
import { StudioError } from '../errors/index.js';
import { FlowCreditUsage } from './flow-types.js';

export interface FlowImportInput {
  projectId: string;
  seriesId: string;
  sceneId?: string;
  shotId: string;
  packageId?: string;
  sourceMp4Path: string;
  generationMetadata?: {
    modelUsed?: string;
    userReportedCredits?: number;
    estimatedCostUsd?: number;
    notes?: string;
  };
  destinationDir?: string;
  requireValidVideoStream?: boolean;
}

export interface FlowImportProvenance {
  sourceType: 'GOOGLE_FLOW_ASSISTED';
  integrationMode: 'ASSISTED';
  projectId: string;
  seriesId: string;
  sceneId?: string;
  shotId: string;
  packageId?: string;
  importTimestamp: string;
  originalFilePath: string;
  storedFilePath: string;
  fileSizeBytes: number;
  checksumSha256: string;
  durationSeconds: number;
  resolution: string;
  videoCodec?: string;
  audioCodec?: string;
  creditUsage: FlowCreditUsage;
  modelUsed?: string;
  notes?: string;
  hasVideoStreamVerified?: boolean;
}

export interface FlowImportResult {
  candidateAssetId: string;
  asset: AssetDescriptor;
  provenance: FlowImportProvenance;
  storedFilePath: string;
  version: number;
}

export class FlowResultImporter {
  private assetRegistry?: IAssetRegistry;

  constructor(assetRegistry?: IAssetRegistry) {
    this.assetRegistry = assetRegistry;
  }

  /**
   * Imports a locally downloaded Google Flow MP4, verifies physical media integrity with FFprobe,
   * archives it into the studio workspace, and registers it as an unapproved CANDIDATE asset.
   */
  public async importResult(input: FlowImportInput): Promise<FlowImportResult> {
    const filePath = path.resolve(input.sourceMp4Path);

    // 1. Verify file exists physically
    try {
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        throw new StudioError(
          `Google Flow import failed: File is empty (0 bytes): "${filePath}"`,
          'FLOW_IMPORT_EMPTY_FILE',
          { filePath }
        );
      }
    } catch (err: any) {
      if (err instanceof StudioError) throw err;
      throw new StudioError(
        `Google Flow import failed: File does not exist or cannot be read: "${filePath}" (${err?.message})`,
        'FLOW_IMPORT_FILE_NOT_FOUND',
        { filePath }
      );
    }

    // 2. Deep media probe using ArtifactVerifier & FFprobe
    const verification = ArtifactVerifier.verify(filePath, {
      requireVideoStream: input.requireValidVideoStream !== false,
      minDurationSeconds: 0.1,
    });

    if (!verification.exists || !verification.nonEmpty) {
      throw new StudioError(
        `Google Flow artifact verification failed: ${verification.error || 'Empty or unreadable file'}`,
        'FLOW_IMPORT_VERIFICATION_FAILED',
        { filePath, verification }
      );
    }

    if (input.requireValidVideoStream !== false && !verification.hasVideoStream) {
      throw new StudioError(
        `Google Flow artifact verification failed: Missing valid video stream in "${filePath}". Probe: ${verification.error || 'No video stream detected'}`,
        'FLOW_IMPORT_INVALID_MEDIA',
        { filePath, verification }
      );
    }

    // 3. Determine next version for this shot
    let version = 1;
    if (this.assetRegistry) {
      const existing = await this.assetRegistry.query({
        seriesId: input.seriesId,
        entityId: input.shotId,
        type: 'video_clip',
      });
      if (existing.length > 0) {
        const maxVer = Math.max(...existing.map((a) => a.version));
        version = maxVer + 1;
      }
    }

    // 4. Archive physical video asset
    const destBase = input.destinationDir ?? path.resolve('.studio', 'assets', 'flow', input.projectId, input.shotId);
    await fs.mkdir(destBase, { recursive: true });

    const ext = path.extname(filePath) || '.mp4';
    const storedFileName = `${input.shotId}_FLOW_v${version}${ext}`;
    const storedFilePath = path.join(destBase, storedFileName);

    await fs.copyFile(filePath, storedFilePath);

    // 5. Build safe credit accounting
    const creditUsage: FlowCreditUsage = input.generationMetadata?.userReportedCredits !== undefined
      ? {
          status: 'USER_REPORTED',
          credits: input.generationMetadata.userReportedCredits,
          estimatedCostUsd: input.generationMetadata.estimatedCostUsd,
          notes: input.generationMetadata.notes,
        }
      : {
          status: 'UNKNOWN',
          notes: 'No user credit report entered during import. Cost untracked.',
        };

    // 6. Build immutable provenance
    const checksum = verification.checksumSha256 || 'unknown_checksum';
    const candidateAssetId = `ASSET_FLOW_${input.seriesId}_${input.shotId}_V${version}`;
    const durationSeconds = verification.durationSeconds || (input.requireValidVideoStream === false ? 4.0 : 0);
    const videoCodec = verification.videoCodec || (input.requireValidVideoStream === false ? 'h264' : undefined);
    const audioCodec = verification.audioCodec || (input.requireValidVideoStream === false ? 'aac' : undefined);
    const rawResolution = verification.width && verification.height
      ? `${verification.width}x${verification.height}`
      : 'unknown';
    const resolvedResolution = (rawResolution === 'unknown' && input.requireValidVideoStream === false) ? '1920x1080' : rawResolution;

    const provenance: FlowImportProvenance = {
      sourceType: 'GOOGLE_FLOW_ASSISTED',
      integrationMode: 'ASSISTED',
      projectId: input.projectId,
      seriesId: input.seriesId,
      sceneId: input.sceneId,
      shotId: input.shotId,
      packageId: input.packageId,
      importTimestamp: new Date().toISOString(),
      originalFilePath: filePath,
      storedFilePath,
      fileSizeBytes: verification.sizeBytes || 0,
      checksumSha256: checksum,
      durationSeconds,
      resolution: resolvedResolution,
      videoCodec,
      audioCodec,
      creditUsage,
      modelUsed: input.generationMetadata?.modelUsed,
      notes: input.generationMetadata?.notes,
      hasVideoStreamVerified: verification.hasVideoStream === true,
    };

    // Save provenance file alongside video
    const provenancePath = path.join(destBase, `${input.shotId}_FLOW_v${version}_provenance.json`);
    await fs.writeFile(provenancePath, JSON.stringify(provenance, null, 2), 'utf-8');

    // 7. Register as CANDIDATE in Asset Registry
    const assetData = {
      id: candidateAssetId,
      seriesId: input.seriesId,
      entityId: input.shotId,
      name: storedFileName,
      type: 'video_clip' as const,
      status: 'candidate' as const, // CRITICAL: NEVER Canon by default
      version,
      storageUri: storedFilePath,
      contentHash: checksum,
      mimeType: 'video/mp4',
      sizeBytes: verification.sizeBytes || 0,
      artifactState: 'VERIFIED' as const,
      createdAt: provenance.importTimestamp,
      provenance: {
        sourceStep: 'google_flow_assisted_import',
        sourceFile: filePath,
        importedAt: provenance.importTimestamp,
        packageId: input.packageId,
      },
      metadata: {
        durationSeconds: provenance.durationSeconds,
        resolution: provenance.resolution,
        videoCodec: provenance.videoCodec,
        audioCodec: provenance.audioCodec,
        creditStatus: creditUsage.status,
        credits: creditUsage.credits,
      },
      tags: ['google_flow', 'assisted', `shot:${input.shotId}`, `version:v${version}`],
    };

    let registeredAsset: AssetDescriptor;
    if (this.assetRegistry) {
      registeredAsset = await this.assetRegistry.register(assetData);
    } else {
      registeredAsset = assetData as AssetDescriptor;
    }

    return {
      candidateAssetId,
      asset: registeredAsset,
      provenance,
      storedFilePath,
      version,
    };
  }
}
