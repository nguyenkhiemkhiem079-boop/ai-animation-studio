/**
 * Explicit Studio Execution Modes & Artifact Verification Contracts
 */

export type StudioExecutionMode = 'MOCK' | 'LOCAL' | 'PRODUCTION';

export type ArtifactState =
  | 'DECLARED'
  | 'GENERATING'
  | 'GENERATED'
  | 'VERIFIED'
  | 'MISSING'
  | 'CORRUPT';

export interface ArtifactVerificationResult {
  exists: boolean;
  readable: boolean;
  nonEmpty: boolean;
  filePath: string;
  sizeBytes?: number;
  mimeType?: string;
  checksumSha256?: string;
  checksum?: string;
  durationSeconds?: number;
  hasVideoStream?: boolean;
  hasAudioStream?: boolean;
  streams?: { videoCount: number; audioCount: number };
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  error?: string;
}

export interface ArtifactProvenance {
  artifactId: string;
  executionMode: StudioExecutionMode;
  sourceType: string;
  providerId: string;
  isMock: boolean;
  isSyntheticTestArtifact: boolean;
  createdAt: string;
  checksum: string;
  parentArtifactIds: string[];
}

export class ProductionSafetyError extends Error {
  constructor(message: string) {
    super(`[PRODUCTION_SAFETY_VIOLATION] ${message}`);
    this.name = 'ProductionSafetyError';
  }
}
