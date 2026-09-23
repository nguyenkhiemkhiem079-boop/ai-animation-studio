import { z } from 'zod';

export const VisualContinuityIssueTypeSchema = z.enum([
  'character_identity_drift',
  'spatial_perspective_mismatch',
  'temporal_visual_flicker',
  'visual_artifact_defect',
  'color_palette_drift',
]);
export type VisualContinuityIssueType = z.infer<typeof VisualContinuityIssueTypeSchema>;

export const VisualDefectRegionSchema = z.enum([
  'face',
  'body',
  'hands',
  'background',
  'lighting',
  'global',
]);
export type VisualDefectRegion = z.infer<typeof VisualDefectRegionSchema>;

export const VisualDefectSeveritySchema = z.enum(['critical', 'warning', 'info']);
export type VisualDefectSeverity = z.infer<typeof VisualDefectSeveritySchema>;

export const VisualDefectItemSchema = z.object({
  defectId: z.string(),
  frameIndex: z.number().int().nonnegative(),
  timestampSeconds: z.number().nonnegative(),
  region: VisualDefectRegionSchema,
  issueType: VisualContinuityIssueTypeSchema,
  severity: VisualDefectSeveritySchema,
  confidence: z.number().min(0).max(1),
  description: z.string(),
  suggestedFix: z.string(),
  frameUri: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type VisualDefectItem = z.infer<typeof VisualDefectItemSchema>;

export const RetakeRecommendationSchema = z.object({
  recommendationId: z.string(),
  shotId: z.string(),
  strategy: z.enum([
    'surgical_retake',
    'prompt_refinement',
    'transition_insert',
    'reference_reanchor',
    'buffer_cutaway',
  ]),
  priority: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
  suggestedPromptModifications: z.array(z.string()).optional(),
  suggestedTransition: z
    .object({
      type: z.string(),
      durationSeconds: z.number(),
    })
    .optional(),
});
export type RetakeRecommendation = z.infer<typeof RetakeRecommendationSchema>;

export const VisualQAStatusSchema = z.enum([
  'PASS',
  'WARN',
  'FAIL',
  'NOT_EVALUATED',
  'MISSING_ARTIFACT',
]);
export type VisualQAStatus = z.infer<typeof VisualQAStatusSchema>;

export const VisualEvaluationCoverageSchema = z.object({
  artifactIntegrity: z.enum(['VERIFIED', 'FAILED', 'NOT_EVALUATED']),
  spatialFormat: z.enum(['VERIFIED', 'FAILED', 'NOT_EVALUATED']),
  identityVisual: z.enum(['VERIFIED', 'FAILED', 'NOT_EVALUATED']),
  temporalArtifactVisual: z.enum(['VERIFIED', 'FAILED', 'NOT_EVALUATED']),
  semanticAction: z.enum(['VERIFIED', 'FAILED', 'NOT_EVALUATED']),
});
export type VisualEvaluationCoverage = z.infer<typeof VisualEvaluationCoverageSchema>;

export const VisualSemanticQAReportSchema = z.object({
  reportId: z.string(),
  projectId: z.string(),
  sceneId: z.string().optional(),
  shotId: z.string(),
  assetId: z.string().optional(),
  videoUri: z.string(),
  identityConsistencyScore: z.number().min(0).max(1).nullable(),
  spatialPerspectiveScore: z.number().min(0).max(1).nullable(),
  visualDefectScore: z.number().min(0).max(1).nullable(),
  overallVisualContinuityScore: z.number().min(0).max(1).nullable(),
  passed: z.boolean(),
  status: VisualQAStatusSchema.default('PASS'),
  coverage: VisualEvaluationCoverageSchema.optional(),
  missingIdentityAnchors: z.array(z.string()).optional(),
  defects: z.array(VisualDefectItemSchema).default([]),
  retakeRecommendations: z.array(RetakeRecommendationSchema).default([]),
  evaluatedFramesCount: z.number().int().nonnegative(),
  evaluatedAt: z.string().datetime().default(() => new Date().toISOString()),
  evaluationMechanism: z.enum([
    'MULTIMODAL_PROVIDER',
    'MULTIMODAL_GEMINI',
    'LOCAL_MEDIA_METADATA',
    'DETERMINISTIC_LOCAL',
    'OFFLINE_TEST_DOUBLE',
    'MOCK',
    'NOT_EVALUATED',
  ]),
  metadata: z.record(z.unknown()).optional(),
});
export type VisualSemanticQAReport = z.infer<typeof VisualSemanticQAReportSchema>;
