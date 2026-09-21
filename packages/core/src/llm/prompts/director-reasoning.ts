import { z } from 'zod';

export const DIRECTOR_REASONING_PROMPT_VERSION = 'v1.0.0';

export const DirectorReasoningOutputSchema = z.object({
  shots: z.array(
    z.object({
      shotNumber: z.number().int().positive(),
      purpose: z.string(),
      shotSize: z.string().optional(),
      angle: z.string().optional(),
      movement: z.string().optional(),
      semanticSkills: z.array(z.string()).default([]),
      compositionRule: z.string().optional(),
      lightingMood: z.string().optional(),
      reason: z.string().optional(),
    })
  ).default([]),
});

export type DirectorReasoningOutput = z.infer<typeof DirectorReasoningOutputSchema>;

export interface DirectorReasoningPromptOptions {
  sceneDescription: string;
  characters: string[];
  location: string;
  lockedFraming?: boolean;
  lockedLighting?: boolean;
  lockedRenderer?: boolean;
}

export function buildDirectorReasoningSystemInstruction(): string {
  return `You are the AI Animation Studio Director Reasoning Engine.
Your responsibility is to analyze a scene and propose cinematic shot specifications (ShotContracts) to maximize narrative impact, emotional resonance, and visual staging.

CINEMATIC RULES:
1. Propose shot purpose: establishing, dialogue_coverage, action, reaction, transition, insert.
2. Propose camera framing: wide, extreme_wide, medium, medium_close_up, close_up, extreme_close_up.
3. Propose camera angle: eye_level, low_angle, high_angle, dutch_angle, birds_eye, worms_eye.
4. Propose camera motion: static, push_in, pull_out, pan_left, pan_right, tilt_up, tilt_down, orbit, tracking.
5. Propose semantic cinematic skills from the standard vocabulary: e.g. /pushin, /pullout, /orbit, /closeup, /lowangle, /tracking, /drone, /wideangle, /handheld.
6. User locks always override AI proposals.
7. Output must strictly adhere to the requested JSON schema.`;
}

export function buildDirectorReasoningUserPrompt(options: DirectorReasoningPromptOptions): string {
  return `Scene Description:
"""
${options.sceneDescription}
"""

Location: ${options.location}
Characters present: ${options.characters.join(', ') || 'None'}
Director Locks: framing=${options.lockedFraming ?? false}, lighting=${options.lockedLighting ?? false}, renderer=${options.lockedRenderer ?? false}

Please propose the cinematic shot breakdown and camera choreography.`;
}

export const DIRECTOR_REASONING_PROMPT_V1 = {
  promptId: 'director_reasoning_shots',
  version: '1.0.0',
  purpose: 'Reason about cinematic camera placement, focal length, angle, and motion for a scene',
  systemInstruction: buildDirectorReasoningSystemInstruction(),
  buildPrompt: (opts: {
    sceneHeading: string;
    sceneBeats: string[];
    charactersPresent: string[];
    baseShots: any[];
    universeContext?: string;
  }) => {
    let prompt = `Scene Heading: ${opts.sceneHeading}
Characters Present: ${opts.charactersPresent.join(', ') || 'None'}

Beats:
${opts.sceneBeats.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Base Shots to Refine:
${JSON.stringify(opts.baseShots, null, 2)}`;

    if (opts.universeContext) {
      prompt += `\n\nUniverse Context:\n${opts.universeContext}`;
    }

    return prompt;
  },
};
