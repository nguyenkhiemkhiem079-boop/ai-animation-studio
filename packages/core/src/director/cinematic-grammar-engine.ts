/**
 * CinematicGrammarEngine: Enforces continuity rules (180-degree rule, eyeline matching),
 * repetition detection, and shot rhythm analysis.
 */

import {
  ShotContract,
  ShotRhythm,
  ShotRhythmSchema,
  SequenceState,
  DirectorProfile,
} from '../domain/director.js';

export class CinematicGrammarEngine {
  /**
   * Tracks and updates sequence continuity state (eyeline vectors, recent skills, durations).
   */
  public static updateSequenceState(
    previousState: SequenceState,
    newShot: ShotContract
  ): SequenceState {
    const activeEyeline = newShot.acting[0]?.gazeDirection === 'screen_left' ? 'screen_left' : 'screen_right';
    const recentSkills = [...previousState.recentSkillsUsed];

    if (newShot.camera.semanticSkills.length > 0) {
      recentSkills.push(...newShot.camera.semanticSkills);
      if (recentSkills.length > 10) {
        recentSkills.splice(0, recentSkills.length - 10);
      }
    }

    return {
      currentShotIndex: previousState.currentShotIndex + 1,
      cumulativeDurationSeconds: previousState.cumulativeDurationSeconds + newShot.frame.durationSeconds,
      activeEyelineVector: activeEyeline,
      lastShotSize: newShot.camera.shotSize,
      lastCameraAngle: newShot.camera.angle,
      lastSpeakingCharacter: newShot.acting.find((a) => a.dialogueLine)?.characterId,
      recentSkillsUsed: recentSkills,
    };
  }

  /**
   * Detects excessive consecutive repetition of identical skills or framing.
   */
  public static detectRepetitions(shots: ShotContract[]): {
    skillOrSize: string;
    consecutiveCount: number;
    shotIds: string[];
  }[] {
    const warnings: { skillOrSize: string; consecutiveCount: number; shotIds: string[] }[] = [];
    if (shots.length < 3) return warnings;

    // Check shot size repetition
    let sizeStreak = 1;
    let currentSize = shots[0].camera.shotSize;
    let sizeShotIds = [shots[0].id];

    for (let i = 1; i < shots.length; i++) {
      if (shots[i].camera.shotSize === currentSize) {
        sizeStreak++;
        sizeShotIds.push(shots[i].id);
        if (sizeStreak >= 3 && (i === shots.length - 1 || shots[i + 1].camera.shotSize !== currentSize)) {
          warnings.push({
            skillOrSize: `shotSize:${currentSize}`,
            consecutiveCount: sizeStreak,
            shotIds: [...sizeShotIds],
          });
        }
      } else {
        sizeStreak = 1;
        currentSize = shots[i].camera.shotSize;
        sizeShotIds = [shots[i].id];
      }
    }

    // Check semantic skill repetition
    let skillStreak = 1;
    let currentSkill = shots[0].camera.semanticSkills[0];
    let skillShotIds = [shots[0].id];

    for (let i = 1; i < shots.length; i++) {
      const skill = shots[i].camera.semanticSkills[0];
      if (skill && skill === currentSkill) {
        skillStreak++;
        skillShotIds.push(shots[i].id);
        if (skillStreak >= 3 && (i === shots.length - 1 || shots[i + 1].camera.semanticSkills[0] !== currentSkill)) {
          warnings.push({
            skillOrSize: `skill:${currentSkill}`,
            consecutiveCount: skillStreak,
            shotIds: [...skillShotIds],
          });
        }
      } else {
        skillStreak = 1;
        currentSkill = skill;
        skillShotIds = [shots[i].id];
      }
    }

    return warnings;
  }

  /**
   * Calculates overall shot rhythm and pacing curve.
   */
  public static calculateRhythm(shots: ShotContract[], profile: DirectorProfile): ShotRhythm {
    const shotCount = shots.length;
    if (shotCount === 0) {
      return ShotRhythmSchema.parse({
        totalDurationSeconds: 0,
        averageShotDurationSeconds: 0,
        pacingCurve: profile.pacingPreference,
        shotCount: 0,
      });
    }

    const totalDurationSeconds = shots.reduce((acc, s) => acc + s.frame.durationSeconds, 0);
    const averageShotDurationSeconds = Number((totalDurationSeconds / shotCount).toFixed(2));

    let pacingCurve: ShotRhythm['pacingCurve'] = profile.pacingPreference;
    if (averageShotDurationSeconds > 6) {
      pacingCurve = 'slow_cinema';
    } else if (averageShotDurationSeconds >= 3) {
      pacingCurve = 'deliberate';
    } else if (averageShotDurationSeconds >= 1.5) {
      pacingCurve = 'dynamic';
    } else {
      pacingCurve = 'frenetic';
    }

    return ShotRhythmSchema.parse({
      totalDurationSeconds: Number(totalDurationSeconds.toFixed(2)),
      averageShotDurationSeconds,
      pacingCurve,
      shotCount,
    });
  }
}
