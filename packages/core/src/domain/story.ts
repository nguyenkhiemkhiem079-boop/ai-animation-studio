/**
 * Domain models and schemas for Story Intelligence, Source Documents, and Candidates.
 */

import { z } from 'zod';

export const SourceTraceabilitySchema = z.object({
  documentId: z.string().min(1),
  segmentIndex: z.number().int().nonnegative(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  contentHash: z.string().min(1),
});
export type SourceTraceability = z.infer<typeof SourceTraceabilitySchema>;

export const SourceSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  hash: z.string().min(1),
});
export type SourceSegment = z.infer<typeof SourceSegmentSchema>;

export const SourceDocumentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  rawContent: z.string(),
  contentHash: z.string().min(1),
  segments: z.array(SourceSegmentSchema).default([]),
  wordCount: z.number().int().nonnegative(),
  isPreserveOriginal: z.boolean().default(true),
  createdAt: z.string().datetime(),
});
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

export const CharacterCandidateSchema = z.object({
  candidateId: z.string().min(1),
  suggestedName: z.string().min(1),
  mentionCount: z.number().int().positive(),
  traits: z.array(z.string()).default([]),
  dialogueSample: z.string().optional(),
  sourceTrace: z.array(SourceTraceabilitySchema).default([]),
  resolvedCanonId: z.string().optional(),
});
export type CharacterCandidate = z.infer<typeof CharacterCandidateSchema>;

export const LocationCandidateSchema = z.object({
  candidateId: z.string().min(1),
  suggestedName: z.string().min(1),
  description: z.string(),
  sourceTrace: z.array(SourceTraceabilitySchema).default([]),
  resolvedCanonId: z.string().optional(),
});
export type LocationCandidate = z.infer<typeof LocationCandidateSchema>;

export const NarrativeBeatSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  summary: z.string(),
  emotionalShift: z.string().optional(),
  involvedCharacterIds: z.array(z.string()).default([]),
  sourceTrace: SourceTraceabilitySchema,
});
export type NarrativeBeat = z.infer<typeof NarrativeBeatSchema>;

export const SceneCandidateSchema = z.object({
  id: z.string().min(1),
  sceneNumber: z.number().int().positive(),
  heading: z.string(), // e.g. "INT. OLD HOUSE - NIGHT"
  timeOfDay: z.enum(['day', 'night', 'dawn', 'dusk', 'continuous', 'unspecified']).default('unspecified'),
  locationName: z.string(),
  charactersPresent: z.array(z.string()).default([]),
  beats: z.array(NarrativeBeatSchema).default([]),
  dialogueLines: z.array(
    z.object({
      speaker: z.string(),
      line: z.string(),
      intent: z.string().optional(),
      sourceTrace: SourceTraceabilitySchema.optional(),
    })
  ).default([]),
  narrationLines: z.array(
    z.object({
      text: z.string(),
      sourceTrace: SourceTraceabilitySchema.optional(),
    })
  ).default([]),
  sourceTrace: z.array(SourceTraceabilitySchema).default([]),
});
export type SceneCandidate = z.infer<typeof SceneCandidateSchema>;

export const StoryAnalysisSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  sourceContentHash: z.string().min(1),
  characterCandidates: z.array(CharacterCandidateSchema).default([]),
  locationCandidates: z.array(LocationCandidateSchema).default([]),
  sceneCandidates: z.array(SceneCandidateSchema).default([]),
  sourceCoveragePercentage: z.number().min(0).max(100),
  canonConflicts: z.array(
    z.object({
      entityType: z.enum(['character', 'location', 'prop', 'fact']),
      entityId: z.string(),
      description: z.string(),
      suggestedResolution: z.string().optional(),
    })
  ).default([]),
  analyzedAt: z.string().datetime(),
});
export type StoryAnalysis = z.infer<typeof StoryAnalysisSchema>;
