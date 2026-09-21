import { z } from 'zod';
import { CompiledPromptPacketSchema, ReferenceBindingSchema } from './production.js';

export const CutTypeSchema = z.enum([
  'direct_cut',
  'match_cut',
  'continuation',
  'cross_dissolve',
  'fade_black',
]);
export type CutType = z.infer<typeof CutTypeSchema>;

export const RetakeTypeSchema = z.enum([
  'lighting_adjustment',
  'acting_intensity',
  'camera_speed',
  'framing_tighten',
  'seed_variation',
  'environment_tweak',
]);
export type RetakeType = z.infer<typeof RetakeTypeSchema>;

export const VideoResolutionSchema = z.object({
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
});
export type VideoResolution = z.infer<typeof VideoResolutionSchema>;

export const CameraTrajectoryDirectiveSchema = z.object({
  movement: z.string(),
  speed: z.number().min(0.1).max(5.0).default(1.0),
  intensity: z.number().min(0.0).max(1.0).default(0.5),
  focalLength: z.string().optional(),
});
export type CameraTrajectoryDirective = z.infer<typeof CameraTrajectoryDirectiveSchema>;

export const VideoGenerationTaskSchema = z.object({
  shotId: z.string().min(1),
  projectId: z.string().min(1),
  seriesId: z.string().default('default_series'),
  promptPacket: CompiledPromptPacketSchema,
  referenceBindings: z.array(ReferenceBindingSchema).default([]),
  startFrameAssetId: z.string().optional(),
  endFrameAssetId: z.string().optional(),
  motionStrength: z.number().min(0.0).max(1.0).default(0.7),
  cameraTrajectory: CameraTrajectoryDirectiveSchema.optional(),
  resolution: VideoResolutionSchema.default({ width: 1920, height: 1080 }),
  durationSeconds: z.number().positive().default(3.0),
  fps: z.number().int().positive().default(24),
  seed: z.number().int().optional(),
  retakeLineage: z
    .object({
      originalShotId: z.string(),
      retakeCount: z.number().int().nonnegative(),
      reason: z.string(),
      retakeType: RetakeTypeSchema,
    })
    .optional(),
});
export type VideoGenerationTask = z.infer<typeof VideoGenerationTaskSchema>;

export const VideoGenerationOutputSchema = z.object({
  assetId: z.string().min(1),
  shotId: z.string().min(1),
  providerId: z.string().min(1),
  videoUri: z.string().min(1),
  terminalFrameAssetId: z.string().min(1),
  terminalFrameUri: z.string().min(1),
  resolution: VideoResolutionSchema,
  durationSeconds: z.number().positive(),
  fps: z.number().int().positive(),
  seed: z.number().int(),
  actualCostUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  metadata: z.record(z.unknown()).default({}),
  generatedAt: z.string().datetime(),
});
export type VideoGenerationOutput = z.infer<typeof VideoGenerationOutputSchema>;

export const ContinuationPacketSchema = z.object({
  precedingShotId: z.string().min(1),
  targetShotId: z.string().min(1),
  terminalFrameAssetId: z.string().min(1),
  cutType: CutTypeSchema.default('continuation'),
  subjectState: z
    .object({
      characterId: z.string(),
      facingAngleDeg: z.number().optional(),
      normalizedPosition: z.object({ x: z.number(), y: z.number() }).optional(),
      motionVector: z.object({ dx: z.number(), dy: z.number() }).optional(),
    })
    .optional(),
  lightingPreserved: z.boolean().default(true),
  antiBleedDirectives: z.array(z.string()).default([]),
});
export type ContinuationPacket = z.infer<typeof ContinuationPacketSchema>;

export const SurgicalRetakeRequestSchema = z.object({
  shotId: z.string().min(1),
  originalJobId: z.string().min(1),
  retakeType: RetakeTypeSchema,
  reason: z.string().min(1),
  variableAdjustments: z.record(z.unknown()).default({}),
  lockSeed: z.boolean().default(true),
  preserveReferences: z.boolean().default(true),
});
export type SurgicalRetakeRequest = z.infer<typeof SurgicalRetakeRequestSchema>;

export const SurgicalRetakeResultSchema = z.object({
  newJobId: z.string().min(1),
  shotId: z.string().min(1),
  outputAssetId: z.string().min(1),
  retakeCount: z.number().int().positive(),
  retakeType: RetakeTypeSchema,
  reason: z.string(),
  adjustedPrompt: z.string(),
  usedSeed: z.number().int(),
  actualCostUsd: z.number().nonnegative(),
});
export type SurgicalRetakeResult = z.infer<typeof SurgicalRetakeResultSchema>;
