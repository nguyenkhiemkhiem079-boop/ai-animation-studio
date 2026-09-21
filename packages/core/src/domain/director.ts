/**
 * Domain models and schemas for Scene and Shot Direction, ShotContract, and Director DNA.
 */

import { z } from 'zod';

export const ShotPurposeSchema = z.enum([
  'establishing',
  'character_intro',
  'reaction',
  'dialogue_coverage',
  'action',
  'reveal',
  'mood_insert',
  'transition',
  'climax',
]);
export type ShotPurpose = z.infer<typeof ShotPurposeSchema>;

export const ShotComplexitySchema = z.enum([
  'static',
  'simple_transform',
  'multi_layer_parallax',
  'rigged_character_action',
  'complex_generative_video',
]);
export type ShotComplexity = z.infer<typeof ShotComplexitySchema>;

export const RendererIntentSchema = z.enum([
  'deterministic_hyperframes',
  'deterministic_rigged_2d',
  'generative_image_to_video',
  'generative_full_video',
  'hybrid',
]);
export type RendererIntent = z.infer<typeof RendererIntentSchema>;

export const CameraIntentSchema = z.object({
  focalLength: z.string().default('35mm'), // e.g. 24mm, 35mm, 50mm, 85mm
  shotSize: z.enum(['extreme_wide', 'wide', 'medium_wide', 'medium', 'medium_close_up', 'close_up', 'extreme_close_up']),
  angle: z.enum(['eye_level', 'low_angle', 'high_angle', 'dutch_angle', 'birds_eye', 'worms_eye']),
  movement: z.string(), // e.g. "push_in", "orbit_clockwise", "static", "tracking_left"
  semanticSkills: z.array(z.string()).default([]),
  cameraHeight: z.string().optional(),
});
export type CameraIntent = z.infer<typeof CameraIntentSchema>;

export const LightingIntentSchema = z.object({
  keyLightDirection: z.enum(['left', 'right', 'front', 'back', 'top', 'under']),
  mood: z.string(), // e.g. "somber", "tense", "warm", "chiaroscuro"
  colorTemperature: z.enum(['warm', 'neutral', 'cool', 'stylized']).default('neutral'),
  fogAtmosphere: z.boolean().default(false),
});
export type LightingIntent = z.infer<typeof LightingIntentSchema>;

export const FrameIntentSchema = z.object({
  durationSeconds: z.number().positive(),
  aspectRatio: z.string().default('16:9'),
  targetFps: z.number().int().default(24),
});
export type FrameIntent = z.infer<typeof FrameIntentSchema>;

export const ActingIntentSchema = z.object({
  characterId: z.string().min(1),
  outfitId: z.string().optional(),
  pose: z.string(), // e.g. "standing_cautious", "sitting_head_down"
  expression: z.string(), // e.g. "terrified", "subtle_smirk"
  gazeDirection: z.string().optional(),
  actionPrompt: z.string().optional(),
  dialogueLine: z.string().optional(),
});
export type ActingIntent = z.infer<typeof ActingIntentSchema>;

export const ShotContractSchema = z.object({
  id: z.string().min(1), // e.g. "SHOT_SC01_SH01"
  sceneId: z.string().min(1),
  shotNumber: z.number().int().positive(),
  purpose: ShotPurposeSchema,
  complexity: ShotComplexitySchema,
  rendererIntent: RendererIntentSchema,
  frame: FrameIntentSchema,
  camera: CameraIntentSchema,
  lighting: LightingIntentSchema,
  acting: z.array(ActingIntentSchema).default([]),
  environmentLocationId: z.string().optional(),
  environmentZoneId: z.string().optional(),
  audioCue: z.object({
    sfx: z.array(z.string()).default([]),
    musicMood: z.string().optional(),
    dialogueAudioId: z.string().optional(),
  }).default({ sfx: [] }),
  requiredAssetIds: z.array(z.string()).default([]),
  dependsOnShotIds: z.array(z.string()).default([]),
  directorLocks: z.object({
    isCameraLocked: z.boolean().default(false),
    isFramingLocked: z.boolean().default(false),
    isRendererLocked: z.boolean().default(false),
  }).default({}),
  provenance: z.object({
    sourceBeatId: z.string().optional(),
    directorProfileId: z.string().optional(),
    decidedAt: z.string().datetime(),
  }),
});
export type ShotContract = z.infer<typeof ShotContractSchema>;

export const DirectorProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pacingPreference: z.enum(['slow_cinema', 'deliberate', 'dynamic', 'frenetic']),
  compositionBias: z.enum(['symmetrical', 'rule_of_thirds', 'wide_negative_space', 'tight_claustrophobic']),
  colorPaletteBias: z.string().optional(),
  preferredFocalLengths: z.array(z.string()).default(['35mm', '50mm']),
  favoriteSkills: z.array(z.string()).default([]),
});
export type DirectorProfile = z.infer<typeof DirectorProfileSchema>;

export const ProductionSceneSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sceneNumber: z.number().int().positive(),
  heading: z.string(),
  purpose: z.string(),
  narrativeIntent: z.string(),
  shots: z.array(ShotContractSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductionScene = z.infer<typeof ProductionSceneSchema>;

export const ShotDependencyGraphSchema = z.object({
  sceneId: z.string().min(1),
  adjacencyList: z.record(z.array(z.string())),
  entryShotIds: z.array(z.string()),
  terminalShotIds: z.array(z.string()),
});
export type ShotDependencyGraph = z.infer<typeof ShotDependencyGraphSchema>;
