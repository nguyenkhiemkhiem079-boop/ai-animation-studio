/**
 * CreditAwarePlanner
 *
 * Classifies shots prior to Google Flow browser execution:
 *   - FLOW_REQUIRED: Complex characters, cinematic acting, dynamic photoreal cameras
 *   - LOCAL_PREFERRED: Title cards, credits, diagrams, simple motion/typography
 *   - LOCAL_ONLY: Deterministic HTML/HyperFrames renders, static graphics, zero credit cost
 *
 * Minimizes Flow credit expenditure by routing local-capable scenes to local renderers.
 */

import { ShotContract } from '../domain/director.js';

export type CreditClassification = 'FLOW_REQUIRED' | 'LOCAL_PREFERRED' | 'LOCAL_ONLY';

export interface ShotCreditPlan {
  shotId: string;
  classification: CreditClassification;
  reason: string;
  estimatedFlowCredits: number;
}

export interface CreditAwarePlan {
  flowRequiredCount: number;
  localPreferredCount: number;
  localOnlyCount: number;
  totalEstimatedFlowCredits: number;
  shotPlans: ShotCreditPlan[];
}

export class CreditAwarePlanner {
  private static readonly LOCAL_KEYWORDS = [
    'title card',
    'title',
    'credits',
    'end credits',
    'chart',
    'diagram',
    'ui animation',
    'simple typography',
    'infographic',
    'lower third',
    'logo',
    'text card',
    'intertitle',
    'splash screen',
  ];

  /**
   * Plans and classifies a list of shot contracts into credit routing buckets.
   */
  public static plan(shots: ShotContract[]): CreditAwarePlan {
    const shotPlans: ShotCreditPlan[] = [];
    let flowRequiredCount = 0;
    let localPreferredCount = 0;
    let localOnlyCount = 0;
    let totalEstimatedFlowCredits = 0;

    for (const shot of shots) {
      const plan = this.classifyShot(shot);
      shotPlans.push(plan);

      if (plan.classification === 'FLOW_REQUIRED') {
        flowRequiredCount++;
        totalEstimatedFlowCredits += plan.estimatedFlowCredits;
      } else if (plan.classification === 'LOCAL_PREFERRED') {
        localPreferredCount++;
      } else {
        localOnlyCount++;
      }
    }

    return {
      flowRequiredCount,
      localPreferredCount,
      localOnlyCount,
      totalEstimatedFlowCredits,
      shotPlans,
    };
  }

  /**
   * Classify a single shot contract.
   */
  public static classifyShot(shot: ShotContract): ShotCreditPlan {
    const promptText = (
      (shot as any).promptPacket?.positivePrompt ||
      (shot as any).prompt ||
      shot.acting?.[0]?.actionPrompt ||
      ''
    ).toLowerCase();

    // 1. Explicit deterministic renderer intent
    if (shot.rendererIntent === 'deterministic_hyperframes' || shot.rendererIntent === 'deterministic_rigged_2d') {
      return {
        shotId: shot.id,
        classification: 'LOCAL_ONLY',
        reason: `Explicit local renderer intent: ${shot.rendererIntent}`,
        estimatedFlowCredits: 0,
      };
    }

    // 2. Keyword detection for local graphics / typography
    const matchedLocalKeyword = this.LOCAL_KEYWORDS.find((kw) => promptText.includes(kw));
    if (matchedLocalKeyword) {
      return {
        shotId: shot.id,
        classification: 'LOCAL_PREFERRED',
        reason: `Matches local graphic/text pattern: "${matchedLocalKeyword}"`,
        estimatedFlowCredits: 0,
      };
    }

    // 3. Static or transition shots with no acting characters
    if (
      (shot.purpose === 'transition' || shot.complexity === 'static') &&
      (!shot.acting || shot.acting.length === 0)
    ) {
      return {
        shotId: shot.id,
        classification: 'LOCAL_PREFERRED',
        reason: 'Static/transition shot without active character performance',
        estimatedFlowCredits: 0,
      };
    }

    // 4. Everything requiring character performance or generative video
    return {
      shotId: shot.id,
      classification: 'FLOW_REQUIRED',
      reason: 'Cinematic character acting or complex environment requiring generative video',
      estimatedFlowCredits: 1,
    };
  }
}
