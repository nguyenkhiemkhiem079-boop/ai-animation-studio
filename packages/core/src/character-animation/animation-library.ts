import {
  AnimationClip,
  BoneName,
  BoneTransform,
  RigKeyframe,
} from '../domain/character-animation.js';

export class CharacterAnimationLibrary {
  private clips = new Map<string, AnimationClip>();

  constructor(initialClips: AnimationClip[] = []) {
    for (const clip of initialClips) {
      this.registerClip(clip);
    }
  }

  public static createDefault(): CharacterAnimationLibrary {
    const lib = new CharacterAnimationLibrary();

    // 1. Idle (2.0s breathing loop)
    lib.registerClip(createIdleClip());

    // 2. Walk (1.0s locomotion cycle)
    lib.registerClip(createWalkClip());

    // 3. Run (0.6s locomotion cycle)
    lib.registerClip(createRunClip());

    // 4. Sit
    lib.registerClip(createSitClip());

    // 5. Stand
    lib.registerClip(createStandClip());

    // 6. Turn
    lib.registerClip(createTurnClip());

    // 7. Look
    lib.registerClip(createLookClip());

    // 8. Point
    lib.registerClip(createPointClip());

    // 9. Wave
    lib.registerClip(createWaveClip());

    // 10. Pick Up
    lib.registerClip(createPickUpClip());

    // 11. Hold
    lib.registerClip(createHoldClip());

    // 12. React (flinch/alert)
    lib.registerClip(createReactClip());

    // 13. Fear
    lib.registerClip(createFearClip());

    // 14. Surprise
    lib.registerClip(createSurpriseClip());

    return lib;
  }

  public registerClip(clip: AnimationClip): void {
    this.clips.set(clip.name.toLowerCase(), clip);
  }

  public getClip(name: string): AnimationClip | undefined {
    return this.clips.get(name.toLowerCase());
  }

  public listClips(): AnimationClip[] {
    return Array.from(this.clips.values());
  }
}

// Helpers for authoring standard clips
function identityTransforms(): Record<BoneName, BoneTransform> {
  const bones: BoneName[] = [
    'head', 'neck', 'torso', 'upper_arm_L', 'upper_arm_R',
    'lower_arm_L', 'lower_arm_R', 'hand_L', 'hand_R',
    'upper_leg_L', 'upper_leg_R', 'lower_leg_L', 'lower_leg_R',
    'foot_L', 'foot_R',
  ];
  const map: Partial<Record<BoneName, BoneTransform>> = {};
  for (const b of bones) {
    map[b] = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  }
  return map as Record<BoneName, BoneTransform>;
}

function createIdleClip(): AnimationClip {
  const kf0: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: { ...identityTransforms(), torso: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
  };
  const kf1: RigKeyframe = {
    timeSeconds: 1.0,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: -2, rotation: 0.5, scaleX: 1.01, scaleY: 1.02 },
      upper_arm_L: { x: 0, y: 0, rotation: 3, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: -3, scaleX: 1, scaleY: 1 },
      head: { x: 0, y: 0, rotation: -1, scaleX: 1, scaleY: 1 },
    },
  };
  const kf2: RigKeyframe = {
    timeSeconds: 2.0,
    boneTransforms: { ...identityTransforms() },
  };

  return { name: 'idle', durationSeconds: 2.0, fps: 24, loop: true, keyframes: [kf0, kf1, kf2] };
}

function createWalkClip(): AnimationClip {
  const kf0: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: {
      ...identityTransforms(),
      upper_leg_L: { x: 0, y: 0, rotation: 25, scaleX: 1, scaleY: 1 },
      lower_leg_L: { x: 0, y: 0, rotation: -15, scaleX: 1, scaleY: 1 },
      upper_leg_R: { x: 0, y: 0, rotation: -25, scaleX: 1, scaleY: 1 },
      lower_leg_R: { x: 0, y: 0, rotation: 10, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: -20, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: 20, scaleX: 1, scaleY: 1 },
    },
  };
  const kf1: RigKeyframe = {
    timeSeconds: 0.5,
    boneTransforms: {
      ...identityTransforms(),
      upper_leg_L: { x: 0, y: 0, rotation: -25, scaleX: 1, scaleY: 1 },
      lower_leg_L: { x: 0, y: 0, rotation: 10, scaleX: 1, scaleY: 1 },
      upper_leg_R: { x: 0, y: 0, rotation: 25, scaleX: 1, scaleY: 1 },
      lower_leg_R: { x: 0, y: 0, rotation: -15, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: 20, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: -20, scaleX: 1, scaleY: 1 },
    },
  };
  const kf2: RigKeyframe = {
    timeSeconds: 1.0,
    boneTransforms: { ...kf0.boneTransforms },
  };

  return { name: 'walk', durationSeconds: 1.0, fps: 24, loop: true, keyframes: [kf0, kf1, kf2] };
}

function createRunClip(): AnimationClip {
  const kf0: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: 5, rotation: 12, scaleX: 1, scaleY: 1 },
      upper_leg_L: { x: 0, y: 0, rotation: 45, scaleX: 1, scaleY: 1 },
      lower_leg_L: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
      upper_leg_R: { x: 0, y: 0, rotation: -45, scaleX: 1, scaleY: 1 },
      lower_leg_R: { x: 0, y: 0, rotation: 30, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: 40, scaleX: 1, scaleY: 1 },
    },
  };
  const kf1: RigKeyframe = {
    timeSeconds: 0.3,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: -5, rotation: 10, scaleX: 1, scaleY: 1 },
      upper_leg_L: { x: 0, y: 0, rotation: -45, scaleX: 1, scaleY: 1 },
      lower_leg_L: { x: 0, y: 0, rotation: 30, scaleX: 1, scaleY: 1 },
      upper_leg_R: { x: 0, y: 0, rotation: 45, scaleX: 1, scaleY: 1 },
      lower_leg_R: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: 40, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
    },
  };
  const kf2: RigKeyframe = {
    timeSeconds: 0.6,
    boneTransforms: { ...kf0.boneTransforms },
  };

  return { name: 'run', durationSeconds: 0.6, fps: 24, loop: true, keyframes: [kf0, kf1, kf2] };
}

function createSitClip(): AnimationClip {
  const kf: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: 40, rotation: 2, scaleX: 1, scaleY: 1 },
      upper_leg_L: { x: 0, y: 0, rotation: 80, scaleX: 1, scaleY: 1 },
      lower_leg_L: { x: 0, y: 0, rotation: -80, scaleX: 1, scaleY: 1 },
      upper_leg_R: { x: 0, y: 0, rotation: 80, scaleX: 1, scaleY: 1 },
      lower_leg_R: { x: 0, y: 0, rotation: -80, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: 25, scaleX: 1, scaleY: 1 },
      lower_arm_L: { x: 0, y: 0, rotation: 45, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: 25, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: 45, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'sit', durationSeconds: 1.0, fps: 24, loop: false, keyframes: [kf] };
}

function createStandClip(): AnimationClip {
  const kf: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: { ...identityTransforms() },
  };
  return { name: 'stand', durationSeconds: 1.0, fps: 24, loop: false, keyframes: [kf] };
}

function createTurnClip(): AnimationClip {
  const kf0: RigKeyframe = { timeSeconds: 0, boneTransforms: { ...identityTransforms() } };
  const kf1: RigKeyframe = {
    timeSeconds: 0.5,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: 0, rotation: 15, scaleX: 0.85, scaleY: 1 },
      head: { x: 0, y: 0, rotation: 20, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'turn', durationSeconds: 0.5, fps: 24, loop: false, keyframes: [kf0, kf1] };
}

function createLookClip(): AnimationClip {
  const kf0: RigKeyframe = { timeSeconds: 0, boneTransforms: { ...identityTransforms() } };
  const kf1: RigKeyframe = {
    timeSeconds: 0.6,
    boneTransforms: {
      ...identityTransforms(),
      head: { x: 0, y: 0, rotation: 25, scaleX: 1, scaleY: 1 },
      neck: { x: 0, y: 0, rotation: 10, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'look', durationSeconds: 0.6, fps: 24, loop: false, keyframes: [kf0, kf1] };
}

function createPointClip(): AnimationClip {
  const kf0: RigKeyframe = { timeSeconds: 0, boneTransforms: { ...identityTransforms() } };
  const kf1: RigKeyframe = {
    timeSeconds: 0.8,
    boneTransforms: {
      ...identityTransforms(),
      upper_arm_R: { x: 0, y: 0, rotation: -75, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: -10, scaleX: 1, scaleY: 1 },
      hand_R: { x: 0, y: 0, rotation: 5, scaleX: 1, scaleY: 1 },
      head: { x: 0, y: 0, rotation: -10, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'point', durationSeconds: 0.8, fps: 24, loop: false, keyframes: [kf0, kf1] };
}

function createWaveClip(): AnimationClip {
  const kf0: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: {
      ...identityTransforms(),
      upper_arm_R: { x: 0, y: 0, rotation: -130, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: -30, scaleX: 1, scaleY: 1 },
      hand_R: { x: 0, y: 0, rotation: -20, scaleX: 1, scaleY: 1 },
    },
  };
  const kf1: RigKeyframe = {
    timeSeconds: 0.3,
    boneTransforms: {
      ...identityTransforms(),
      upper_arm_R: { x: 0, y: 0, rotation: -130, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: 10, scaleX: 1, scaleY: 1 },
      hand_R: { x: 0, y: 0, rotation: 20, scaleX: 1, scaleY: 1 },
    },
  };
  const kf2: RigKeyframe = {
    timeSeconds: 0.6,
    boneTransforms: { ...kf0.boneTransforms },
  };

  return { name: 'wave', durationSeconds: 0.6, fps: 24, loop: true, keyframes: [kf0, kf1, kf2] };
}

function createPickUpClip(): AnimationClip {
  const kf0: RigKeyframe = { timeSeconds: 0, boneTransforms: { ...identityTransforms() } };
  const kf1: RigKeyframe = {
    timeSeconds: 0.6,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: 30, rotation: 35, scaleX: 1, scaleY: 1 },
      upper_leg_L: { x: 0, y: 0, rotation: 35, scaleX: 1, scaleY: 1 },
      lower_leg_L: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
      upper_leg_R: { x: 0, y: 0, rotation: 35, scaleX: 1, scaleY: 1 },
      lower_leg_R: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: 40, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: 20, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'pick_up', durationSeconds: 1.0, fps: 24, loop: false, keyframes: [kf0, kf1, kf0] };
}

function createHoldClip(): AnimationClip {
  const kf: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: {
      ...identityTransforms(),
      upper_arm_L: { x: 0, y: 0, rotation: 40, scaleX: 1, scaleY: 1 },
      lower_arm_L: { x: 0, y: 0, rotation: 80, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: 40, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: 80, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'hold', durationSeconds: 1.0, fps: 24, loop: false, keyframes: [kf] };
}

function createReactClip(): AnimationClip {
  const kf0: RigKeyframe = { timeSeconds: 0, boneTransforms: { ...identityTransforms() } };
  const kf1: RigKeyframe = {
    timeSeconds: 0.2,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: -5, rotation: -12, scaleX: 1, scaleY: 1 },
      head: { x: 0, y: 0, rotation: -15, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: -35, scaleX: 1, scaleY: 1 },
      lower_arm_L: { x: 0, y: 0, rotation: 70, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: -35, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: 70, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'react', durationSeconds: 0.5, fps: 24, loop: false, keyframes: [kf0, kf1] };
}

function createFearClip(): AnimationClip {
  const kf0: RigKeyframe = {
    timeSeconds: 0,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: 5, rotation: -8, scaleX: 0.98, scaleY: 0.98 },
      head: { x: 0, y: 0, rotation: -10, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: 30, scaleX: 1, scaleY: 1 },
      lower_arm_L: { x: 0, y: 0, rotation: 85, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: 30, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: 85, scaleX: 1, scaleY: 1 },
    },
  };
  const kf1: RigKeyframe = {
    timeSeconds: 0.15,
    boneTransforms: {
      ...kf0.boneTransforms,
      torso: { x: 0.5, y: 5, rotation: -7.5, scaleX: 0.98, scaleY: 0.98 },
    },
  };
  return { name: 'fear', durationSeconds: 0.3, fps: 24, loop: true, keyframes: [kf0, kf1] };
}

function createSurpriseClip(): AnimationClip {
  const kf0: RigKeyframe = { timeSeconds: 0, boneTransforms: { ...identityTransforms() } };
  const kf1: RigKeyframe = {
    timeSeconds: 0.25,
    boneTransforms: {
      ...identityTransforms(),
      torso: { x: 0, y: -10, rotation: -10, scaleX: 1.02, scaleY: 1.05 },
      head: { x: 0, y: 0, rotation: -8, scaleX: 1, scaleY: 1 },
      upper_arm_L: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
      lower_arm_L: { x: 0, y: 0, rotation: 40, scaleX: 1, scaleY: 1 },
      upper_arm_R: { x: 0, y: 0, rotation: -40, scaleX: 1, scaleY: 1 },
      lower_arm_R: { x: 0, y: 0, rotation: 40, scaleX: 1, scaleY: 1 },
    },
  };
  return { name: 'surprise', durationSeconds: 0.6, fps: 24, loop: false, keyframes: [kf0, kf1] };
}
