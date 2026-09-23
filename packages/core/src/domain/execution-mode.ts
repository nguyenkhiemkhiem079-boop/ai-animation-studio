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

/**
 * Normalized Production Error Codes
 */
export const ProductionErrorCodeSchema = [
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_QUOTA_EXCEEDED',
  'PROVIDER_RATE_LIMITED',
  'EXTERNAL_MEDIA_REQUIRED',
  'MEDIA_INVALID',
  'MEDIA_CHECKSUM_MISMATCH',
  'QA_REQUIRED',
  'QA_FAILED',
  'APPROVAL_REQUIRED',
  'APPROVAL_CHALLENGE_EXPIRED',
  'APPROVAL_CHALLENGE_INVALID',
  'RETAKE_REQUIRED',
  'MASTER_VERIFICATION_FAILED',
  'ACCEPTANCE_BUNDLE_INVALID',
] as const;
export type ProductionErrorCode = (typeof ProductionErrorCodeSchema)[number];

/**
 * Actionable Production Error telling the operator:
 * - what happened
 * - whether work is preserved
 * - what to do next
 * Without leaking secrets or sensitive payloads.
 */
export class ProductionError extends Error {
  public readonly code: ProductionErrorCode;
  public readonly whatHappened: string;
  public readonly workPreserved: boolean;
  public readonly whatToDoNext: string;

  constructor(options: {
    code: ProductionErrorCode;
    whatHappened: string;
    workPreserved?: boolean;
    whatToDoNext: string;
  }) {
    // Secret sanitization
    const sanitizedHappened = options.whatHappened.replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_GEMINI_KEY]');
    super(`[${options.code}] ${sanitizedHappened} (Work Preserved: ${options.workPreserved ?? true}). Next Action: ${options.whatToDoNext}`);
    this.name = 'ProductionError';
    this.code = options.code;
    this.whatHappened = sanitizedHappened;
    this.workPreserved = options.workPreserved ?? true;
    this.whatToDoNext = options.whatToDoNext;
  }
}

