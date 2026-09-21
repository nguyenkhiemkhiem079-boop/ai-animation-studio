/**
 * ShotPlanner: Converts Story Intelligence SceneCandidates into ProductionScenes
 * with complete ShotContracts and a ShotDependencyGraph.
 */

import {
  ProductionScene,
  ProductionSceneSchema,
  ShotContract,
  ShotContractSchema,
  DirectorProfile,
  DirectorProfileSchema,
  ShotDependencyGraph,
  ShotDependencyGraphSchema,
  ShotPurpose,
  SequenceState,
} from '../domain/director.js';
import { SceneCandidate } from '../domain/story.js';
import { CameraDirector } from './sub-directors/camera-director.js';
import { ActingDirector } from './sub-directors/acting-director.js';
import { CompositionDirector } from './sub-directors/composition-director.js';
import { LightingDirector } from './sub-directors/lighting-director.js';
import { MotionDirector } from './sub-directors/motion-director.js';
import { TransitionDirector } from './sub-directors/transition-director.js';
import { CinematicGrammarEngine } from './cinematic-grammar-engine.js';

export const DEFAULT_DIRECTOR_PROFILE: DirectorProfile = {
  id: 'director_classic_cinematic',
  name: 'Classic Cinematic Director',
  pacingPreference: 'deliberate',
  compositionBias: 'rule_of_thirds',
  preferredFocalLengths: ['35mm', '50mm', '85mm'],
  favoriteSkills: ['push_in'],
  defaultShotDurationSeconds: 3.5,
};

export class ShotPlanner {
  private profile: DirectorProfile;

  constructor(profile: DirectorProfile = DEFAULT_DIRECTOR_PROFILE) {
    this.profile = DirectorProfileSchema.parse(profile);
  }

  public planScene(scene: SceneCandidate, projectId: string): {
    productionScene: ProductionScene;
    dependencyGraph: ShotDependencyGraph;
  } {
    const shots: ShotContract[] = [];
    let seqState: SequenceState = {
      currentShotIndex: 0,
      cumulativeDurationSeconds: 0,
      activeEyelineVector: 'center',
      recentSkillsUsed: [],
    };

    const hasDialogue = scene.dialogueLines.length > 0;
    let shotNumber = 1;

    // 1. Scene Opening Shot (Establishing)
    const openingPurpose: ShotPurpose = 'establishing';
    const openingShot = this.createShot({
      scene,
      shotNumber: shotNumber++,
      purpose: openingPurpose,
      seqState,
      characters: scene.charactersPresent,
      duration: this.profile.defaultShotDurationSeconds + 1.0, // establishing gets a bit more breath
    });
    shots.push(openingShot);
    seqState = CinematicGrammarEngine.updateSequenceState(seqState, openingShot);

    // 2. Dialogue coverage shots
    if (hasDialogue) {
      for (let dIdx = 0; dIdx < scene.dialogueLines.length; dIdx++) {
        const dLine = scene.dialogueLines[dIdx];
        const speaker = dLine.speaker;
        const listeners = scene.charactersPresent.filter((c) => c !== speaker);

        // Estimate duration based on line length (avg 15-20 chars/sec speaking rate)
        const spokenDuration = Math.max(2.5, Number((dLine.line.length / 15).toFixed(1)));

        // Dialogue delivery shot
        const dialogueShot = this.createShot({
          scene,
          shotNumber: shotNumber++,
          purpose: 'dialogue_coverage',
          seqState,
          characters: [speaker],
          dialogue: dLine,
          duration: spokenDuration,
          dependsOnShotId: shots[shots.length - 1].id,
        });
        shots.push(dialogueShot);
        seqState = CinematicGrammarEngine.updateSequenceState(seqState, dialogueShot);

        // Add a reaction shot if line is long or emotional
        if (listeners.length > 0 && (dLine.line.length > 50 || dIdx === scene.dialogueLines.length - 1)) {
          const reactionShot = this.createShot({
            scene,
            shotNumber: shotNumber++,
            purpose: 'reaction',
            seqState,
            characters: [listeners[0]],
            duration: 2.0,
            dependsOnShotId: shots[shots.length - 1].id,
          });
          shots.push(reactionShot);
          seqState = CinematicGrammarEngine.updateSequenceState(seqState, reactionShot);
        }
      }
    } else {
      // Non-dialogue prose scene: generate 2-3 atmospheric / action shots based on beats
      for (const beat of scene.beats) {
        const beatShot = this.createShot({
          scene,
          shotNumber: shotNumber++,
          purpose: 'action',
          seqState,
          characters: beat.involvedCharacterIds.length > 0 ? beat.involvedCharacterIds : scene.charactersPresent,
          beatSummary: beat.summary,
          duration: this.profile.defaultShotDurationSeconds,
          dependsOnShotId: shots[shots.length - 1].id,
        });
        shots.push(beatShot);
        seqState = CinematicGrammarEngine.updateSequenceState(seqState, beatShot);
      }
    }

    // 3. Mark transitions between shots
    for (let i = 0; i < shots.length; i++) {
      const isLast = i === shots.length - 1;
      shots[i].transition = TransitionDirector.directTransition({
        currentPurpose: shots[i].purpose,
        nextPurpose: isLast ? undefined : shots[i + 1].purpose,
        isSceneEnd: isLast,
      });
    }

    // Build ProductionScene
    const productionScene: ProductionScene = {
      id: `PROD_${scene.id}`,
      projectId,
      sceneNumber: scene.sceneNumber,
      heading: scene.heading,
      purpose: hasDialogue ? 'dialogue' : 'action',
      narrativeIntent: {
        dramaticGoal: scene.beats[0]?.summary || `Portray ${scene.heading}`,
        emotionalTone: scene.timeOfDay === 'night' ? 'tense' : 'neutral',
        pacingPriority: this.profile.pacingPreference,
      },
      shots,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Build ShotDependencyGraph
    const adjacencyList: Record<string, string[]> = {};
    for (let i = 0; i < shots.length; i++) {
      adjacencyList[shots[i].id] = i < shots.length - 1 ? [shots[i + 1].id] : [];
    }

    const dependencyGraph: ShotDependencyGraph = {
      sceneId: productionScene.id,
      adjacencyList,
      entryShotIds: [shots[0].id],
      terminalShotIds: [shots[shots.length - 1].id],
    };

    return {
      productionScene: ProductionSceneSchema.parse(productionScene),
      dependencyGraph: ShotDependencyGraphSchema.parse(dependencyGraph),
    };
  }

  private createShot(options: {
    scene: SceneCandidate;
    shotNumber: number;
    purpose: ShotPurpose;
    seqState: SequenceState;
    characters: string[];
    dialogue?: any;
    beatSummary?: string;
    duration: number;
    dependsOnShotId?: string;
  }): ShotContract {
    const { scene, shotNumber, purpose, seqState, characters, dialogue, duration, dependsOnShotId } = options;

    const shotId = `SHOT_${scene.id}_SH${String(shotNumber).padStart(2, '0')}`;

    // Sub-directors dispatch
    const camera = CameraDirector.directCamera({
      purpose,
      profile: this.profile,
      recentSkillsUsed: seqState.recentSkillsUsed,
    });

    const acting = ActingDirector.directActing({
      characterIds: characters,
      purpose,
      dialogue,
      activeEyelineVector: seqState.activeEyelineVector,
    });

    const composition = CompositionDirector.directComposition({
      purpose,
      profile: this.profile,
      subjectCount: characters.length,
    });

    const lighting = LightingDirector.directLighting({
      purpose,
      timeOfDay: scene.timeOfDay,
    });

    const { complexity, rendererIntent } = MotionDirector.directMotion({
      purpose,
      camera,
      characterCount: characters.length,
    });

    const shot: ShotContract = {
      id: shotId,
      sceneId: scene.id,
      shotNumber,
      purpose,
      complexity,
      rendererIntent,
      frame: {
        durationSeconds: duration,
        aspectRatio: '16:9',
        targetFps: 24,
      },
      camera,
      lighting,
      composition,
      acting,
      transition: { type: 'cut', durationSeconds: 0 },
      audioCue: { sfx: [] },
      requiredAssetIds: [],
      dependsOnShotIds: dependsOnShotId ? [dependsOnShotId] : [],
      directorLocks: {
        isCameraLocked: false,
        isFramingLocked: false,
        isRendererLocked: false,
        isActingLocked: false,
      },
      provenance: {
        directorProfileId: this.profile.id,
        ruleApplied: `SubDirectors[camera,acting,comp,light,motion]`,
        decidedAt: new Date().toISOString(),
      },
    };

    return ShotContractSchema.parse(shot);
  }
}
