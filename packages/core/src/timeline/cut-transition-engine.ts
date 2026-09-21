import {
  TimelineClip,
  TimelineTransition,
  TimelineTransitionType,
} from '../domain/timeline.js';

export interface TransitionValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TransitionOverlapMetrics {
  fromClipTrim: number;
  toClipTrim: number;
  blendDuration: number;
}

export class CutTransitionEngine {
  /**
   * Resolves a director's transition string into a typed TimelineTransitionType.
   */
  public static resolveTransitionType(typeStr?: string): TimelineTransitionType {
    if (!typeStr) return 'hard_cut';
    const lower = typeStr.toLowerCase();
    if (lower.includes('dissolve') || lower.includes('cross')) return 'cross_dissolve';
    if (lower.includes('whip') || lower.includes('pan')) return 'whip_pan';
    if (lower.includes('match')) return 'match_cut';
    if (lower.includes('white')) return 'fade_white';
    if (lower.includes('fade') || lower.includes('black')) return 'fade_black';
    return 'hard_cut';
  }

  /**
   * Validates whether a transition between two clips is geometrically and temporally viable.
   */
  public static validateTransition(
    transition: TimelineTransition,
    fromClip: TimelineClip,
    toClip: TimelineClip
  ): TransitionValidationResult {
    const errors: string[] = [];

    if (transition.duration < 0) {
      errors.push('Transition duration cannot be negative.');
    }

    if (transition.type === 'hard_cut' && transition.duration > 0) {
      errors.push('Hard cut must have a duration of 0 seconds.');
    }

    if (transition.duration > 0) {
      const halfDuration = transition.duration / 2;
      if (fromClip.duration < halfDuration) {
        errors.push(
          `Outgoing clip "${fromClip.clipId}" (${fromClip.duration}s) is shorter than half the transition duration (${halfDuration}s).`
        );
      }
      if (toClip.duration < halfDuration) {
        errors.push(
          `Incoming clip "${toClip.clipId}" (${toClip.duration}s) is shorter than half the transition duration (${halfDuration}s).`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculates trim and blend timing for overlapping transitions.
   */
  public static calculateTransitionOverlap(transition: TimelineTransition): TransitionOverlapMetrics {
    if (transition.type === 'hard_cut' || transition.duration === 0) {
      return {
        fromClipTrim: 0,
        toClipTrim: 0,
        blendDuration: 0,
      };
    }

    const half = transition.duration / 2;
    return {
      fromClipTrim: half,
      toClipTrim: half,
      blendDuration: transition.duration,
    };
  }

  /**
   * Generates CSS animation rules or mix curves for HTML5/web player rendering.
   */
  public static generateTransitionCss(transition: TimelineTransition): string {
    const duration = transition.duration;
    const easing = transition.easing;

    switch (transition.type) {
      case 'cross_dissolve':
        return `
          .transition-from {
            animation: fadeOut ${duration}s ${easing} forwards;
          }
          .transition-to {
            animation: fadeIn ${duration}s ${easing} forwards;
          }
          @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `.trim();

      case 'fade_black':
        return `
          .transition-overlay {
            background-color: black;
            animation: dipToColor ${duration}s ${easing} forwards;
          }
          @keyframes dipToColor {
            0% { opacity: 0; }
            50% { opacity: 1; }
            100% { opacity: 0; }
          }
        `.trim();

      case 'fade_white':
        return `
          .transition-overlay {
            background-color: white;
            animation: dipToColor ${duration}s ${easing} forwards;
          }
          @keyframes dipToColor {
            0% { opacity: 0; }
            50% { opacity: 1; }
            100% { opacity: 0; }
          }
        `.trim();

      case 'whip_pan':
        return `
          .transition-from {
            animation: whipPanOut ${duration}s ${easing} forwards;
          }
          .transition-to {
            animation: whipPanIn ${duration}s ${easing} forwards;
          }
          @keyframes whipPanOut {
            0% { transform: translateX(0); filter: blur(0px); }
            100% { transform: translateX(-100%); filter: blur(10px); }
          }
          @keyframes whipPanIn {
            0% { transform: translateX(100%); filter: blur(10px); }
            100% { transform: translateX(0); filter: blur(0px); }
          }
        `.trim();

      case 'match_cut':
      case 'hard_cut':
      default:
        return '/* Direct cut: no CSS animation required */';
    }
  }
}
