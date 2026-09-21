/**
 * LLMDirectorAssistant: Integrates LLM reasoning (such as Gemini) into Director planning.
 * Crucial Rule: User directorLocks strictly take precedence and CANNOT be overridden.
 * Output ShotContracts remain 100% provider-neutral.
 */

import { ShotContract, ShotContractSchema } from '../domain/director.js';
import { SceneCandidate } from '../domain/story.js';
import { LLMProvider } from '../llm/llm-provider.js';
import {
  DIRECTOR_REASONING_PROMPT_V1,
  DirectorReasoningOutputSchema,
  DirectorReasoningOutput,
} from '../llm/prompts/director-reasoning.js';

export interface DirectAssistantOptions {
  scene: SceneCandidate;
  baseShots: ShotContract[];
  universeContext?: {
    seriesId?: string;
    characterDnaSummary?: string;
    worldBibleSummary?: string;
  };
}

export class LLMDirectorAssistant {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  /**
   * Refines shot plans using LLM reasoning while strictly respecting user locks.
   */
  public async refineShots(options: DirectAssistantOptions): Promise<ShotContract[]> {
    const { scene, baseShots, universeContext } = options;

    const baseShotsSummary = baseShots.map((s) => ({
      shotNumber: s.shotNumber,
      purpose: s.purpose,
      currentShotSize: s.camera.shotSize,
      currentAngle: s.camera.angle,
      currentMovement: s.camera.movement,
      dialogue: s.acting.find((a) => a.dialogueLine)?.dialogueLine,
      locks: s.directorLocks,
    }));

    const result = await this.llm.generateStructured<DirectorReasoningOutput>({
      taskType: 'DIRECTOR_REASONING',
      systemInstruction: DIRECTOR_REASONING_PROMPT_V1.systemInstruction,
      prompt: DIRECTOR_REASONING_PROMPT_V1.buildPrompt({
        sceneHeading: scene.heading,
        sceneBeats: scene.beats.map((b) => b.summary),
        charactersPresent: scene.charactersPresent,
        baseShots: baseShotsSummary,
        universeContext: universeContext?.characterDnaSummary || universeContext?.worldBibleSummary
          ? `Series: ${universeContext?.seriesId ?? 'default'}\nCharacter DNA: ${universeContext?.characterDnaSummary ?? 'none'}\nWorld Bible: ${universeContext?.worldBibleSummary ?? 'none'}`
          : undefined,
      }),
      responseSchema: DirectorReasoningOutputSchema,
      schemaName: 'DirectorReasoningOutput',
      seriesId: universeContext?.seriesId,
      metadata: {
        promptVersion: DIRECTOR_REASONING_PROMPT_V1.version,
      },
    });

    const suggestions = result.data.shots;
    const refinedShots: ShotContract[] = [];

    for (const baseShot of baseShots) {
      const suggestion = suggestions.find((s) => s.shotNumber === baseShot.shotNumber);
      if (!suggestion) {
        refinedShots.push(baseShot);
        continue;
      }

      // Clone base shot for safe mutation
      const refined: ShotContract = JSON.parse(JSON.stringify(baseShot));
      const locks = refined.directorLocks || {
        isCameraLocked: false,
        isFramingLocked: false,
        isRendererLocked: false,
        isActingLocked: false,
      };

      // 1. Camera adjustments (Respect isCameraLocked)
      if (!locks.isCameraLocked) {
        if (suggestion.shotSize) refined.camera.shotSize = suggestion.shotSize as any;
        if (suggestion.angle) refined.camera.angle = suggestion.angle as any;
        if (suggestion.movement) refined.camera.movement = suggestion.movement;
        if (suggestion.semanticSkills && suggestion.semanticSkills.length > 0) {
          refined.camera.semanticSkills = suggestion.semanticSkills;
        }
      }

      // 2. Composition adjustments (Respect isFramingLocked)
      if (!locks.isFramingLocked) {
        if (suggestion.compositionRule) {
          refined.composition.rule = suggestion.compositionRule as any;
        }
      }

      // 3. Lighting adjustments (Respect isFramingLocked or lighting continuity)
      if (!locks.isFramingLocked && suggestion.lightingMood) {
        refined.lighting.mood = suggestion.lightingMood;
      }

      // Update provenance
      refined.provenance = {
        ...refined.provenance,
        ruleApplied: `${refined.provenance.ruleApplied ?? 'Base'}+LLMDirectorAssistant[${this.llm.metadata.name}]`,
        decidedAt: new Date().toISOString(),
      };

      // Validate through domain schema to ensure 100% provider neutrality
      const validated = ShotContractSchema.parse(refined);
      refinedShots.push(validated);
    }

    return refinedShots;
  }
}
