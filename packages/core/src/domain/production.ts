import { z } from 'zod';
import { RendererIntentSchema, ShotContractSchema } from './director.js';

export const ReferenceRoleSchema = z.enum([
  'CHARACTER_IDENTITY',
  'CHARACTER_POSE',
  'OUTFIT',
  'ENVIRONMENT',
  'STYLE',
  'MOTION',
  'CAMERA',
  'AUDIO',
  'START_FRAME',
  'END_FRAME',
]);
export type ReferenceRole = z.infer<typeof ReferenceRoleSchema>;

export const ReferenceBindingSchema = z.object({
  role: ReferenceRoleSchema,
  assetId: z.string().min(1),
  weight: z.number().min(0.0).max(1.0).default(1.0),
  slot: z.string().optional(),
  antiBleedRules: z.array(z.string()).default([]),
});
export type ReferenceBinding = z.infer<typeof ReferenceBindingSchema>;

export const CompiledPromptPacketSchema = z.object({
  positivePrompt: z.string(),
  negativePrompt: z.string().default(''),
  referenceBindings: z.array(ReferenceBindingSchema).default([]),
  cameraDirective: z.string().default(''),
  lightingDirective: z.string().default(''),
  actingDirective: z.string().default(''),
  compiledAt: z.string().datetime(),
});
export type CompiledPromptPacket = z.infer<typeof CompiledPromptPacketSchema>;

export const ProductionStrategySchema = z.object({
  shotId: z.string().min(1),
  executionRoute: RendererIntentSchema,
  primaryProviderId: z.string().min(1),
  fallbackProviderId: z.string().optional(),
  estimatedCostUsd: z.number().nonnegative().default(0.0),
  estimatedLatencyMs: z.number().nonnegative().default(0),
  rationale: z.string().min(1),
  requiredInputAssets: z.array(ReferenceBindingSchema).default([]),
  promptPacket: CompiledPromptPacketSchema.optional(),
  isDeterministic: z.boolean().default(false),
  requiresContinuation: z.boolean().default(false),
  integrationMode: z.enum(['ASSISTED', 'AUTOMATED', 'DETERMINISTIC']).optional(),
  userActionRequired: z.boolean().optional(),
});
export type ProductionStrategy = z.infer<typeof ProductionStrategySchema>;

export const BudgetConfigSchema = z.object({
  maxBudgetUsd: z.number().nonnegative().default(100.0),
  warningThresholdPercent: z.number().min(0).max(100).default(80.0),
  enforceHardCap: z.boolean().default(true),
});
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

export const BudgetStatusSchema = z.object({
  maxBudgetUsd: z.number().nonnegative(),
  spentBudgetUsd: z.number().nonnegative().default(0.0),
  remainingBudgetUsd: z.number().default(100.0),
  utilizationPercent: z.number().min(0).max(100).default(0.0),
  isWarning: z.boolean().default(false),
  isHardCapReached: z.boolean().default(false),
});
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const GenerationJobStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cached',
  'cancelled',
]);
export type GenerationJobStatus = z.infer<typeof GenerationJobStatusSchema>;

export const GenerationJobSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  seriesId: z.string().min(1),
  shotId: z.string().min(1),
  status: GenerationJobStatusSchema.default('pending'),
  strategy: ProductionStrategySchema,
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().nonnegative().default(2),
  outputAssetId: z.string().optional(),
  error: z.string().optional(),
  actualCostUsd: z.number().nonnegative().default(0.0),
  durationMs: z.number().nonnegative().default(0),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export const GenerationResultSchema = z.object({
  jobId: z.string().min(1),
  shotId: z.string().min(1),
  status: GenerationJobStatusSchema,
  outputAssetId: z.string().optional(),
  providerId: z.string().min(1),
  wasCached: z.boolean().default(false),
  actualCostUsd: z.number().nonnegative().default(0.0),
  durationMs: z.number().nonnegative().default(0),
  mediaUri: z.string().optional(),
  error: z.string().optional(),
});
export type GenerationResult = z.infer<typeof GenerationResultSchema>;

export const ProviderBenchmarkSchema = z.object({
  providerId: z.string().min(1),
  totalInvocations: z.number().int().nonnegative().default(0),
  successfulInvocations: z.number().int().nonnegative().default(0),
  failedInvocations: z.number().int().nonnegative().default(0),
  successRate: z.number().min(0).max(1).default(1.0),
  averageCostUsd: z.number().nonnegative().default(0.0),
  averageLatencyMs: z.number().nonnegative().default(0),
  qualityScore: z.number().min(0).max(1).default(0.9),
  lastUpdated: z.string().datetime(),
});
export type ProviderBenchmark = z.infer<typeof ProviderBenchmarkSchema>;

export const ProductionPlanSchema = z.object({
  projectId: z.string().min(1),
  seriesId: z.string().min(1),
  totalShots: z.number().int().nonnegative(),
  deterministicShotsCount: z.number().int().nonnegative(),
  generativeShotsCount: z.number().int().nonnegative(),
  hybridShotsCount: z.number().int().nonnegative(),
  totalEstimatedCostUsd: z.number().nonnegative(),
  totalEstimatedLatencyMs: z.number().nonnegative(),
  strategies: z.array(ProductionStrategySchema),
  plannedAt: z.string().datetime(),
});
export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;
