import {
  BoneName,
  BoneTransform,
  BoneDefinition,
} from '../domain/character-animation.js';

export interface WorldJointTransform {
  x: number;
  y: number;
  rotation: number; // degrees
}

export class Skeleton {
  private bones = new Map<BoneName, BoneDefinition>();
  private boneOrder: BoneName[] = [];

  constructor(definitions: BoneDefinition[] = []) {
    for (const def of definitions) {
      this.addBone(def);
    }
  }

  public static createStandardHumanoid(): Skeleton {
    const bones: BoneDefinition[] = [
      // Core root
      { name: 'torso', length: 60, defaultTransform: { x: 960, y: 540, rotation: 0, scaleX: 1, scaleY: 1 } },
      { name: 'neck', parentName: 'torso', length: 15, defaultTransform: { x: 0, y: -60, rotation: 0, scaleX: 1, scaleY: 1 } },
      { name: 'head', parentName: 'neck', length: 30, defaultTransform: { x: 0, y: -15, rotation: 0, scaleX: 1, scaleY: 1 } },

      // Left Arm
      { name: 'upper_arm_L', parentName: 'torso', length: 45, defaultTransform: { x: -25, y: -50, rotation: 20, scaleX: 1, scaleY: 1 } },
      { name: 'lower_arm_L', parentName: 'upper_arm_L', length: 40, defaultTransform: { x: 0, y: 45, rotation: 10, scaleX: 1, scaleY: 1 } },
      { name: 'hand_L', parentName: 'lower_arm_L', length: 15, defaultTransform: { x: 0, y: 40, rotation: 0, scaleX: 1, scaleY: 1 } },

      // Right Arm
      { name: 'upper_arm_R', parentName: 'torso', length: 45, defaultTransform: { x: 25, y: -50, rotation: -20, scaleX: 1, scaleY: 1 } },
      { name: 'lower_arm_R', parentName: 'upper_arm_R', length: 40, defaultTransform: { x: 0, y: 45, rotation: -10, scaleX: 1, scaleY: 1 } },
      { name: 'hand_R', parentName: 'lower_arm_R', length: 15, defaultTransform: { x: 0, y: 40, rotation: 0, scaleX: 1, scaleY: 1 } },

      // Left Leg
      { name: 'upper_leg_L', parentName: 'torso', length: 65, defaultTransform: { x: -15, y: 0, rotation: 5, scaleX: 1, scaleY: 1 } },
      { name: 'lower_leg_L', parentName: 'upper_leg_L', length: 60, defaultTransform: { x: 0, y: 65, rotation: 0, scaleX: 1, scaleY: 1 } },
      { name: 'foot_L', parentName: 'lower_leg_L', length: 20, defaultTransform: { x: 0, y: 60, rotation: 90, scaleX: 1, scaleY: 1 } },

      // Right Leg
      { name: 'upper_leg_R', parentName: 'torso', length: 65, defaultTransform: { x: 15, y: 0, rotation: -5, scaleX: 1, scaleY: 1 } },
      { name: 'lower_leg_R', parentName: 'upper_leg_R', length: 60, defaultTransform: { x: 0, y: 65, rotation: 0, scaleX: 1, scaleY: 1 } },
      { name: 'foot_R', parentName: 'lower_leg_R', length: 20, defaultTransform: { x: 0, y: 60, rotation: 90, scaleX: 1, scaleY: 1 } },
    ];

    return new Skeleton(bones);
  }

  public addBone(definition: BoneDefinition): void {
    this.bones.set(definition.name, definition);
    if (!this.boneOrder.includes(definition.name)) {
      this.boneOrder.push(definition.name);
    }
  }

  public getBone(name: BoneName): BoneDefinition | undefined {
    return this.bones.get(name);
  }

  public listBones(): BoneDefinition[] {
    return this.boneOrder.map((name) => this.bones.get(name)!);
  }

  /**
   * Forward Kinematics (FK): Calculates world coordinates for each bone joint.
   */
  public computeWorldTransforms(
    localTransforms: Partial<Record<BoneName, BoneTransform>>
  ): Record<BoneName, WorldJointTransform> {
    const worldTransforms: Partial<Record<BoneName, WorldJointTransform>> = {};

    for (const name of this.boneOrder) {
      const def = this.bones.get(name)!;
      const local = localTransforms[name] ?? def.defaultTransform;

      if (!def.parentName) {
        // Root bone
        worldTransforms[name] = {
          x: local.x,
          y: local.y,
          rotation: local.rotation,
        };
      } else {
        const parentWorld = worldTransforms[def.parentName];
        if (!parentWorld) {
          worldTransforms[name] = { x: local.x, y: local.y, rotation: local.rotation };
          continue;
        }

        const parentDef = this.bones.get(def.parentName)!;
        const rad = (parentWorld.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Apply local offset rotated by parent world rotation
        const rotatedOffsetX = local.x * cos - local.y * sin;
        const rotatedOffsetY = local.x * sin + local.y * cos;

        worldTransforms[name] = {
          x: parentWorld.x + rotatedOffsetX,
          y: parentWorld.y + rotatedOffsetY,
          rotation: parentWorld.rotation + local.rotation,
        };
      }
    }

    return worldTransforms as Record<BoneName, WorldJointTransform>;
  }
}
