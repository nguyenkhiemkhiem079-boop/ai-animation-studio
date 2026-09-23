import { z } from 'zod';
import { ProductionSafetyError } from './execution-mode.js';

/**
 * 15 First-Class Production Run Lifecycle States
 */
export const ProductionRunStatusSchema = z.enum([
  'CREATED',
  'PREFLIGHT',
  'READY',
  'RUNNING',
  'WAITING_FOR_PROVIDER',
  'NEEDS_USER_ACTION',
  'WAITING_FOR_IMPORT',
  'VERIFYING_MEDIA',
  'VISUAL_QA',
  'APPROVAL_REQUIRED',
  'ASSEMBLING',
  'MASTER_QA',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type ProductionRunStatus = z.infer<typeof ProductionRunStatusSchema>;

/**
 * Allowed State Transition Matrix.
 * Illegal transitions fail closed.
 */
export const LEGAL_PRODUCTION_RUN_TRANSITIONS: Record<ProductionRunStatus, ProductionRunStatus[]> = {
  CREATED: ['PREFLIGHT', 'FAILED', 'CANCELLED'],
  PREFLIGHT: ['READY', 'FAILED', 'CANCELLED'],
  READY: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: [
    'WAITING_FOR_PROVIDER',
    'NEEDS_USER_ACTION',
    'WAITING_FOR_IMPORT',
    'VERIFYING_MEDIA',
    'VISUAL_QA',
    'APPROVAL_REQUIRED',
    'ASSEMBLING',
    'FAILED',
    'CANCELLED',
  ],
  WAITING_FOR_PROVIDER: ['RUNNING', 'FAILED', 'CANCELLED'],
  NEEDS_USER_ACTION: ['WAITING_FOR_IMPORT', 'VERIFYING_MEDIA', 'RUNNING', 'FAILED', 'CANCELLED'],
  WAITING_FOR_IMPORT: ['VERIFYING_MEDIA', 'NEEDS_USER_ACTION', 'FAILED', 'CANCELLED'],
  VERIFYING_MEDIA: ['VISUAL_QA', 'WAITING_FOR_IMPORT', 'FAILED', 'CANCELLED'],
  VISUAL_QA: ['APPROVAL_REQUIRED', 'WAITING_FOR_PROVIDER', 'NEEDS_USER_ACTION', 'FAILED', 'CANCELLED'],
  APPROVAL_REQUIRED: ['ASSEMBLING', 'RUNNING', 'NEEDS_USER_ACTION', 'VERIFYING_MEDIA', 'FAILED', 'CANCELLED'],
  ASSEMBLING: ['MASTER_QA', 'FAILED', 'CANCELLED'],
  MASTER_QA: ['COMPLETED', 'APPROVAL_REQUIRED', 'FAILED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  FAILED: ['READY', 'PREFLIGHT'], // May retry after failure reset
  CANCELLED: [], // Terminal
};

export function canTransitionProductionRun(
  from: ProductionRunStatus,
  to: ProductionRunStatus
): boolean {
  if (from === to) return true; // Idempotent self-transition allowed
  const allowed = LEGAL_PRODUCTION_RUN_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function assertLegalProductionRunTransition(
  from: ProductionRunStatus,
  to: ProductionRunStatus,
  contextMessage?: string
): void {
  if (!canTransitionProductionRun(from, to)) {
    const detail = contextMessage ? ` (${contextMessage})` : '';
    throw new ProductionSafetyError(
      `Illegal ProductionRun transition from "${from}" to "${to}"${detail}. State transitions must fail closed.`
    );
  }
}

/**
 * Categorization of provider execution errors
 */
export const ProviderErrorCategorySchema = z.enum([
  'AUTH_ERROR',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'NETWORK_ERROR',
  'TIMEOUT',
  'SERVER_ERROR',
  'INVALID_REQUEST',
  'SCHEMA_ERROR',
  'UNKNOWN_PROVIDER_ERROR',
]);
export type ProviderErrorCategory = z.infer<typeof ProviderErrorCategorySchema>;

/**
 * Trust Classification for Provider Provenance
 */
export const ProviderTrustLevelSchema = z.enum([
  'LIVE_EXTERNAL',
  'LOCAL_REAL',
  'OFFLINE_TEST_DOUBLE',
  'MOCK',
  'UNKNOWN',
]);
export type ProviderTrustLevel = z.infer<typeof ProviderTrustLevelSchema>;

/**
 * Approval Classification
 */
export const ApprovalTypeSchema = z.enum([
  'HUMAN',
  'AUTOMATED_TEST',
  'SYSTEM',
]);
export type ApprovalType = z.infer<typeof ApprovalTypeSchema>;

/**
 * Sanitized Provider Execution Evidence
 */
export const ProviderExecutionEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  runId: z.string().min(1),
  shotId: z.string().optional(),
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  providerRole: z.string().min(1),
  actualModel: z.string().min(1),
  providerTrust: ProviderTrustLevelSchema.default('UNKNOWN'),
  requestStartedAt: z.string().datetime(),
  requestCompletedAt: z.string().datetime(),
  latencyMs: z.number().nonnegative(),
  retryCount: z.number().int().nonnegative().default(0),
  status: z.enum(['SUCCESS', 'FAILED', 'BLOCKED']),
  errorCategory: ProviderErrorCategorySchema.nullable().default(null),
  errorMessage: z.string().optional(),
  inputHash: z.string().min(1), // SHA-256 of sanitized input prompt/request
  outputHash: z.string().nullable().default(null), // SHA-256 of response
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional(),
    })
    .nullable()
    .default(null),
  actualCostUsd: z.number().nonnegative().nullable().default(null),
  recordedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ProviderExecutionEvidence = z.infer<typeof ProviderExecutionEvidenceSchema>;

/**
 * Authoritative Media Evidence
 */
export const ProductionMediaEvidenceSchema = z.object({
  shotId: z.string().min(1),
  assetId: z.string().min(1),
  physicalPath: z.string().min(1),
  sha256: z.string().min(64).max(64),
  sizeBytes: z.number().int().positive(),
  container: z.string().min(1),
  videoCodec: z.string().min(1),
  audioCodec: z.string().nullable().default(null),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  fps: z.number().positive().nullable().default(null),
  verificationTimestamp: z.string().datetime(),
  provenance: z.string().min(1),
  generationSource: z.enum(['HYPERFRAMES', 'FLOW_ASSISTED', 'LIVE_PROVIDER', 'IMPORTED', 'SIMULATED_FLOW', 'GOOGLE_FLOW_REAL']),
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  rejectionReason: z.string().optional(),
});
export type ProductionMediaEvidence = z.infer<typeof ProductionMediaEvidenceSchema>;

/**
 * QA Evaluation Evidence
 */
export const ProductionQAEvidenceSchema = z.object({
  shotId: z.string().min(1),
  reportId: z.string().min(1),
  mediaSha256: z.string().min(64).max(64).optional(),
  candidateAssetId: z.string().optional(),
  overallStatus: z.enum(['PASS', 'WARN', 'FAIL', 'NOT_EVALUATED', 'MISSING_ARTIFACT']),
  passed: z.boolean(),
  mechanism: z.string(),
  providerTrust: ProviderTrustLevelSchema.optional(),
  isSynthetic: z.boolean().default(false),
  scores: z.object({
    identity: z.number().min(0).max(1).nullable(),
    spatial: z.number().min(0).max(1).nullable(),
    defects: z.number().min(0).max(1).nullable(),
    overall: z.number().min(0).max(1).nullable(),
  }),
  coverage: z.record(z.string()).optional(),
  totalDefects: z.number().int().nonnegative().default(0),
  criticalDefects: z.number().int().nonnegative().default(0),
  retakesRecommended: z.number().int().nonnegative().default(0),
  evaluatedAt: z.string().datetime(),
});
export type ProductionQAEvidence = z.infer<typeof ProductionQAEvidenceSchema>;

/**
 * Human / Automated Approval Evidence
 */
export const ProductionApprovalEvidenceSchema = z.object({
  shotId: z.string().min(1),
  candidateAssetId: z.string().min(1),
  canonicalAssetId: z.string().optional(),
  mediaSha256: z.string().min(64).max(64).optional(),
  qaReportId: z.string().optional(),
  status: z.enum(['APPROVED', 'REJECTED']),
  approvalType: ApprovalTypeSchema.default('HUMAN'),
  actorId: z.string().optional(),
  actorDisplayName: z.string().optional(),
  approvalSource: z.string().optional(),
  interactive: z.boolean().default(false),
  decidedBy: z.string().min(1),
  decidedAt: z.string().datetime(),
  notes: z.string().optional(),
});
export type ProductionApprovalEvidence = z.infer<typeof ProductionApprovalEvidenceSchema>;

/**
 * Acceptance Manifest & Bundle Metadata Schemas
 */
export const AcceptanceManifestFileRecordSchema = z.object({
  path: z.string(),
  sha256: z.string().min(64).max(64),
  sizeBytes: z.number().int().nonnegative(),
});
export type AcceptanceManifestFileRecord = z.infer<typeof AcceptanceManifestFileRecordSchema>;

export const AcceptanceManifestSchema = z.object({
  manifestVersion: z.string().default('1.0.0'),
  runId: z.string().min(1),
  projectId: z.string().min(1),
  seriesId: z.string().min(1),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  files: z.record(AcceptanceManifestFileRecordSchema),
  manifestSha256: z.string().min(64).max(64).optional(),
});
export type AcceptanceManifest = z.infer<typeof AcceptanceManifestSchema>;

export const AcceptanceBundleMetadataSchema = z.object({
  bundleVersion: z.string().default('1.0.0'),
  runId: z.string().min(1),
  projectId: z.string().min(1),
  seriesId: z.string().min(1),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  providerModelIds: z.array(z.string()).default([]),
  requiredShotIds: z.array(z.string()).default([]),
  finalMasterChecksum: z.string().min(64).max(64),
  verificationStatus: z.enum([
    'MASTER_PRODUCTION_VERIFIED',
    'OFFLINE_REHEARSAL_VERIFIED',
    'LOCAL_PRODUCTION_PIPELINE_VERIFIED',
    'FAILED_VERIFICATION',
  ]),
  allChecksPassed: z.boolean(),
  checksSummary: z.record(z.boolean()).default({}),
});
export type AcceptanceBundleMetadata = z.infer<typeof AcceptanceBundleMetadataSchema>;

/**
 * Final Master Production Evidence
 */
export const MasterProductionEvidenceSchema = z.object({
  manifestId: z.string().min(1),
  sequenceId: z.string().min(1),
  masterVideoPath: z.string().min(1),
  masterSha256: z.string().min(64).max(64),
  sizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  videoCodec: z.string().min(1),
  audioCodec: z.string().nullable().default(null),
  fps: z.number().positive().nullable().default(null),
  verifiedAt: z.string().datetime(),
  verificationStatus: z.enum([
    'MASTER_PRODUCTION_VERIFIED',
    'OFFLINE_REHEARSAL_VERIFIED',
    'LOCAL_PRODUCTION_PIPELINE_VERIFIED',
    'FAILED_VERIFICATION',
  ]),
  failureReason: z.string().optional(),
  checksSummary: z.record(z.boolean()).default({}),
});
export type MasterProductionEvidence = z.infer<typeof MasterProductionEvidenceSchema>;

/**
 * Production Run Resume Instructions
 */
export const ResumeMetadataSchema = z.object({
  canResume: z.boolean().default(true),
  resumeStage: z.string().optional(),
  nextAction: z.string().optional(),
  recommendedCommand: z.string().optional(),
  blockedReason: z.string().optional(),
  targetShotId: z.string().optional(),
});
export type ResumeMetadata = z.infer<typeof ResumeMetadataSchema>;

/**
 * Full First-Class Production Run Entity
 */
export const ProductionRunSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  seriesId: z.string().min(1),
  status: ProductionRunStatusSchema.default('CREATED'),
  mode: z.enum(['MOCK', 'LOCAL', 'PRODUCTION']).default('PRODUCTION'),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  currentStage: z.string().default('init'),
  currentShotId: z.string().optional(),
  completedShotIds: z.array(z.string()).default([]),
  pendingShotIds: z.array(z.string()).default([]),
  blockedShotIds: z.array(z.string()).default([]),
  providerJobs: z.record(z.any()).default({}),
  mediaEvidence: z.record(ProductionMediaEvidenceSchema).default({}),
  qaEvidence: z.record(ProductionQAEvidenceSchema).default({}),
  approvalEvidence: z.record(ProductionApprovalEvidenceSchema).default({}),
  masterEvidence: MasterProductionEvidenceSchema.optional(),
  checkpointId: z.string().optional(),
  failure: z
    .object({
      stage: z.string(),
      errorCategory: z.string().optional(),
      message: z.string(),
      timestamp: z.string().datetime(),
    })
    .optional(),
  resumeMetadata: ResumeMetadataSchema.default({ canResume: true }),
});
export type ProductionRun = z.infer<typeof ProductionRunSchema>;
