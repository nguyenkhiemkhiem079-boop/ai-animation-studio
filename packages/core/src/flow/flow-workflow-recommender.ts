import { ShotContract } from '../domain/director.js';
import {
  FlowCapability,
  FlowReferenceAsset,
  FlowFrameDescriptor,
} from './flow-types.js';

export interface WorkflowRecommenderInput {
  shot: ShotContract;
  references?: FlowReferenceAsset[];
  firstFrame?: FlowFrameDescriptor;
  lastFrame?: FlowFrameDescriptor;
  explicitWorkflow?: FlowCapability;
}

export interface WorkflowRecommendation {
  workflow: FlowCapability;
  reason: string;
  isDeterministic: boolean;
}

export class FlowWorkflowRecommender {
  /**
   * Recommends the optimal Google Flow workflow based on available assets and constraints.
   */
  public recommend(input: WorkflowRecommenderInput): WorkflowRecommendation {
    if (input.explicitWorkflow) {
      return {
        workflow: input.explicitWorkflow,
        reason: 'User explicitly selected this workflow.',
        isDeterministic: false,
      };
    }

    const hasFirstFrame = Boolean(
      (input.firstFrame?.path && input.firstFrame.path.trim().length > 0) ||
      (input.firstFrame?.uri && input.firstFrame.uri.trim().length > 0) ||
      (input.firstFrame?.assetId && input.firstFrame.assetId.trim().length > 0)
    );
    const hasLastFrame = Boolean(
      (input.lastFrame?.path && input.lastFrame.path.trim().length > 0) ||
      (input.lastFrame?.uri && input.lastFrame.uri.trim().length > 0) ||
      (input.lastFrame?.assetId && input.lastFrame.assetId.trim().length > 0)
    );

    // 1. Both First and Last frames available
    if (hasFirstFrame && hasLastFrame) {
      return {
        workflow: 'FIRST_LAST_FRAME_TO_VIDEO',
        reason: 'Both initial and concluding keyframes are available, enabling strict frame-to-frame interpolation and scene continuity.',
        isDeterministic: true,
      };
    }

    // 2. Canonical Ingredients available (Character DNA, Location anchors, or Props)
    const ingredientRefs = (input.references || []).filter(
      (r) => r.role === 'CHARACTER_IDENTITY' || r.role === 'LOCATION' || r.role === 'PROP'
    );
    if (ingredientRefs.length > 0) {
      const roles = Array.from(new Set(ingredientRefs.map((r) => r.role))).join(', ');
      return {
        workflow: 'INGREDIENTS_TO_VIDEO',
        reason: `Canonical reference ingredients [${roles}] are available for multi-image conditioning without identity drift.`,
        isDeterministic: true,
      };
    }

    // 3. First Frame available
    if (hasFirstFrame) {
      return {
        workflow: 'FIRST_FRAME_TO_VIDEO',
        reason: 'Initial starting keyframe is available, grounding motion continuation from the preceding shot.',
        isDeterministic: true,
      };
    }

    // 4. Default: Text to Video
    return {
      workflow: 'TEXT_TO_VIDEO',
      reason: 'No visual keyframes or ingredient references provided; conditioned purely on narrative and directorial text intent.',
      isDeterministic: true,
    };
  }
}
