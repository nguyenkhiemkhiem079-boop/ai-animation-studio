import { z } from 'zod';

export const STORY_ANALYSIS_PROMPT_VERSION = 'v1.0.0';

export const StoryAnalysisExtractionSchema = z.object({
  summary: z.string(),
  characters: z.array(
    z.object({
      suggestedName: z.string(),
      traits: z.array(z.string()).default([]),
      dialogueSample: z.string().optional(),
    })
  ).default([]),
  locations: z.array(
    z.object({
      suggestedName: z.string(),
      description: z.string(),
      zones: z.array(z.string()).default([]),
    })
  ).default([]),
  props: z.array(
    z.object({
      suggestedName: z.string(),
      visualDescription: z.string(),
    })
  ).default([]),
  scenes: z.array(
    z.object({
      sceneNumber: z.number().int().positive(),
      heading: z.string(),
      timeOfDay: z.enum(['day', 'night', 'dawn', 'dusk', 'continuous', 'unspecified']).default('unspecified'),
      locationName: z.string(),
      charactersPresent: z.array(z.string()).default([]),
      beats: z.array(
        z.object({
          summary: z.string(),
          involvedCharacters: z.array(z.string()).default([]),
        })
      ).default([]),
      dialogueLines: z.array(
        z.object({
          speaker: z.string(),
          line: z.string(),
        })
      ).default([]),
      narrationLines: z.array(z.string()).default([]),
    })
  ).default([]),
});

export type StoryAnalysisExtraction = z.infer<typeof StoryAnalysisExtractionSchema>;

export interface StoryAnalysisPromptOptions {
  rawContent: string;
  title?: string;
  preserveMeaning?: boolean;
  preserveFacts?: boolean;
}

export function buildStoryAnalysisSystemInstruction(): string {
  return `You are the AI Animation Studio Narrative Intelligence Engine.
Your responsibility is to analyze screenplay and prose stories into structured scene breakdowns, narrative beats, and candidate universe entities (characters, locations, props).

CRITICAL SOURCE PRESERVATION RULES (NON-NEGOTIABLE):
1. PRESERVE ORIGINAL MEANING & FACTS STRICTLY (preserve_meaning = STRICT, preserve_facts = STRICT).
2. DO NOT REWRITE OR MUTATE DIALOGUE (dialogue.rewrite = false).
3. DO NOT INVENT OR INTRODUCE UNSUPPORTED STORY EVENTS (allow_add_story_events = false).
4. DO NOT REMOVE STORY FACTS OR CHARACTERS (allow_remove_content = false).
5. DO NOT INVENT GHOSTS, MONSTERS, WEAPONS, OR ACTIONS NOT IN THE SOURCE TEXT.
6. YOU MAY split scenes, identify narrative beats, extract visual staging, and infer emotional tone.

Output must strictly adhere to the requested JSON schema without any surrounding markdown commentary.`;
}

export function buildStoryAnalysisUserPrompt(options: StoryAnalysisPromptOptions): string {
  return `Title: ${options.title ?? 'Untitled Screenplay'}

Source Content: ${options.rawContent}

Source Text:
"""
${options.rawContent}
"""

Please extract all scene candidates, narrative beats, character candidates, location candidates, and prop candidates strictly following the source text.`;
}

export const STORY_ANALYSIS_PROMPT_V1 = {
  promptId: 'story_analysis_extraction',
  version: '1.0.0',
  purpose: 'Extract scene breakdowns, beats, characters, locations, props from source document preserving original meaning strictly',
  systemInstruction: buildStoryAnalysisSystemInstruction(),
  buildPrompt: (opts: { title?: string; rawContent: string; universeContext?: string }) => {
    let prompt = buildStoryAnalysisUserPrompt({ title: opts.title, rawContent: opts.rawContent });
    if (opts.universeContext) {
      prompt += `\n\nUniverse Context:\n${opts.universeContext}`;
    }
    return prompt;
  },
};
