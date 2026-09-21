import { z } from 'zod';

export const TimelineTrackTypeSchema = z.enum([
  'video',
  'audio_dialogue',
  'audio_music',
  'audio_sfx',
  'subtitle',
  'effect',
]);
export type TimelineTrackType = z.infer<typeof TimelineTrackTypeSchema>;

export const TimelineTransitionTypeSchema = z.enum([
  'hard_cut',
  'cross_dissolve',
  'whip_pan',
  'match_cut',
  'fade_black',
  'fade_white',
]);
export type TimelineTransitionType = z.infer<typeof TimelineTransitionTypeSchema>;

export const TimelineClipTransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().default(1),
  rotation: z.number().default(0),
});
export type TimelineClipTransform = z.infer<typeof TimelineClipTransformSchema>;

export const TimelineClipSchema = z.object({
  clipId: z.string(),
  trackId: z.string(),
  name: z.string(),
  startTime: z.number().min(0), // in seconds
  duration: z.number().min(0.01), // in seconds
  sourceAssetId: z.string(),
  inPoint: z.number().min(0).default(0),
  outPoint: z.number().min(0.01),
  speedMultiplier: z.number().positive().default(1),
  volume: z.number().min(0).max(1).default(1),
  opacity: z.number().min(0).max(1).default(1),
  transform: TimelineClipTransformSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type TimelineClip = z.infer<typeof TimelineClipSchema>;

export const TimelineTransitionSchema = z.object({
  transitionId: z.string(),
  fromClipId: z.string(),
  toClipId: z.string(),
  type: TimelineTransitionTypeSchema,
  duration: z.number().min(0).default(0), // 0 for hard cuts
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).default('ease_in_out'),
  metadata: z.record(z.unknown()).optional(),
});
export type TimelineTransition = z.infer<typeof TimelineTransitionSchema>;

export const TimelineTrackSchema = z.object({
  trackId: z.string(),
  trackType: TimelineTrackTypeSchema,
  name: z.string(),
  order: z.number().int().min(0),
  clips: z.array(TimelineClipSchema).default([]),
  isMuted: z.boolean().default(false),
  isLocked: z.boolean().default(false),
  volume: z.number().min(0).max(1).default(1),
  pan: z.number().min(-1).max(1).default(0), // -1 left, +1 right
});
export type TimelineTrack = z.infer<typeof TimelineTrackSchema>;

export const SubtitleItemSchema = z.object({
  id: z.string(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  speaker: z.string().optional(),
  text: z.string(),
});
export type SubtitleItem = z.infer<typeof SubtitleItemSchema>;

export const TimelineSequenceSchema = z.object({
  sequenceId: z.string(),
  projectId: z.string(),
  sceneId: z.string().optional(),
  name: z.string(),
  tracks: z.array(TimelineTrackSchema),
  transitions: z.array(TimelineTransitionSchema).default([]),
  subtitles: z.array(SubtitleItemSchema).default([]),
  totalDuration: z.number().min(0),
  fps: z.number().positive().default(24),
  resolution: z.object({
    width: z.number().int().positive().default(1920),
    height: z.number().int().positive().default(1080),
  }).default({ width: 1920, height: 1080 }),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type TimelineSequence = z.infer<typeof TimelineSequenceSchema>;
