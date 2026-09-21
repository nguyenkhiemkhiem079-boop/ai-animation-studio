/**
 * PipelineStep implementation for Scene and Shot Direction.
 */

import { PipelineStep, PipelineContext } from '../pipeline/index.js';
import { StoryAnalysis } from '../domain/story.js';
import { DirectorProfile, ProductionScene, ShotDependencyGraph, DirectorQAReport } from '../domain/director.js';
import { ShotPlanner, DEFAULT_DIRECTOR_PROFILE } from './shot-planner.js';
import { DirectorQA } from './director-qa.js';
import { ValidationError } from '../errors/index.js';

export interface ShotPlanningStepOptions {
  directorProfile?: DirectorProfile;
  saveCheckpointAfter?: boolean;
}

export function createShotPlanningStep(options: ShotPlanningStepOptions = {}): PipelineStep {
  return {
    id: 'shot_planning',
    name: 'Scene & Shot Direction Planning',
    description: 'Converts Story Intelligence SceneCandidates into ProductionScenes with ShotContracts and QA validation.',
    saveCheckpointAfter: options.saveCheckpointAfter ?? true,
    run: async (context: PipelineContext): Promise<Record<string, unknown>> => {
      const storyAnalysis = context.state.storyAnalysis as StoryAnalysis;
      if (!storyAnalysis || !Array.isArray(storyAnalysis.sceneCandidates)) {
        throw new ValidationError('Pipeline state must include "storyAnalysis" with scene candidates to plan shots');
      }

      const profile = options.directorProfile || (context.state.directorProfile as DirectorProfile) || DEFAULT_DIRECTOR_PROFILE;
      const planner = new ShotPlanner(profile);

      const productionScenes: ProductionScene[] = [];
      const dependencyGraphs: Record<string, ShotDependencyGraph> = {};
      const qaReports: Record<string, DirectorQAReport> = {};

      context.logger.info(`Planning shots for ${storyAnalysis.sceneCandidates.length} scenes using Director "${profile.name}"...`);

      for (const sceneCand of storyAnalysis.sceneCandidates) {
        const { productionScene, dependencyGraph } = planner.planScene(sceneCand, context.projectId);
        const qaReport = DirectorQA.evaluateScene(productionScene, dependencyGraph, profile);

        productionScenes.push(productionScene);
        dependencyGraphs[productionScene.id] = dependencyGraph;
        qaReports[productionScene.id] = qaReport;

        context.logger.info(
          `Scene ${productionScene.sceneNumber} (${productionScene.heading}) planned: ${productionScene.shots.length} shots. QA Valid: ${qaReport.isValid}`
        );
      }

      const totalShots = productionScenes.reduce((acc, s) => acc + s.shots.length, 0);

      return {
        productionScenes,
        dependencyGraphs,
        directorQAReports: qaReports,
        totalPlannedShots: totalShots,
      };
    },
  };
}
