import {
  BoneName,
  EyeDirection,
  FacialState,
  PropAttachment,
  RigKeyframe,
} from '../domain/character-animation.js';
import { Skeleton, WorldJointTransform } from './skeleton.js';
import { CharacterAnimationLibrary } from './animation-library.js';
import { FacialSystem } from './facial-system.js';
import { LipSyncEngine, TimedViseme } from './lip-sync.js';
import { AnimationBlender } from './animation-blender.js';

export interface CharacterPoseSnapshot {
  timeSeconds: number;
  keyframe: RigKeyframe;
  worldJoints: Record<BoneName, WorldJointTransform>;
  facialState: FacialState;
  props: PropAttachment[];
}

export class CharacterController {
  private currentClipName: string = 'idle';
  private loop: boolean = true;
  private expression: string = 'neutral';
  private eyeDirection: EyeDirection = 'direct_to_camera';
  private attachedProps: PropAttachment[] = [];
  private dialogueVisemes: TimedViseme[] = [];

  constructor(
    public readonly characterId: string,
    private skeleton: Skeleton = Skeleton.createStandardHumanoid(),
    private library: CharacterAnimationLibrary = CharacterAnimationLibrary.createDefault(),
    private facialSystem: FacialSystem = new FacialSystem(),
    private lipSyncEngine: LipSyncEngine = new LipSyncEngine(),
    private blender: AnimationBlender = new AnimationBlender()
  ) {}

  public playClip(name: string, loop: boolean = true): void {
    this.currentClipName = name.toLowerCase();
    this.loop = loop;
  }

  public speak(dialogue: string, durationSeconds: number): void {
    this.dialogueVisemes = this.lipSyncEngine.generateVisemes(dialogue, durationSeconds);
  }

  public setExpression(expression: string): void {
    this.expression = expression;
  }

  public setEyeDirection(direction: EyeDirection): void {
    this.eyeDirection = direction;
  }

  public attachProp(
    slot: 'hand_L' | 'hand_R' | 'torso' | 'head',
    propId: string,
    offset: { x: number; y: number; rotation: number } = { x: 0, y: 0, rotation: 0 }
  ): void {
    this.detachProp(propId);
    this.attachedProps.push({ slot, propId, offset });
  }

  public detachProp(propId: string): void {
    this.attachedProps = this.attachedProps.filter((p) => p.propId !== propId);
  }

  public getAttachedProps(): PropAttachment[] {
    return [...this.attachedProps];
  }

  public samplePose(timeSeconds: number): CharacterPoseSnapshot {
    const clip = this.library.getClip(this.currentClipName) ?? this.library.getClip('idle')!;
    const keyframe = this.blender.sampleClip({ ...clip, loop: this.loop }, timeSeconds);

    // Compute mouth shape from lip-sync
    const mouthShape = this.dialogueVisemes.length > 0
      ? this.lipSyncEngine.sampleMouthShape(this.dialogueVisemes, timeSeconds)
      : 'rest';

    // Compute facial state
    const facialState = this.facialSystem.computeFacialState(
      timeSeconds,
      this.expression,
      this.eyeDirection,
      mouthShape
    );

    // Compute forward kinematics world transforms
    const worldJoints = this.skeleton.computeWorldTransforms(keyframe.boneTransforms);

    return {
      timeSeconds,
      keyframe: {
        ...keyframe,
        facialState,
      },
      worldJoints,
      facialState,
      props: [...this.attachedProps],
    };
  }
}
