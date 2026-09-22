import { z } from 'zod';
import {
  VisualContinuityIssueTypeSchema,
  VisualDefectRegionSchema,
  VisualDefectSeveritySchema,
} from '../../domain/visual-qa.js';

export const VISUAL_QA_PROMPT_VERSION = 'v1.0.0';

export const VisualQAOutputSchema = z.object({
  identityConsistencyScore: z.number().min(0).max(1).nullable(),
  spatialPerspectiveScore: z.number().min(0).max(1),
  visualDefectScore: z.number().min(0).max(1),
  overallVisualContinuityScore: z.number().min(0).max(1),
  passed: z.boolean(),
  defects: z
    .array(
      z.object({
        defectId: z.string(),
        frameIndex: z.number().int().nonnegative(),
        timestampSeconds: z.number().nonnegative(),
        region: VisualDefectRegionSchema,
        issueType: VisualContinuityIssueTypeSchema,
        severity: VisualDefectSeveritySchema,
        confidence: z.number().min(0).max(1),
        description: z.string(),
        suggestedFix: z.string(),
      })
    )
    .default([]),
  retakeRecommendations: z
    .array(
      z.object({
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
      })
    )
    .default([]),
});
export type VisualQAOutput = z.infer<typeof VisualQAOutputSchema>;

export function buildVisualQASystemInstruction(): string {
  return `You are the AI Animation Studio Multimodal Visual Semantic QA Auditor.
Your responsibility is to audit rendered video keyframes against canonical Character DNA, World Environment specifications, and ShotContracts.

AUDIT CRITERIA:
1. Character Identity Consistency: Compare character faces, hair, eyes, and key traits against canonical turnaround sheets. Detect identity drift, facial warping, or costume mismatches.
2. Spatial Perspective & Camera: Verify that the background perspective, horizon line, and camera angle match the ShotContract (e.g. eye-level vs low-angle, 35mm wide vs 85mm close-up).
3. Temporal Visual Stability: Detect severe visual flicker, geometry popping, extra/missing limbs, or visual artifacts.
4. Color & Lighting Coherence: Verify that lighting temperature and color mood align with the scene contract.
5. Actionable Retake Strategies: If defects exceed acceptable thresholds, provide surgical retake recommendations, prompt modifications, or transition insertions.

Return strictly structured JSON adhering to the schema.`;
}

export const VISUAL_QA_PROMPT_V1 = {
  promptId: 'visual_semantic_qa_audit',
  version: '1.0.0',
  purpose: 'Multimodal evaluation of rendered video frames against Character DNA and ShotContract',
  systemInstruction: buildVisualQASystemInstruction(),
  buildPrompt: (opts: {
    shotId: string;
    shotContract: Record<string, unknown>;
    characterProfiles?: Record<string, unknown>[];
    locationProfiles?: Record<string, unknown>[];
    frameMetadata: { frameIndex: number; timestampSeconds: number }[];
  }) => {
    return `Shot Contract [${opts.shotId}]:
${JSON.stringify(opts.shotContract, null, 2)}

Canonical Character Profiles:
${JSON.stringify(opts.characterProfiles ?? [], null, 2)}

Canonical Location Profiles:
${JSON.stringify(opts.locationProfiles ?? [], null, 2)}

Extracted Frame Timeline:
${JSON.stringify(opts.frameMetadata, null, 2)}

Analyze the visual frames against the canonical DNA and shot contract. Report scores, defects, and retake recommendations.`;
  },
};
