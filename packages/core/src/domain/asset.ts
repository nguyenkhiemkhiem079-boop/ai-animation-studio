/**
 * Domain models and schemas for Character and World Assets, Identity Locks, and Manifests.
 */

import { z } from 'zod';

export const AssetTypeSchema = z.enum([
  'character_sheet',
  'character_turnaround',
  'character_pose',
  'character_expression',
  'character_outfit',
  'character_rig',
  'location_backdrop',
  'location_layer',
  'prop_texture',
  'audio_voice',
  'audio_music',
  'audio_sfx',
  'video_clip',
  'timeline_sequence',
  'subtitle_file',
  'qa_report',
  'export_manifest',
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const TurnaroundViewSchema = z.enum([
  'front',
  'three_quarter_left',
  'three_quarter_right',
  'profile_left',
  'profile_right',
  'back',
]);
export type TurnaroundView = z.infer<typeof TurnaroundViewSchema>;

export const CharacterSheetSchema = z.object({
  characterId: z.string().min(1),
  version: z.number().int().positive().default(1),
  views: z.record(TurnaroundViewSchema, z.string()).default({}), // view -> assetId
  neutralPortraitAssetId: z.string().optional(),
  heightCm: z.number().positive().optional(),
  proportionsDescription: z.string().optional(),
  paletteColors: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
});
export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

export const ExpressionCategorySchema = z.enum([
  'neutral',
  'positive',
  'negative',
  'intense',
  'subtle',
]);
export type ExpressionCategory = z.infer<typeof ExpressionCategorySchema>;

export const ExpressionEntrySchema = z.object({
  name: z.string().min(1),
  category: ExpressionCategorySchema.default('neutral'),
  intensity: z.number().min(0).max(1).default(0.5),
  assetId: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
export type ExpressionEntry = z.infer<typeof ExpressionEntrySchema>;

export const PoseCategorySchema = z.enum([
  'standing',
  'seated',
  'kinetic',
  'gesture',
  'ground',
]);
export type PoseCategory = z.infer<typeof PoseCategorySchema>;

export const PoseEntrySchema = z.object({
  name: z.string().min(1),
  category: PoseCategorySchema.default('standing'),
  assetId: z.string().min(1),
  facing: TurnaroundViewSchema.default('front'),
  tags: z.array(z.string()).default([]),
});
export type PoseEntry = z.infer<typeof PoseEntrySchema>;

export const IdentityQAResultSchema = z.object({
  assetId: z.string().min(1),
  characterId: z.string().min(1),
  passed: z.boolean(),
  similarityScore: z.number().min(0).max(1),
  confidenceThreshold: z.number().min(0).max(1),
  facialDriftDetected: z.boolean(),
  paletteAdherenceScore: z.number().min(0).max(1),
  anatomyCheckPassed: z.boolean(),
  critique: z.array(z.string()).default([]),
  evaluatedAt: z.string().datetime(),
});
export type IdentityQAResult = z.infer<typeof IdentityQAResultSchema>;

export const AssetStatusSchema = z.enum([
  'candidate',
  'approved_canon',
  'rejected',
  'deprecated',
]);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

export const IdentityLockSchema = z.object({
  characterId: z.string().min(1),
  faceSignatureHash: z.string().optional(),
  featureAnchors: z.record(z.string()).default({}),
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
});
export type IdentityLock = z.infer<typeof IdentityLockSchema>;

export const ArtifactStateSchema = z.enum([
  'DECLARED',
  'GENERATING',
  'GENERATED',
  'VERIFIED',
  'MISSING',
  'CORRUPT',
]);

export const AssetDescriptorSchema = z.object({
  id: z.string().min(1),
  seriesId: z.string().min(1),
  type: AssetTypeSchema,
  status: AssetStatusSchema.default('candidate'),
  artifactState: ArtifactStateSchema.optional(),
  name: z.string().min(1),
  contentHash: z.string().min(1), // SHA-256 of file/data for deduplication
  storageUri: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  entityId: z.string().optional(), // Linked characterId or locationId
  version: z.number().int().positive().default(1),
  tags: z.array(z.string()).default([]), // e.g. ["scared", "side_view", "v1"]
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
});
export type AssetDescriptor = z.infer<typeof AssetDescriptorSchema>;

export const CharacterAssetManifestSchema = z.object({
  characterId: z.string().min(1),
  canonicalSheetAssetId: z.string().optional(),
  poses: z.record(z.string()).default({}), // poseName -> assetId
  expressions: z.record(z.string()).default({}), // expressionName -> assetId
  views: z.record(z.string()).default({}), // "front", "three_quarter_left", "profile_left", etc. -> assetId
  outfits: z.record(z.array(z.string())).default({}), // outfitId -> assetIds
  updatedAt: z.string().datetime(),
});
export type CharacterAssetManifest = z.infer<typeof CharacterAssetManifestSchema>;
