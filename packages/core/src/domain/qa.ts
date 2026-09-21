import { z } from 'zod';

export const ContinuityIssueTypeSchema = z.enum([
  'screen_direction_180',
  'lighting_jump',
  'prop_persistence',
  'wardrobe_mismatch',
  'lip_sync_desync',
  'audio_clipping',
  'pacing_stalling',
  'character_identity_drift',
  'spatial_perspective_mismatch',
  'temporal_visual_flicker',
  'visual_artifact_defect',
  'color_palette_drift',
]);
export type ContinuityIssueType = z.infer<typeof ContinuityIssueTypeSchema>;

export const ContinuitySeveritySchema = z.enum(['critical', 'warning', 'info']);
export type ContinuitySeverity = z.infer<typeof ContinuitySeveritySchema>;

export const ContinuityCheckResultSchema = z.object({
  issueId: z.string(),
  shotId: z.string(),
  relatedShotId: z.string().optional(),
  type: ContinuityIssueTypeSchema,
  severity: ContinuitySeveritySchema,
  message: z.string(),
  suggestedFix: z.string(),
  autoRepairable: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});
export type ContinuityCheckResult = z.infer<typeof ContinuityCheckResultSchema>;

export const RepairStrategySchema = z.enum([
  'insert_buffer_shot',
  'insert_transition',
  'adjust_audio_duck',
  'match_lighting',
  'trigger_retake',
  'adjust_prompt',
  'color_grade_compensation',
]);
export type RepairStrategy = z.infer<typeof RepairStrategySchema>;

export const RepairActionSchema = z.object({
  actionId: z.string(),
  issueId: z.string(),
  strategy: RepairStrategySchema,
  description: z.string(),
  applied: z.boolean().default(false),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  details: z.record(z.unknown()).optional(),
});
export type RepairAction = z.infer<typeof RepairActionSchema>;

export const ContinuityQAReportSchema = z.object({
  reportId: z.string(),
  projectId: z.string(),
  sceneId: z.string().optional(),
  issues: z.array(ContinuityCheckResultSchema).default([]),
  repairActions: z.array(RepairActionSchema).default([]),
  overallPassed: z.boolean(),
  evaluatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ContinuityQAReport = z.infer<typeof ContinuityQAReportSchema>;
