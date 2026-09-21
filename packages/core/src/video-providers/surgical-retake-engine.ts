import {
  VideoGenerationTask,
  VideoGenerationOutput,
  SurgicalRetakeRequest,
  SurgicalRetakeResult,
} from '../domain/generative-video.js';

export class SurgicalRetakeEngine {
  /**
   * Applies surgical adjustments to a VideoGenerationTask based on a SurgicalRetakeRequest,
   * preserving reference bindings and seed locks while adjusting the targeted variable.
   */
  public createRetakeTask(
    originalTask: VideoGenerationTask,
    request: SurgicalRetakeRequest
  ): VideoGenerationTask {
    const currentRetakeCount = (originalTask.retakeLineage?.retakeCount ?? 0) + 1;

    // Determine seed: lock original seed unless seed_variation is requested
    let seed = originalTask.seed ?? 100000;
    if (request.retakeType === 'seed_variation' || !request.lockSeed) {
      seed = typeof request.variableAdjustments.seed === 'number'
        ? (request.variableAdjustments.seed as number)
        : seed + currentRetakeCount * 7919; // Deterministic prime offset
    }

    // Clone prompt packet and directives
    const updatedPromptPacket = { ...originalTask.promptPacket };
    let cameraTrajectory = originalTask.cameraTrajectory
      ? { ...originalTask.cameraTrajectory }
      : undefined;

    switch (request.retakeType) {
      case 'lighting_adjustment': {
        const adjustment =
          (request.variableAdjustments.lighting as string) ?? request.reason;
        updatedPromptPacket.lightingDirective = adjustment;
        updatedPromptPacket.positivePrompt = this.appendDirective(
          updatedPromptPacket.positivePrompt,
          `Lighting adjustment: ${adjustment}`
        );
        break;
      }

      case 'acting_intensity': {
        const adjustment =
          (request.variableAdjustments.acting as string) ?? request.reason;
        updatedPromptPacket.actingDirective = adjustment;
        updatedPromptPacket.positivePrompt = this.appendDirective(
          updatedPromptPacket.positivePrompt,
          `Performance adjustment: ${adjustment}`
        );
        break;
      }

      case 'camera_speed': {
        const speed = (request.variableAdjustments.speed as number) ?? 1.5;
        if (!cameraTrajectory) {
          cameraTrajectory = { movement: 'custom', speed, intensity: 0.5 };
        } else {
          cameraTrajectory.speed = speed;
        }
        updatedPromptPacket.cameraDirective = `Camera speed set to ${speed}x. ${request.reason}`;
        break;
      }

      case 'framing_tighten': {
        const framing =
          (request.variableAdjustments.framing as string) ?? 'tight framing on subject';
        updatedPromptPacket.cameraDirective = framing;
        updatedPromptPacket.positivePrompt = this.appendDirective(
          updatedPromptPacket.positivePrompt,
          `Framing: ${framing}`
        );
        break;
      }

      case 'seed_variation': {
        // Only seed changed
        break;
      }

      case 'environment_tweak': {
        const env =
          (request.variableAdjustments.environment as string) ?? request.reason;
        updatedPromptPacket.positivePrompt = this.appendDirective(
          updatedPromptPacket.positivePrompt,
          `Environment detail: ${env}`
        );
        break;
      }
    }

    return {
      ...originalTask,
      seed,
      cameraTrajectory,
      promptPacket: updatedPromptPacket,
      retakeLineage: {
        originalShotId: request.shotId,
        retakeCount: currentRetakeCount,
        reason: request.reason,
        retakeType: request.retakeType,
      },
    };
  }

  /**
   * Formulates a SurgicalRetakeResult summarizing the retake modifications.
   */
  public buildRetakeResult(
    newJobId: string,
    output: VideoGenerationOutput,
    request: SurgicalRetakeRequest,
    retakeCount: number,
    adjustedPrompt: string
  ): SurgicalRetakeResult {
    return {
      newJobId,
      shotId: request.shotId,
      outputAssetId: output.assetId,
      retakeCount,
      retakeType: request.retakeType,
      reason: request.reason,
      adjustedPrompt,
      usedSeed: output.seed,
      actualCostUsd: output.actualCostUsd,
    };
  }

  private appendDirective(prompt: string, directive: string): string {
    if (prompt.includes(directive)) return prompt;
    return `${prompt}. [RETAKE: ${directive}]`;
  }
}
