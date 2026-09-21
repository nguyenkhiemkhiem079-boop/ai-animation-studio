/**
 * Domain models and schemas for Character and World Assets, Identity Locks, and Manifests.
 */

import { z } from 'zod';

export const AssetTypeSchema = z.enum([
  'character_sheet',
  'character_pose',
  'character_expression',
  'character_rig',
  'location_backdrop',
  'location_layer',
  'prop_texture',
  'audio_voice',
  'audio_music',
  'audio_sfx',
  'video_clip',
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

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

export const AssetDescriptorSchema = z.object({
  id: z.string().min(1),
  seriesId: z.string().min(1),
  type: AssetTypeSchema,
  status: AssetStatusSchema.default('candidate'),
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
  views: z.record(z.string()).default({}), // "front", "3_4_left", "side_left", etc. -> assetId
  outfits: z.record(z.array(z.string())).default({}), // outfitId -> assetIds
  updatedAt: z.string().datetime(),
});
export type CharacterAssetManifest = z.infer<typeof CharacterAssetManifestSchema>;
