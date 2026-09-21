import { Pipeline, PipelineStep } from './index.js';
import { IStorageProvider } from '../storage/index.js';
import { IAssetRegistry, InMemoryAssetRegistry } from '../asset-registry/index.js';
import { StudioEventBus, defaultEventBus } from '../events/index.js';
import { Logger, defaultLogger } from '../logging/index.js';

// Pipeline Steps
import { createStoryIntelligenceStep } from '../story/story-pipeline-step.js';
import { createShotPlanningStep } from '../director/director-pipeline-step.js';
import { CharacterAssetPipelineStep } from '../character/character-pipeline-step.js';
import { WorldEnvironmentPipelineStep } from '../world/world-pipeline-step.js';
import { ProductionPlanningPipelineStep } from '../production/production-pipeline-step.js';
import { HyperFramesExecutionPipelineStep } from '../hyperframes/hyperframes-pipeline-step.js';
import { GenerativeVideoPipelineStep } from '../video-providers/generative-video-pipeline-step.js';
import { AudioProductionPipelineStep } from '../audio/audio-pipeline-step.js';
import { TimelineEditingPipelineStep } from '../timeline/timeline-pipeline-step.js';
import { ContinuityQAPipelineStep } from '../qa/continuity-qa-pipeline-step.js';
import { VisualSemanticQAPipelineStep } from '../qa/visual-qa-pipeline-step.js';
import { MasterExportPipelineStep } from '../export/master-export-pipeline-step.js';
import { UniverseManager } from '../universe/index.js';
import { CharacterStudio } from '../character/character-studio.js';
import { WorldStudio } from '../world/world-studio.js';
import { LLMProvider } from '../llm/llm-provider.js';

export interface StudioPipelineOptions {
  storage: IStorageProvider;
  assetRegistry?: IAssetRegistry;
  events?: StudioEventBus;
  logger?: Logger;
  autoRepairContinuity?: boolean;
  llm?: LLMProvider;
}

export class StudioPipelineFactory {
  /**
   * Creates the complete end-to-end 12-step DAG production pipeline for AI Animation Studio.
   */
  public static createPipeline(options: StudioPipelineOptions): Pipeline {
    const {
      storage,
      assetRegistry = new InMemoryAssetRegistry(),
      events = defaultEventBus,
      logger = defaultLogger,
      autoRepairContinuity = true,
      llm,
    } = options;

    const universeManager = new UniverseManager(storage);
    const characterStudio = new CharacterStudio(universeManager, assetRegistry);
    const worldStudio = new WorldStudio(universeManager, assetRegistry);

    const steps: PipelineStep[] = [
      // 1. Story Ingestion & Narrative Intelligence (id: 'story_intelligence')
      createStoryIntelligenceStep(),

      // 2. Scene Breakdown, Shot Planning & Director QA (id: 'shot_planning')
      createShotPlanningStep(),

      // 3. Canonical Character Turnarounds, Poses & Outfits (id: 'character_asset_resolution')
      new CharacterAssetPipelineStep(characterStudio),

      // 4. World Environment Staging, Layers & Props (id: 'world_environment_resolution')
      new WorldEnvironmentPipelineStep(worldStudio),

      // 5. Production Planning, Cost Caps & Routing (id: 'production_planning_router')
      new ProductionPlanningPipelineStep(),

      // 6. Deterministic HyperFrames Animation ($0.00) (id: 'hyperframes_deterministic_execution')
      new HyperFramesExecutionPipelineStep(),

      // 7. Generative Video Providers & Continuation Chaining (id: 'generative_video_step')
      new GenerativeVideoPipelineStep(undefined, undefined, assetRegistry),

      // 8. Visual Semantic QA & Multimodal Continuity (id: 'visual_semantic_qa_step')
      new VisualSemanticQAPipelineStep(llm, assetRegistry),

      // 9. Voice, Music & SFX Audio Production with Ducking (id: 'audio_production_step')
      new AudioProductionPipelineStep(undefined, undefined, undefined, undefined, undefined, assetRegistry),

      // 10. Multi-Track Timeline & Subtitle Assembly (id: 'timeline_editing_step')
      new TimelineEditingPipelineStep(assetRegistry),

      // 11. Continuity QA & Automated Defect Repair (id: 'continuity_qa_step')
      new ContinuityQAPipelineStep(autoRepairContinuity, assetRegistry),

      // 12. Final Master Export (HTML5, MP4/WebM, OTIO & EDL) (id: 'master_export_step')
      new MasterExportPipelineStep(assetRegistry),
    ];

    return new Pipeline({
      name: 'AI Animation Studio Master Production Pipeline',
      steps,
      storage,
      events,
      logger,
    });
  }
}
