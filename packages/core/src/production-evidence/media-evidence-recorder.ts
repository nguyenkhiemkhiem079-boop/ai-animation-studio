import * as path from 'node:path';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import {
  ProductionMediaEvidence,
  ProductionMediaEvidenceSchema,
} from '../domain/production-run.js';
import { ProductionSafetyError } from '../domain/execution-mode.js';
import { ProductionLeakDetector } from '../production-verifier/production-leak-detector.js';

export interface RecordMediaOptions {
  shotId: string;
  assetId: string;
  filePath: string;
  provenance: string;
  generationSource: 'HYPERFRAMES' | 'FLOW_ASSISTED' | 'LIVE_PROVIDER' | 'IMPORTED' | 'SIMULATED_FLOW' | 'GOOGLE_FLOW_REAL';
  executionMode?: 'MOCK' | 'LOCAL' | 'PRODUCTION';
  requireVideo?: boolean;
}

export class MediaEvidenceRecorder {
  /**
   * Verifies physical file with ArtifactVerifier, calculates SHA-256, checks FFprobe,
   * asserts production leakage rules, and returns validated ProductionMediaEvidence.
   */
  public static verifyAndRecord(options: RecordMediaOptions): ProductionMediaEvidence {
    const {
      shotId,
      assetId,
      filePath,
      provenance,
      generationSource,
      executionMode = 'PRODUCTION',
      requireVideo = true,
    } = options;

    // In PRODUCTION mode, block any paths from smoke or test directories
    if (executionMode === 'PRODUCTION') {
      ProductionLeakDetector.assertProductionMediaSafety(filePath, `Shot "${shotId}" authoritative media`);
    }

    // Deep Artifact Verification
    const verification = ArtifactVerifier.verify(filePath, {
      requireVideoStream: requireVideo,
      requireValidMedia: true,
    });

    if (!verification.exists) {
      throw new ProductionSafetyError(
        `Real media verification failed for shot "${shotId}": File does not exist at "${filePath}".`
      );
    }

    if (!verification.nonEmpty || (verification.sizeBytes ?? 0) === 0) {
      throw new ProductionSafetyError(
        `Real media verification failed for shot "${shotId}": File is empty (0 bytes) at "${filePath}".`
      );
    }

    if (requireVideo && !verification.hasVideoStream) {
      throw new ProductionSafetyError(
        `Real media verification failed for shot "${shotId}": File at "${filePath}" is missing a valid video stream or is corrupt.`
      );
    }

    if (!verification.checksumSha256) {
      throw new ProductionSafetyError(
        `Real media verification failed for shot "${shotId}": SHA-256 checksum could not be computed for "${filePath}".`
      );
    }

    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase() || 'mp4';

    const evidence: ProductionMediaEvidence = {
      shotId,
      assetId,
      physicalPath: path.resolve(filePath),
      sha256: verification.checksumSha256,
      sizeBytes: verification.sizeBytes ?? 0,
      container: ext,
      videoCodec: verification.videoCodec || 'h264',
      audioCodec: verification.audioCodec ?? null,
      width: verification.width || 1920,
      height: verification.height || 1080,
      durationSeconds: verification.durationSeconds && verification.durationSeconds > 0
        ? verification.durationSeconds
        : 1.0,
      fps: verification.fps ?? null,
      verificationTimestamp: new Date().toISOString(),
      provenance,
      generationSource,
      approvalStatus: 'PENDING',
    };

    return ProductionMediaEvidenceSchema.parse(evidence);
  }
}
