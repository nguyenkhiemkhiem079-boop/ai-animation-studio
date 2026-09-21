/**
 * Domain models and schemas for Cinematic Skills, Camera Motion, and Composition Grammar.
 */

import { z } from 'zod';

export const SkillCategorySchema = z.enum([
  'camera_motion',
  'composition',
  'lighting_fx',
  'lens_effect',
  'time_dilation',
  'stylistic',
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['number', 'string', 'boolean', 'enum']),
  description: z.string(),
  defaultValue: z.unknown(),
  allowedValues: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type SkillParameter = z.infer<typeof SkillParameterSchema>;

export const CinematicSkillSchema = z.object({
  id: z.string().min(1), // e.g. "push_in", "orbit", "rack_focus"
  name: z.string().min(1),
  category: SkillCategorySchema,
  description: z.string(),
  semanticIntent: z.string(), // e.g. "Directs emotional focus towards character intimacy or realization"
  parameters: z.array(SkillParameterSchema).default([]),
  supportsDeterministic: z.boolean().default(true),
  supportsGenerative: z.boolean().default(true),
});
export type CinematicSkill = z.infer<typeof CinematicSkillSchema>;
