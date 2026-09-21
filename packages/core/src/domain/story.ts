/**
 * Domain models and schemas for Story Intelligence, Source Documents,
 * Traceability, Candidates, Coverage, and Hallucination Guard.
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

export const DialogueLineSchema = z.object({
  speaker: z.string().min(1),
  line: z.string(),
  intent: z.string().optional(),
  sourceTrace: SourceTraceabilitySchema,
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const NarrationLineSchema = z.object({
  text: z.string(),
  voiceMood: z.string().optional(),
  sourceTrace: SourceTraceabilitySchema,
});
export type NarrationLine = z.infer<typeof NarrationLineSchema>;

export const NarrativeBeatSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  summary: z.string(),
  emotionalShift: z.string().optional(),
  involvedCharacterIds: z.array(z.string()).default([]),
  sourceTrace: SourceTraceabilitySchema,
});
export type NarrativeBeat = z.infer<typeof NarrativeBeatSchema>;

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
  zones: z.array(z.string()).default([]),
  sourceTrace: z.array(SourceTraceabilitySchema).default([]),
  resolvedCanonId: z.string().optional(),
});
export type LocationCandidate = z.infer<typeof LocationCandidateSchema>;

export const PropCandidateSchema = z.object({
  candidateId: z.string().min(1),
  suggestedName: z.string().min(1),
  visualDescription: z.string(),
  holder: z.string().optional(),
  sourceTrace: z.array(SourceTraceabilitySchema).default([]),
  resolvedCanonId: z.string().optional(),
});
export type PropCandidate = z.infer<typeof PropCandidateSchema>;

export const RelationshipCandidateSchema = z.object({
  id: z.string().min(1),
  characterA: z.string().min(1),
  characterB: z.string().min(1),
  inferredRelation: z.string(),
  sentiment: z.enum(['friendly', 'hostile', 'neutral', 'ambivalent']).default('neutral'),
  sourceTrace: SourceTraceabilitySchema,
});
export type RelationshipCandidate = z.infer<typeof RelationshipCandidateSchema>;

export const EventCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  significance: z.string().optional(),
  sourceTrace: SourceTraceabilitySchema,
});
export type EventCandidate = z.infer<typeof EventCandidateSchema>;

export const SceneCandidateSchema = z.object({
  id: z.string().min(1),
  sceneNumber: z.number().int().positive(),
  heading: z.string(), // e.g. "INT. OLD HOUSE - NIGHT"
  timeOfDay: z.enum(['day', 'night', 'dawn', 'dusk', 'continuous', 'unspecified']).default('unspecified'),
  locationName: z.string(),
  charactersPresent: z.array(z.string()).default([]),
  beats: z.array(NarrativeBeatSchema).default([]),
  dialogueLines: z.array(DialogueLineSchema).default([]),
  narrationLines: z.array(NarrationLineSchema).default([]),
  sourceTrace: z.array(SourceTraceabilitySchema).default([]),
});
export type SceneCandidate = z.infer<typeof SceneCandidateSchema>;

export const CanonConflictSchema = z.object({
  entityType: z.enum(['character', 'location', 'prop', 'fact']),
  entityId: z.string(),
  description: z.string(),
  sourceTrace: SourceTraceabilitySchema.optional(),
  suggestedResolution: z.string().optional(),
});
export type CanonConflict = z.infer<typeof CanonConflictSchema>;

export const SourceCoverageSchema = z.object({
  coveragePercentage: z.number().min(0).max(100),
  totalCharacters: z.number().int().nonnegative(),
  coveredCharacters: z.number().int().nonnegative(),
  coveredRanges: z.array(z.tuple([z.number(), z.number()])).default([]),
  uncoveredRanges: z.array(z.tuple([z.number(), z.number()])).default([]),
});
export type SourceCoverage = z.infer<typeof SourceCoverageSchema>;

export const HallucinationGuardReportSchema = z.object({
  isValid: z.boolean(),
  violations: z.array(
    z.object({
      entityType: z.string(),
      entityId: z.string(),
      reason: z.string(),
      invalidOffset: z.object({
        charStart: z.number(),
        charEnd: z.number(),
      }),
    })
  ).default([]),
  ungroundedEntities: z.array(z.string()).default([]),
});
export type HallucinationGuardReport = z.infer<typeof HallucinationGuardReportSchema>;

export const StoryReviewSchema = z.object({
  summary: z.string(),
  tone: z.string().optional(),
  pacingAssessment: z.string().optional(),
  suggestedInterventions: z.array(z.string()).default([]),
});
export type StoryReview = z.infer<typeof StoryReviewSchema>;

export const StoryAnalysisSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  sourceContentHash: z.string().min(1),
  characterCandidates: z.array(CharacterCandidateSchema).default([]),
  locationCandidates: z.array(LocationCandidateSchema).default([]),
  propCandidates: z.array(PropCandidateSchema).default([]),
  relationshipCandidates: z.array(RelationshipCandidateSchema).default([]),
  eventCandidates: z.array(EventCandidateSchema).default([]),
  sceneCandidates: z.array(SceneCandidateSchema).default([]),
  coverage: SourceCoverageSchema.default({
    coveragePercentage: 0,
    totalCharacters: 0,
    coveredCharacters: 0,
    coveredRanges: [],
    uncoveredRanges: [],
  }),
  hallucinationReport: HallucinationGuardReportSchema.default({
    isValid: true,
    violations: [],
    ungroundedEntities: [],
  }),
  canonConflicts: z.array(CanonConflictSchema).default([]),
  review: StoryReviewSchema.optional(),
  analyzedAt: z.string().datetime(),
});
export type StoryAnalysis = z.infer<typeof StoryAnalysisSchema>;
