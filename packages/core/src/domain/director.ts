/**
 * Domain models and schemas for Scene and Shot Direction, ShotContract,
 * Cinematic Grammar, Sequencing, and Director QA.
 */

import { z } from 'zod';

export const ScenePurposeSchema = z.enum([
  'establishing',
  'character_intro',
  'dialogue',
  'conflict',
  'action',
  'exposition',
  'reveal',
  'climax',
  'resolution',
  'transition',
]);
export type ScenePurpose = z.infer<typeof ScenePurposeSchema>;

export const NarrativeIntentSchema = z.object({
  dramaticGoal: z.string().min(1),
  emotionalTone: z.string().default('neutral'),
  pacingPriority: z.enum(['slow_cinema', 'slow', 'deliberate', 'dynamic', 'frenetic']).default('deliberate'),
});
export type NarrativeIntent = z.infer<typeof NarrativeIntentSchema>;

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
  gazeDirection: z.enum(['screen_left', 'screen_right', 'direct_to_camera', 'looking_down', 'looking_up', 'away']).default('screen_left'),
  actionPrompt: z.string().optional(),
  dialogueLine: z.string().optional(),
});
export type ActingIntent = z.infer<typeof ActingIntentSchema>;

export const TransitionIntentSchema = z.object({
  type: z.enum(['cut', 'dissolve', 'whip_pan', 'match_cut', 'fade_to_black', 'fade_from_black']),
  durationSeconds: z.number().nonnegative().default(0),
  matchFeature: z.string().optional(),
});
export type TransitionIntent = z.infer<typeof TransitionIntentSchema>;

export const CompositionIntentSchema = z.object({
  rule: z.enum(['rule_of_thirds', 'symmetrical', 'wide_negative_space', 'tight_claustrophobic', 'golden_ratio']),
  subjectPlacement: z.enum(['left_third', 'center', 'right_third']),
  depthLayers: z.object({
    foreground: z.array(z.string()).default([]),
    midground: z.array(z.string()).default([]),
    background: z.array(z.string()).default([]),
  }).default({ foreground: [], midground: [], background: [] }),
});
export type CompositionIntent = z.infer<typeof CompositionIntentSchema>;

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
  composition: CompositionIntentSchema.default({
    rule: 'rule_of_thirds',
    subjectPlacement: 'center',
    depthLayers: { foreground: [], midground: [], background: [] },
  }),
  acting: z.array(ActingIntentSchema).default([]),
  transition: TransitionIntentSchema.default({ type: 'cut', durationSeconds: 0 }),
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
    isActingLocked: z.boolean().default(false),
  }).default({}),
  provenance: z.object({
    sourceBeatId: z.string().optional(),
    directorProfileId: z.string().optional(),
    ruleApplied: z.string().optional(),
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
  defaultShotDurationSeconds: z.number().positive().default(3.5),
});
export type DirectorProfile = z.infer<typeof DirectorProfileSchema>;

export const SequenceStateSchema = z.object({
  currentShotIndex: z.number().int().nonnegative(),
  cumulativeDurationSeconds: z.number().nonnegative(),
  activeEyelineVector: z.enum(['screen_left', 'screen_right', 'center']).default('center'),
  lastShotSize: z.string().optional(),
  lastCameraAngle: z.string().optional(),
  lastSpeakingCharacter: z.string().optional(),
  recentSkillsUsed: z.array(z.string()).default([]),
});
export type SequenceState = z.infer<typeof SequenceStateSchema>;

export const ShotRhythmSchema = z.object({
  totalDurationSeconds: z.number().nonnegative(),
  averageShotDurationSeconds: z.number().nonnegative(),
  pacingCurve: z.enum(['slow_cinema', 'deliberate', 'dynamic', 'frenetic']),
  shotCount: z.number().int().nonnegative(),
});
export type ShotRhythm = z.infer<typeof ShotRhythmSchema>;

export const DirectorQAReportSchema = z.object({
  isValid: z.boolean(),
  jumpCutWarnings: z.array(
    z.object({
      shotAId: z.string(),
      shotBId: z.string(),
      reason: z.string(),
    })
  ).default([]),
  eyelineWarnings: z.array(
    z.object({
      shotAId: z.string(),
      shotBId: z.string(),
      reason: z.string(),
    })
  ).default([]),
  repetitionWarnings: z.array(
    z.object({
      skillOrSize: z.string(),
      consecutiveCount: z.number(),
      shotIds: z.array(z.string()),
    })
  ).default([]),
  dependencyErrors: z.array(z.string()).default([]),
  rhythmSummary: ShotRhythmSchema,
});
export type DirectorQAReport = z.infer<typeof DirectorQAReportSchema>;

export const ProductionSceneSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sceneNumber: z.number().int().positive(),
  heading: z.string(),
  purpose: ScenePurposeSchema.default('dialogue'),
  narrativeIntent: NarrativeIntentSchema.default({ dramaticGoal: 'Advance scene action' }),
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
