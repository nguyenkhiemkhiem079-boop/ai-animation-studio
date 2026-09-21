import { z } from 'zod';

export const HyperFramesLayerTypeSchema = z.enum([
  'image',
  'text',
  'shape',
  'video',
  'audio',
]);
export type HyperFramesLayerType = z.infer<typeof HyperFramesLayerTypeSchema>;

export const LayerTransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().default(1),
  opacity: z.number().min(0).max(1).default(1),
  rotation: z.number().default(0),
});
export type LayerTransform = z.infer<typeof LayerTransformSchema>;

export const LayerTimingSchema = z.object({
  startSeconds: z.number().nonnegative().default(0),
  durationSeconds: z.number().positive(),
});
export type LayerTiming = z.infer<typeof LayerTimingSchema>;

export const HyperFramesLayerSchema = z.object({
  id: z.string().min(1),
  type: HyperFramesLayerTypeSchema.default('image'),
  name: z.string().min(1),
  src: z.string().optional(),
  textContent: z.string().optional(),
  zIndex: z.number().int().default(0),
  parallaxFactor: z.number().min(0.0).max(2.0).default(1.0),
  initialTransform: LayerTransformSchema.default({}),
  timing: LayerTimingSchema,
  cssClass: z.string().optional(),
});
export type HyperFramesLayer = z.infer<typeof HyperFramesLayerSchema>;

export const HyperFramesCompositionSchema = z.object({
  compositionId: z.string().min(1),
  shotId: z.string().min(1),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.number().int().positive().default(24),
  durationSeconds: z.number().positive(),
  layers: z.array(HyperFramesLayerSchema).default([]),
  html: z.string().min(1),
  semanticSkills: z.array(z.string()).default([]),
  compiledAt: z.string().datetime(),
});
export type HyperFramesComposition = z.infer<typeof HyperFramesCompositionSchema>;

export const HyperFramesRenderResultSchema = z.object({
  shotId: z.string().min(1),
  compositionId: z.string().min(1),
  outputAssetId: z.string().min(1),
  format: z.enum(['html_bundle', 'mp4', 'frames']).default('html_bundle'),
  durationMs: z.number().nonnegative().default(0),
  actualCostUsd: z.number().nonnegative().default(0.0),
  htmlPath: z.string().optional(),
  renderedAt: z.string().datetime(),
});
export type HyperFramesRenderResult = z.infer<typeof HyperFramesRenderResultSchema>;
