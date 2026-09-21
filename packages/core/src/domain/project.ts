/**
 * Domain models and schemas for Projects, Series, and Episodes.
 */

import { z } from 'zod';

export const SeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  logline: z.string().optional(),
  targetAudience: z.string().optional(),
  visualStyle: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export type Series = z.infer<typeof SeriesSchema>;

export const EpisodeSchema = z.object({
  id: z.string().min(1),
  seriesId: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  title: z.string().min(1),
  synopsis: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Episode = z.infer<typeof EpisodeSchema>;

export const ProjectStatusSchema = z.enum([
  'draft',
  'analyzing',
  'planning',
  'producing',
  'reviewing',
  'completed',
  'failed',
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectConfigSchema = z.object({
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '2.39:1']).default('16:9'),
  targetFps: z.number().int().default(24),
  resolution: z.object({
    width: z.number().int().default(1920),
    height: z.number().int().default(1080),
  }).default({ width: 1920, height: 1080 }),
  defaultRenderer: z.enum(['deterministic_first', 'generative_first']).default('deterministic_first'),
  budgetLimitUsd: z.number().nonnegative().optional(),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  seriesId: z.string().min(1),
  episodeId: z.string().optional(),
  status: ProjectStatusSchema.default('draft'),
  config: ProjectConfigSchema.default({}),
  activeCheckpointId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export type Project = z.infer<typeof ProjectSchema>;
