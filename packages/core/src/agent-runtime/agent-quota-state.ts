/**
 * Agent Quota State & Management
 *
 * Distinguishes all distinct quota types across AI Animation Studio:
 *  - PRIMARY_AGENT_QUOTA: Antigravity / Codex agent execution quota
 *  - GEMINI_ENGINEERING_QUOTA: Gemini API used as fallback reasoning/coding assistance
 *  - GEMINI_VISUAL_QA_QUOTA: Gemini API used for production Visual Semantic QA
 *  - GOOGLE_FLOW_CREDITS: Flow media generation credits
 *  - PAID_VEO_API: Paid video API (DISABLED by default)
 */

import { z } from 'zod';

export type QuotaStatus = 'AVAILABLE' | 'EXHAUSTED' | 'UNKNOWN';

export const QuotaStateMapSchema = z.object({
  primaryAgent: z.enum(['AVAILABLE', 'EXHAUSTED', 'UNKNOWN']).default('AVAILABLE'),
  geminiEngineering: z.enum(['AVAILABLE', 'EXHAUSTED', 'UNKNOWN']).default('AVAILABLE'),
  geminiVisualQA: z.enum(['AVAILABLE', 'EXHAUSTED', 'UNKNOWN']).default('AVAILABLE'),
  flowCredits: z.enum(['AVAILABLE', 'EXHAUSTED', 'UNKNOWN']).default('UNKNOWN'),
  paidVideoApi: z.literal('DISABLED').default('DISABLED'),
});

export type QuotaStateMap = z.infer<typeof QuotaStateMapSchema>;

export function createDefaultQuotaState(): QuotaStateMap {
  return {
    primaryAgent: 'AVAILABLE',
    geminiEngineering: process.env.GEMINI_API_KEY ? 'AVAILABLE' : 'UNKNOWN',
    geminiVisualQA: process.env.GEMINI_API_KEY ? 'AVAILABLE' : 'UNKNOWN',
    flowCredits: 'UNKNOWN',
    paidVideoApi: 'DISABLED',
  };
}

export function isDualAgentQuotaExhausted(quota: QuotaStateMap): boolean {
  return quota.primaryAgent === 'EXHAUSTED' && quota.geminiEngineering === 'EXHAUSTED';
}
