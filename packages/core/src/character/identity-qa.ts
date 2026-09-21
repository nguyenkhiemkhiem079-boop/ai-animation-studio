import {
  AssetDescriptor,
  IdentityLock,
  IdentityQAResult,
  IdentityQAResultSchema,
} from '../domain/asset.js';
import { CharacterDNA } from '../domain/universe.js';

export interface IdentityQAEvaluationOptions {
  simulatedScore?: number;
  simulatedAnatomyPass?: boolean;
  simulatedPaletteScore?: number;
}

export class IdentityQAEvaluator {
  public static evaluate(
    candidate: AssetDescriptor,
    character: CharacterDNA,
    identityLock: IdentityLock,
    options: IdentityQAEvaluationOptions = {}
  ): IdentityQAResult {
    const critique: string[] = [];
    const threshold = identityLock.confidenceThreshold ?? 0.85;

    // 1. Calculate similarity score
    // In local/mock mode, if simulatedScore is provided, use it; otherwise compute based on metadata/anchors
    let similarityScore: number;
    if (options.simulatedScore !== undefined) {
      similarityScore = Math.max(0, Math.min(1, options.simulatedScore));
    } else {
      // Deterministic baseline evaluation from candidate tags & anchor prompts
      const hasIdentityTag = candidate.tags.some(
        (t) => t.toLowerCase() === character.id.toLowerCase() || t.toLowerCase() === character.name.toLowerCase()
      );
      const isCandidateForChar = candidate.entityId === character.id;
      similarityScore = isCandidateForChar ? (hasIdentityTag ? 0.92 : 0.88) : 0.45;
    }

    const facialDriftDetected = similarityScore < threshold;
    if (facialDriftDetected) {
      critique.push(
        `Facial similarity score (${similarityScore.toFixed(2)}) is below confidence threshold (${threshold.toFixed(2)}). Identity drift detected.`
      );
    }

    // 2. Palette Adherence
    const paletteAdherenceScore = options.simulatedPaletteScore !== undefined
      ? Math.max(0, Math.min(1, options.simulatedPaletteScore))
      : 0.90;
    if (paletteAdherenceScore < 0.7) {
      critique.push(
        `Color palette adherence score (${paletteAdherenceScore.toFixed(2)}) is below acceptable baseline (0.70). Costume or lighting colors deviate from character Bible.`
      );
    }

    // 3. Anatomy Check
    const anatomyCheckPassed = options.simulatedAnatomyPass !== undefined
      ? options.simulatedAnatomyPass
      : !candidate.tags.includes('corrupted_anatomy');
    if (!anatomyCheckPassed) {
      critique.push('Anatomical defect or facial warping detected in candidate asset.');
    }

    const passed = !facialDriftDetected && anatomyCheckPassed && paletteAdherenceScore >= 0.7;

    return IdentityQAResultSchema.parse({
      assetId: candidate.id,
      characterId: character.id,
      passed,
      similarityScore,
      confidenceThreshold: threshold,
      facialDriftDetected,
      paletteAdherenceScore,
      anatomyCheckPassed,
      critique,
      evaluatedAt: new Date().toISOString(),
    });
  }
}
