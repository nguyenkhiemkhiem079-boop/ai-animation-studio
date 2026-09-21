import { z } from 'zod';

export const CONTINUITY_QA_PROMPT_VERSION = 'v1.0.0';

export const ContinuityQAOutputSchema = z.object({
  overallPassed: z.boolean().default(true),
  sourceFidelityScore: z.number().min(0).max(1).default(1.0),
  issues: z.array(
    z.object({
      shotId: z.string().optional(),
      type: z.string(),
      severity: z.enum(['critical', 'warning', 'info']).default('warning'),
      description: z.string(),
      suggestedFix: z.string(),
    })
  ).default([]),
  inventedEvents: z.array(z.string()).default([]),
});

export type ContinuityQAOutput = z.infer<typeof ContinuityQAOutputSchema>;

export interface ContinuityQAPromptOptions {
  shotDescriptions: string[];
  characterIdentities?: Record<string, string>;
  locationName?: string;
}

export function buildContinuityQASystemInstruction(): string {
  return `You are the AI Animation Studio Semantic Continuity QA Auditor.
Your responsibility is to evaluate a sequence of planned shots for narrative logic, character identity consistency, prop continuity, wardrobe persistence, and source fidelity.

AUDIT CRITERIA:
1. Check for unexplained teleportation or sudden wardrobe/appearance changes.
2. Check for missing props across adjacent shots.
3. Check for fidelity to source story (detect any hallucinated or invented story elements).
4. Clearly identify issue severity: critical, warning, or info.
5. Provide actionable auto-repair or human director recommendations.

Output must strictly adhere to the requested JSON schema.`;
}

export function buildContinuityQAUserPrompt(options: ContinuityQAPromptOptions): string {
  return `Location: ${options.locationName ?? 'Scene Location'}
Known Characters: ${JSON.stringify(options.characterIdentities ?? {}, null, 2)}

Shot Sequence:
${options.shotDescriptions.map((s, idx) => `Shot ${idx + 1}: ${s}`).join('\n')}

Please audit this sequence for semantic continuity and narrative fidelity.`;
}

export const CONTINUITY_QA_PROMPT_V1 = {
  promptId: 'continuity_qa_audit',
  version: '1.0.0',
  purpose: 'Audit shot sequence for 180-degree rule, lighting jumps, wardrobe continuity, and source story fidelity',
  systemInstruction: buildContinuityQASystemInstruction(),
  buildPrompt: (opts: {
    sourceText: string;
    shots: any[];
    storySummary?: string;
  }) => {
    return `Source Story Text:
"""
${opts.sourceText}
"""
Story Summary: ${opts.storySummary ?? 'N/A'}

Shot Sequence:
${JSON.stringify(opts.shots, null, 2)}

Please audit for narrative continuity, source fidelity, and flag any unsupported invented events.`;
  },
};
