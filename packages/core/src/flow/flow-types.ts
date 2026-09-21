import { z } from 'zod';
import { ShotContract, ShotContractSchema } from '../domain/director.js';
import { SourceTraceability, SourceTraceabilitySchema } from '../domain/story.js';
import { StudioError } from '../errors/index.js';

/**
 * Supported Google Flow integration modes.
 * Phase 16.6 defaults strictly to ASSISTED mode.
 */
export type FlowIntegrationMode = 'ASSISTED' | 'API_AUTOMATED';

/**
 * Recognized Google Flow capabilities.
 * Capabilities vary by model and tool release.
 */
export const FlowCapabilitySchema = z.enum([
  'TEXT_TO_VIDEO',
  'FIRST_FRAME_TO_VIDEO',
  'FIRST_LAST_FRAME_TO_VIDEO',
  'INGREDIENTS_TO_VIDEO',
  'VIDEO_EDITING',
  'VIDEO_EXTENSION',
  'IMAGE_GENERATION',
  'IMAGE_EDITING',
]);
export type FlowCapability = z.infer<typeof FlowCapabilitySchema>;

/**
 * Strict Flow production job lifecycle states.
 */
export const FlowJobStatusSchema = z.enum([
  'DRAFT',
  'PACKAGE_READY',
  'NEEDS_USER_ACTION',
  'WAITING_FOR_IMPORT',
  'IMPORTED',
  'VERIFYING',
  'VERIFIED',
  'QA_PENDING',
  'QA_FAILED',
  'CANDIDATE',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
]);
export type FlowJobStatus = z.infer<typeof FlowJobStatusSchema>;

/**
 * Explicit semantic reference roles.
 * Prevents blindly dumping all images into Flow without semantic purpose.
 */
export const FlowReferenceRoleSchema = z.enum([
  'CHARACTER_IDENTITY',
  'CHARACTER_OUTFIT',
  'CHARACTER_POSE',
  'LOCATION',
  'PROP',
  'STYLE',
  'FIRST_FRAME',
  'LAST_FRAME',
  'COMPOSITION',
  'LIGHTING',
]);
export type FlowReferenceRole = z.infer<typeof FlowReferenceRoleSchema>;

/**
 * Semantic reference asset descriptor.
 */
export const FlowReferenceAssetSchema = z.object({
  role: FlowReferenceRoleSchema,
  assetId: z.string(),
  label: z.string(),
  uri: z.string(),
  localPath: z.string().optional(),
  characterId: z.string().optional(),
  characterVersion: z.string().optional(),
  locationId: z.string().optional(),
  locationVersion: z.string().optional(),
  instructions: z.string().optional(),
});
export type FlowReferenceAsset = z.infer<typeof FlowReferenceAssetSchema>;

/**
 * Frame continuity descriptor.
 */
export const FlowFrameDescriptorSchema = z.object({
  path: z.string().optional(),
  uri: z.string().optional(),
  assetId: z.string().optional(),
  isCandidate: z.boolean().optional(),
  candidateId: z.string().optional(),
  description: z.string().optional(),
  sourceShotId: z.string().optional(),
});
export type FlowFrameDescriptor = z.infer<typeof FlowFrameDescriptorSchema>;

/**
 * Versioned Google Flow Production Package Schema (V1).
 */
export const FlowProductionPackageV1Schema = z.object({
  packageVersion: z.literal('1.0.0'),
  packageId: z.string(),
  createdAt: z.string(),
  projectId: z.string(),
  seriesId: z.string(),
  episodeId: z.string().optional(),
  sceneId: z.string(),
  shotId: z.string(),
  shotContractVersion: z.string().default('1.0.0'),
  shotContractSnapshot: ShotContractSchema,
  sourceReferences: z.array(SourceTraceabilitySchema).default([]),
  narrativeIntent: z.string(),
  durationTargetSeconds: z.number().positive(),
  aspectRatio: z.string().default('16:9'),
  recommendedWorkflow: FlowCapabilitySchema,
  workflowReason: z.string(),
  modelRecommendation: z.string().optional(),
  references: z.array(FlowReferenceAssetSchema).default([]),
  firstFrame: FlowFrameDescriptorSchema.optional(),
  lastFrame: FlowFrameDescriptorSchema.optional(),
  continuityConstraints: z.array(z.string()).default([]),
  flowPrompt: z.string(),
  userInstructions: z.array(z.string()),
  provenance: z.object({
    compilerVersion: z.string(),
    packageBuilderVersion: z.string(),
    timestamp: z.string(),
    semanticHash: z.string().optional(),
  }),
});
export const FlowProductionPackageSchema = FlowProductionPackageV1Schema;

export interface FlowProductionPackageV1 {
  packageVersion: '1.0.0';
  packageId: string;
  createdAt: string;
  projectId: string;
  seriesId: string;
  episodeId?: string;
  sceneId: string;
  shotId: string;
  shotContractVersion: string;
  shotContractSnapshot: ShotContract;
  sourceReferences: SourceTraceability[];
  narrativeIntent: string;
  durationTargetSeconds: number;
  aspectRatio: string;
  recommendedWorkflow: FlowCapability;
  workflowReason: string;
  modelRecommendation?: string;
  references: FlowReferenceAsset[];
  firstFrame?: FlowFrameDescriptor;
  lastFrame?: FlowFrameDescriptor;
  continuityConstraints: string[];
  flowPrompt: string;
  userInstructions: string[];
  provenance: {
    compilerVersion: string;
    packageBuilderVersion: string;
    timestamp: string;
    semanticHash?: string;
  };
}

/**
 * Credit Accounting Types.
 */
export type FlowCreditStatus = 'UNKNOWN' | 'USER_REPORTED' | 'ESTIMATED' | 'VERIFIED';

export interface FlowCreditUsage {
  status: FlowCreditStatus;
  credits?: number;
  estimatedCostUsd?: number;
  notes?: string;
}

/**
 * Valid Flow Job State Transitions.
 */
const LEGAL_TRANSITIONS: Record<FlowJobStatus, FlowJobStatus[]> = {
  DRAFT: ['PACKAGE_READY', 'ARCHIVED'],
  PACKAGE_READY: ['NEEDS_USER_ACTION', 'DRAFT', 'ARCHIVED'],
  NEEDS_USER_ACTION: ['WAITING_FOR_IMPORT', 'PACKAGE_READY', 'ARCHIVED'],
  WAITING_FOR_IMPORT: ['IMPORTED', 'NEEDS_USER_ACTION', 'ARCHIVED'],
  IMPORTED: ['VERIFYING', 'WAITING_FOR_IMPORT', 'ARCHIVED'],
  VERIFYING: ['VERIFIED', 'QA_FAILED', 'IMPORTED', 'ARCHIVED'],
  VERIFIED: ['QA_PENDING', 'ARCHIVED'],
  QA_PENDING: ['CANDIDATE', 'QA_FAILED', 'ARCHIVED'],
  QA_FAILED: ['NEEDS_USER_ACTION', 'REJECTED', 'ARCHIVED'],
  CANDIDATE: ['APPROVED', 'REJECTED', 'NEEDS_USER_ACTION', 'ARCHIVED'],
  APPROVED: ['REJECTED', 'ARCHIVED'],
  REJECTED: ['NEEDS_USER_ACTION', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

/**
 * Validates legal job state machine transitions.
 * Throws StudioError if illegal.
 */
export function validateFlowJobTransition(from: FlowJobStatus, to: FlowJobStatus): void {
  const allowed = LEGAL_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new StudioError(
      `Illegal Flow job state transition from "${from}" to "${to}". Allowed: [${(allowed || []).join(', ')}]`,
      'FLOW_ILLEGAL_STATE_TRANSITION',
      { from, to, allowed }
    );
  }
}
