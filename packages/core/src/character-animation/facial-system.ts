import {
  FacialState,
  EyeDirection,
  BlinkState,
  MouthShape,
} from '../domain/character-animation.js';

export class FacialSystem {
  public computeFacialState(
    timeSeconds: number,
    expression: string = 'neutral',
    eyeDirection: EyeDirection = 'direct_to_camera',
    mouthShape: MouthShape = 'rest',
    eyebrowState: 'neutral' | 'raised' | 'furrowed' = 'neutral'
  ): FacialState {
    const blinkState = this.computeBlinkState(timeSeconds);

    return {
      expression,
      eyeDirection,
      blinkState,
      mouthShape,
      eyebrowState,
    };
  }

  public computeBlinkState(timeSeconds: number): BlinkState {
    // Natural blink happens every 3.0 seconds and lasts 0.15 seconds
    const cycleLength = 3.0;
    const timeInCycle = timeSeconds % cycleLength;

    const blinkStart = 2.85;
    if (timeInCycle >= blinkStart && timeInCycle < blinkStart + 0.05) {
      return 'half';
    } else if (timeInCycle >= blinkStart + 0.05 && timeInCycle < blinkStart + 0.10) {
      return 'closed';
    } else if (timeInCycle >= blinkStart + 0.10 && timeInCycle < blinkStart + 0.15) {
      return 'half';
    }

    return 'open';
  }
}
