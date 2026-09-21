import { MouthShape } from '../domain/character-animation.js';

export interface TimedViseme {
  timeSeconds: number;
  mouthShape: MouthShape;
}

export class LipSyncEngine {
  public generateVisemes(dialogueText: string, durationSeconds: number): TimedViseme[] {
    const cleanText = dialogueText.trim().toLowerCase();
    if (!cleanText || durationSeconds <= 0) {
      return [{ timeSeconds: 0, mouthShape: 'rest' }];
    }

    const visemes: TimedViseme[] = [];
    const tokens = cleanText.split('');
    const step = durationSeconds / Math.max(tokens.length, 1);

    for (let i = 0; i < tokens.length; i++) {
      const char = tokens[i];
      const time = Number((i * step).toFixed(3));
      const mouthShape = this.charToMouthShape(char);

      // Only add if different from previous or if transition needed
      if (visemes.length === 0 || visemes[visemes.length - 1].mouthShape !== mouthShape) {
        visemes.push({ timeSeconds: time, mouthShape });
      }
    }

    // Ensure it finishes at rest
    visemes.push({ timeSeconds: durationSeconds, mouthShape: 'rest' });
    return visemes;
  }

  public sampleMouthShape(visemes: TimedViseme[], timeSeconds: number): MouthShape {
    if (!visemes || visemes.length === 0) return 'rest';

    // Find the latest viseme whose time is <= timeSeconds
    let activeShape: MouthShape = 'rest';
    for (const v of visemes) {
      if (v.timeSeconds <= timeSeconds) {
        activeShape = v.mouthShape;
      } else {
        break;
      }
    }

    return activeShape;
  }

  private charToMouthShape(char: string): MouthShape {
    switch (char) {
      case 'a':
        return 'A';
      case 'e':
      case 'i':
      case 'y':
        return 'E';
      case 'o':
        return 'O';
      case 'u':
        return 'U';
      case 'm':
      case 'b':
      case 'p':
        return 'M';
      case 'f':
      case 'v':
        return 'FV';
      case 'w':
      case 'q':
        return 'WQ';
      case 'l':
      case 'd':
      case 't':
      case 'n':
      case 's':
      case 'z':
      case 'r':
      case 'c':
      case 'k':
      case 'g':
      case 'j':
        return 'L';
      default:
        return 'rest';
    }
  }
}
