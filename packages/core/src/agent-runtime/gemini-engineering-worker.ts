/**
 * Gemini Engineering Worker (Fallback Coding & Reasoning Assistant)
 *
 * Activated strictly when PRIMARY_AGENT_QUOTA is exhausted to maintain
 * autonomous mission continuity.
 *
 * Rules:
 *  - Uses existing configured GEMINI_API_KEY (never logged, printed, or exposed)
 *  - FREE_ONLY cost mode (ALLOW_PAID_VIDEO_API=false, never routes to paid video)
 *  - Model selection with fallback (gemini-2.5-pro -> gemini-2.5-flash)
 *  - Advisory output: requires write, typecheck, test, and build before claim of success
 */

import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { EngineeringOwner } from './long-run-manifest.js';

export const EngineeringTaskPacketSchema = z.object({
  missionId: z.string().default('long-run-production-completion'),
  currentPhase: z.string(),
  repositoryHead: z.string(),
  objective: z.string(),
  relevantFiles: z.array(z.string()).default([]),
  knownFailures: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  forbiddenChanges: z.array(z.string()).default([]),
  testCommands: z.array(z.string()).default([]),
  nextExactAction: z.string(),
});

export type EngineeringTaskPacket = z.infer<typeof EngineeringTaskPacketSchema>;

export interface FileModificationProposal {
  targetPath: string;
  description: string;
  patchContent: string;
}

export interface EngineeringProposal {
  modelUsed: string;
  summary: string;
  proposals: FileModificationProposal[];
  recommendedCommands: string[];
  advisoryNotes: string[];
  isAdvisory: true;
}

export class GeminiEngineeringWorker {
  private client: GoogleGenAI | null = null;
  private readonly defaultModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (key && key.trim().length > 0) {
      this.client = new GoogleGenAI({ apiKey: key.trim() });
    }
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  public async evaluateTask(
    packet: EngineeringTaskPacket,
    options: { preferredModel?: string; fileSnippets?: Record<string, string> } = {}
  ): Promise<EngineeringProposal> {
    if (!this.client) {
      throw new Error('[GEMINI_NOT_CONFIGURED] GEMINI_API_KEY is not configured for fallback engineering worker.');
    }

    const candidateModels = [
      ...(options.preferredModel ? [options.preferredModel] : []),
      ...this.defaultModels,
    ];

    const systemPrompt = `You are the Fallback Engineering Worker for AI Animation Studio.
Your role is focused technical assistance: analyze errors, propose surgical code fixes, and ensure test passes.
STRICT RULES:
1. VIDEO_COST_MODE=FREE_ONLY. NEVER suggest or enable paid video generation APIs.
2. Provide precise, minimal code modifications.
3. Your proposal is ADVISORY and will be validated through TypeScript compilation and Vitest.
4. Output structured JSON adhering to the specified schema.`;

    const userPrompt = `TASK OBJECTIVE:
${packet.objective}

CURRENT PHASE: ${packet.currentPhase}
REPOSITORY HEAD: ${packet.repositoryHead}
NEXT EXACT ACTION: ${packet.nextExactAction}

ACCEPTANCE CRITERIA:
${packet.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}

FORBIDDEN CHANGES:
${packet.forbiddenChanges.map((f) => `- ${f}`).join('\n')}

KNOWN FAILURES:
${packet.knownFailures.map((k) => `- ${k}`).join('\n')}

FILE SNIPPETS:
${JSON.stringify(options.fileSnippets || {}, null, 2)}

Respond with a JSON object:
{
  "summary": "Short technical diagnosis and approach",
  "proposals": [
    {
      "targetPath": "relative file path",
      "description": "what this edit fixes",
      "patchContent": "complete replacement block or file content"
    }
  ],
  "recommendedCommands": ["commands to run for testing"],
  "advisoryNotes": ["notes on potential edge cases"]
}`;

    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const response = await this.client.models.generateContent({
          model,
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
          ],
        });

        const rawText = response.text || '';
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, rawText];
        const jsonStr = jsonMatch[1] ? jsonMatch[1].trim() : rawText.trim();
        const parsed = JSON.parse(jsonStr);

        return {
          modelUsed: model,
          summary: parsed.summary || 'Engineering proposal generated',
          proposals: parsed.proposals || [],
          recommendedCommands: parsed.recommendedCommands || packet.testCommands,
          advisoryNotes: parsed.advisoryNotes || [],
          isAdvisory: true,
        };
      } catch (err: any) {
        lastError = err;
        // If quota exhausted on this model, try next model in candidate list
        continue;
      }
    }

    throw new Error(
      `[GEMINI_ENGINEERING_EXHAUSTED] All candidate Gemini fallback models failed: ${lastError?.message || String(lastError)}`
    );
  }
}
