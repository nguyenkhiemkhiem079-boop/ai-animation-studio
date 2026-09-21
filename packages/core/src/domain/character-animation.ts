import { z } from 'zod';

export const BoneNameSchema = z.enum([
  'head',
  'neck',
  'torso',
  'upper_arm_L',
  'upper_arm_R',
  'lower_arm_L',
  'lower_arm_R',
  'hand_L',
  'hand_R',
  'upper_leg_L',
  'upper_leg_R',
  'lower_leg_L',
  'lower_leg_R',
  'foot_L',
  'foot_R',
]);
export type BoneName = z.infer<typeof BoneNameSchema>;

export const BoneTransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  rotation: z.number().default(0), // degrees
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
});
export type BoneTransform = z.infer<typeof BoneTransformSchema>;

export const BoneDefinitionSchema = z.object({
  name: BoneNameSchema,
  parentName: BoneNameSchema.optional(),
  length: z.number().positive().default(50),
  defaultTransform: BoneTransformSchema.default({}),
});
export type BoneDefinition = z.infer<typeof BoneDefinitionSchema>;

export const EyeDirectionSchema = z.enum([
  'screen_left',
  'screen_right',
  'direct_to_camera',
  'looking_up',
  'looking_down',
  'away',
]);
export type EyeDirection = z.infer<typeof EyeDirectionSchema>;

export const BlinkStateSchema = z.enum(['open', 'half', 'closed']);
export type BlinkState = z.infer<typeof BlinkStateSchema>;

export const MouthShapeSchema = z.enum([
  'rest',
  'A',
  'E',
  'O',
  'U',
  'M',
  'L',
  'FV',
  'WQ',
]);
export type MouthShape = z.infer<typeof MouthShapeSchema>;

export const FacialStateSchema = z.object({
  expression: z.string().default('neutral'),
  eyeDirection: EyeDirectionSchema.default('direct_to_camera'),
  blinkState: BlinkStateSchema.default('open'),
  mouthShape: MouthShapeSchema.default('rest'),
  eyebrowState: z.enum(['neutral', 'raised', 'furrowed']).default('neutral'),
});
export type FacialState = z.infer<typeof FacialStateSchema>;

export const PropAttachmentSchema = z.object({
  slot: z.enum(['hand_L', 'hand_R', 'torso', 'head']),
  propId: z.string().min(1),
  offset: z.object({
    x: z.number().default(0),
    y: z.number().default(0),
    rotation: z.number().default(0),
  }).default({}),
});
export type PropAttachment = z.infer<typeof PropAttachmentSchema>;

export const RigKeyframeSchema = z.object({
  timeSeconds: z.number().nonnegative(),
  boneTransforms: z.record(BoneNameSchema, BoneTransformSchema),
  facialState: FacialStateSchema.optional(),
});
export type RigKeyframe = z.infer<typeof RigKeyframeSchema>;

export const AnimationClipSchema = z.object({
  name: z.string().min(1),
  durationSeconds: z.number().positive(),
  fps: z.number().int().positive().default(24),
  loop: z.boolean().default(false),
  keyframes: z.array(RigKeyframeSchema).default([]),
});
export type AnimationClip = z.infer<typeof AnimationClipSchema>;

export const CharacterRigSchema = z.object({
  characterId: z.string().min(1),
  bones: z.array(BoneDefinitionSchema),
  defaultPose: z.record(BoneNameSchema, BoneTransformSchema),
  attachedProps: z.array(PropAttachmentSchema).default([]),
});
export type CharacterRig = z.infer<typeof CharacterRigSchema>;

export const DigitalActorTrackSchema = z.object({
  characterId: z.string().min(1),
  shotId: z.string().min(1),
  clipName: z.string().min(1),
  durationSeconds: z.number().positive(),
  loop: z.boolean().default(false),
  dialogue: z.string().optional(),
  props: z.array(PropAttachmentSchema).default([]),
  sampledKeyframes: z.array(RigKeyframeSchema).default([]),
});
export type DigitalActorTrack = z.infer<typeof DigitalActorTrackSchema>;
