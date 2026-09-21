import { z } from 'zod';

export const VoiceGenderSchema = z.enum(['male', 'female', 'neutral']);
export type VoiceGender = z.infer<typeof VoiceGenderSchema>;

export const VoiceAgeSchema = z.enum(['child', 'young_adult', 'adult', 'elder']);
export type VoiceAge = z.infer<typeof VoiceAgeSchema>;

export const CharacterVoiceProfileSchema = z.object({
  characterId: z.string().min(1),
  voiceId: z.string().min(1),
  provider: z.string().default('elevenlabs'),
  gender: VoiceGenderSchema.default('neutral'),
  age: VoiceAgeSchema.default('adult'),
  accent: z.string().optional(),
  pitch: z.number().min(-1.0).max(1.0).default(0.0),
  speakingRate: z.number().min(0.5).max(2.0).default(1.0),
  stability: z.number().min(0.0).max(1.0).default(0.75),
  claritySimilarity: z.number().min(0.0).max(1.0).default(0.85),
  sampleAudioUri: z.string().optional(),
  updatedAt: z.string().datetime(),
});
export type CharacterVoiceProfile = z.infer<typeof CharacterVoiceProfileSchema>;

export const AudioDialogueTrackSchema = z.object({
  id: z.string().min(1),
  shotId: z.string().min(1),
  characterId: z.string().min(1),
  text: z.string().min(1),
  emotion: z.string().default('neutral'),
  startTimeSeconds: z.number().nonnegative().default(0.0),
  durationSeconds: z.number().positive().default(2.0),
  audioAssetId: z.string().optional(),
  audioUri: z.string().optional(),
  loudnessDb: z.number().default(-14.0),
});
export type AudioDialogueTrack = z.infer<typeof AudioDialogueTrackSchema>;
export type SynthesizedDialogueLine = AudioDialogueTrack;

export const MusicTrackSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  title: z.string().min(1),
  genre: z.string().default('cinematic_orchestral'),
  mood: z.string().default('suspenseful'),
  tempoBpm: z.number().int().positive().default(100),
  musicalKey: z.string().optional(),
  startTimeSeconds: z.number().nonnegative().default(0.0),
  durationSeconds: z.number().positive().default(10.0),
  volume: z.number().min(0.0).max(1.0).default(0.7),
  fadeInSeconds: z.number().nonnegative().default(1.0),
  fadeOutSeconds: z.number().nonnegative().default(1.5),
  audioAssetId: z.string().optional(),
  audioUri: z.string().optional(),
});
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

export const SfxCategorySchema = z.enum([
  'foley',
  'ambient',
  'impact',
  'action',
  'electronic',
  'vocal',
  'transition',
]);
export type SfxCategory = z.infer<typeof SfxCategorySchema>;

export const SfxCueSchema = z.object({
  id: z.string().min(1),
  shotId: z.string().min(1),
  name: z.string().min(1),
  category: SfxCategorySchema.default('foley'),
  timestampSeconds: z.number().nonnegative().default(0.0),
  durationSeconds: z.number().positive().default(1.0),
  volume: z.number().min(0.0).max(1.0).default(0.8),
  audioAssetId: z.string().optional(),
  audioUri: z.string().optional(),
});
export type SfxCue = z.infer<typeof SfxCueSchema>;

export const AudioDuckingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  duckMusicOnDialogueDb: z.number().default(-6.0),
  duckSfxOnDialogueDb: z.number().default(-3.0),
  attackMs: z.number().nonnegative().default(100),
  releaseMs: z.number().nonnegative().default(300),
});
export type AudioDuckingConfig = z.infer<typeof AudioDuckingConfigSchema>;

export const AudioMixContractSchema = z.object({
  projectId: z.string().min(1),
  seriesId: z.string().default('default_series'),
  totalDurationSeconds: z.number().positive(),
  masterVolume: z.number().min(0.0).max(1.0).default(1.0),
  dialogueVolume: z.number().min(0.0).max(1.0).default(1.0),
  musicVolume: z.number().min(0.0).max(1.0).default(0.7),
  sfxVolume: z.number().min(0.0).max(1.0).default(0.8),
  ducking: AudioDuckingConfigSchema.default({
    enabled: true,
    duckMusicOnDialogueDb: -6.0,
    duckSfxOnDialogueDb: -3.0,
    attackMs: 100,
    releaseMs: 300,
  }),
  dialogueTracks: z.array(AudioDialogueTrackSchema).default([]),
  musicTracks: z.array(MusicTrackSchema).default([]),
  sfxCues: z.array(SfxCueSchema).default([]),
  compiledAt: z.string().datetime(),
});
export type AudioMixContract = z.infer<typeof AudioMixContractSchema>;
