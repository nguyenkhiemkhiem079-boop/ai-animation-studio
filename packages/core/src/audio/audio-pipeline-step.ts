import * as path from 'node:path';
import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene } from '../domain/director.js';
import {
  AudioMixContract,
  AudioDialogueTrack,
  MusicTrack,
  SfxCue,
} from '../domain/audio.js';
import { ProviderRegistry } from '../providers/index.js';
import { VoiceStudio } from './voice-studio.js';
import { ScoreComposer } from './score-composer.js';
import { FoleyMixer } from './foley-mixer.js';
import { AudioMixEngine } from './audio-mix-engine.js';
import { MockAudioProvider } from './mock-audio-provider.js';
import { LocalAudioGenerator } from './local-audio-generator.js';
import { RealAudioMixer } from './real-audio-mixer.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { ValidationError } from '../errors/index.js';
import { TimedViseme } from '../character-animation/lip-sync.js';

export interface AudioStepSummary {
  totalDialogueLines: number;
  totalMusicTracks: number;
  totalSfxCues: number;
  totalAudioCostUsd: number;
  totalDurationSeconds: number;
}

export class AudioProductionPipelineStep implements PipelineStep {
  public readonly id = 'audio_production_step';
  public readonly name = 'Audio Production & Mix';
  public readonly description =
    'Synthesizes dialogue lines, composes scene background scores, places SFX cues, and compiles master audio mix with ducking.';
  public readonly saveCheckpointAfter = true;

  constructor(
    private voiceStudio?: VoiceStudio,
    private scoreComposer?: ScoreComposer,
    private foleyMixer?: FoleyMixer,
    private audioMixEngine: AudioMixEngine = new AudioMixEngine(),
    private providerRegistry?: ProviderRegistry,
    private assetRegistry?: IAssetRegistry
  ) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;
    const projectId = (state.projectId as string) || 'default_project';
    const seriesId = (state.seriesId as string) || 'default_series';

    // 1. Retrieve planned production scenes from state
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    if (!productionScenes || !Array.isArray(productionScenes)) {
      throw new ValidationError(
        'Cannot run AudioProductionPipelineStep: "productionScenes" missing from pipeline state. Run Director step first.'
      );
    }

    // 2. Ensure registry has audio provider
    const registry = this.providerRegistry ?? new ProviderRegistry();
    if (!registry.has('mock-audio-provider')) {
      registry.register(new MockAudioProvider());
    }

    const voiceStudio = this.voiceStudio ?? new VoiceStudio(registry);
    const scoreComposer = this.scoreComposer ?? new ScoreComposer(registry);
    const foleyMixer = this.foleyMixer ?? new FoleyMixer(registry);

    logger.info(
      `Starting Audio Production for ${productionScenes.length} scene(s) in project "${projectId}"...`
    );

    const allDialogueLines: AudioDialogueTrack[] = [];
    const allMusicTracks: MusicTrack[] = [];
    const allSfxCues: SfxCue[] = [];
    const actorVisemeMap: Record<string, TimedViseme[]> = {};
    let totalCostUsd = 0.0;
    let timeCursorSeconds = 0.0;

    for (const scene of productionScenes) {
      const sceneStartTime = timeCursorSeconds;

      // Compose scene background score
      const scoreResult = await scoreComposer.composeSceneScore(scene, {
        startTimeSeconds: sceneStartTime,
      });
      allMusicTracks.push(scoreResult.musicTrack);
      totalCostUsd += scoreResult.actualCostUsd;

      // Register music asset
      if (this.assetRegistry) {
        await this.assetRegistry.register({
          id: scoreResult.musicTrack.audioAssetId ?? `ASSET_MUSIC_${scene.id}`,
          name: scoreResult.musicTrack.title,
          seriesId,
          type: 'audio_music',
          status: 'candidate',
          contentHash: `hash_${scoreResult.musicTrack.id}`,
          storageUri: scoreResult.musicTrack.audioUri ?? '',
          mimeType: 'audio/mp3',
          sizeBytes: 1024 * 512,
          entityId: scene.id,
          version: 1,
          metadata: { sceneId: scene.id, mood: scoreResult.musicTrack.mood },
          tags: ['music', scoreResult.musicTrack.genre],
        });
      }

      // Process shots in scene
      for (const shot of scene.shots) {
        const shotStartTime = timeCursorSeconds;

        // Process dialogue
        for (const actor of shot.acting) {
          if (actor.dialogueLine) {
            const voiceResult = await voiceStudio.synthesizeDialogue({
              seriesId,
              shotId: shot.id,
              characterId: actor.characterId,
              text: actor.dialogueLine,
              emotion: actor.expression,
              startTimeSeconds: shotStartTime,
            });

            allDialogueLines.push(voiceResult.dialogueLine);
            totalCostUsd += voiceResult.actualCostUsd;
            actorVisemeMap[`${shot.id}_${actor.characterId}`] = voiceResult.visemes;

            // Register dialogue voice asset
            if (this.assetRegistry) {
              await this.assetRegistry.register({
                id: voiceResult.dialogueLine.audioAssetId ?? `ASSET_VOICE_${shot.id}_${actor.characterId}`,
                name: `Dialogue: ${actor.characterId} (${shot.id})`,
                seriesId,
                type: 'audio_voice',
                status: 'candidate',
                contentHash: `hash_${voiceResult.dialogueLine.id}`,
                storageUri: voiceResult.dialogueLine.audioUri ?? '',
                mimeType: 'audio/wav',
                sizeBytes: 1024 * 256,
                entityId: actor.characterId,
                version: 1,
                metadata: { shotId: shot.id, text: actor.dialogueLine },
                tags: ['dialogue', actor.characterId],
              });
            }
          }
        }

        // Process SFX
        const sfxResult = await foleyMixer.generateShotSfx(shot, {
          shotStartTimeSeconds: shotStartTime,
        });
        allSfxCues.push(...sfxResult.sfxCues);
        totalCostUsd += sfxResult.actualCostUsd;

        // Register SFX assets
        if (this.assetRegistry) {
          for (const cue of sfxResult.sfxCues) {
            await this.assetRegistry.register({
              id: cue.audioAssetId ?? `ASSET_SFX_${cue.id}`,
              name: `SFX: ${cue.name}`,
              seriesId,
              type: 'audio_sfx',
              status: 'candidate',
              contentHash: `hash_${cue.id}`,
              storageUri: cue.audioUri ?? '',
              mimeType: 'audio/wav',
              sizeBytes: 1024 * 128,
              entityId: shot.id,
              version: 1,
              metadata: { shotId: shot.id, category: cue.category },
              tags: ['sfx', cue.category],
            });
          }
        }

        timeCursorSeconds += shot.frame.durationSeconds;
      }
    }

    // Compile master audio mix contract
    const audioMixContract: AudioMixContract = this.audioMixEngine.compileAudioMix(
      projectId,
      seriesId,
      allDialogueLines,
      allMusicTracks,
      allSfxCues,
      timeCursorSeconds
    );

    const summary: AudioStepSummary = {
      totalDialogueLines: allDialogueLines.length,
      totalMusicTracks: allMusicTracks.length,
      totalSfxCues: allSfxCues.length,
      totalAudioCostUsd: Number(totalCostUsd.toFixed(4)),
      totalDurationSeconds: Number(timeCursorSeconds.toFixed(2)),
    };

    // 3. Real Audio Mix Execution in LOCAL / PRODUCTION mode
    let masterAudioPath: string | undefined;
    const executionMode = (state.executionMode as string) || 'MOCK';
    if (executionMode === 'LOCAL' || executionMode === 'PRODUCTION') {
      const audioDir = path.join('.studio', 'audio', projectId);
      const musicWav = path.join(audioDir, 'scene_music.wav');
      const sfxWav = path.join(audioDir, 'scene_sfx.wav');

      await LocalAudioGenerator.generate({
        outputPath: musicWav,
        durationSeconds: Math.max(0.5, timeCursorSeconds),
        type: 'music',
      });

      await LocalAudioGenerator.generate({
        outputPath: sfxWav,
        durationSeconds: Math.max(0.5, timeCursorSeconds * 0.5),
        type: 'sfx',
      });

      const mixResult = await RealAudioMixer.mix({
        projectId,
        outputDir: audioDir,
        totalDurationSeconds: Math.max(0.5, timeCursorSeconds),
        stems: [
          { filePath: musicWav, startTimeSeconds: 0, volume: 0.6, stemType: 'music' },
          { filePath: sfxWav, startTimeSeconds: 0.5, volume: 0.8, stemType: 'sfx' },
        ],
      });

      masterAudioPath = mixResult.masterAudioPath;
      logger.info(`Mixed real master audio for project "${projectId}" at: ${masterAudioPath}`);
    }

    return {
      audioMixContract,
      dialogueLines: allDialogueLines,
      musicTracks: allMusicTracks,
      sfxCues: allSfxCues,
      actorVisemeMap,
      audioStepSummary: summary,
      masterAudioPath,
    };
  }
}
