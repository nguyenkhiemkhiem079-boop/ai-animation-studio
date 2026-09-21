/**
 * PipelineStep implementation for Story Intelligence.
 */

import { PipelineStep, PipelineContext } from '../pipeline/index.js';
import { SourceDocumentManager } from './source-document-manager.js';
import { RuleBasedStoryAnalyzer, IStoryAnalyzer } from './story-analyzer.js';
import { UniverseManager } from '../universe/universe-manager.js';
import { ValidationError } from '../errors/index.js';

export interface StoryIntelligenceStepOptions {
  analyzer?: IStoryAnalyzer;
  saveCheckpointAfter?: boolean;
}

export function createStoryIntelligenceStep(options: StoryIntelligenceStepOptions = {}): PipelineStep {
  const analyzer = options.analyzer ?? new RuleBasedStoryAnalyzer();

  return {
    id: 'story_intelligence',
    name: 'Story Intelligence & Source Analysis',
    description: 'Losslessly ingests source text, extracts narrative beats, scenes, candidates, and checks canon conflicts.',
    saveCheckpointAfter: options.saveCheckpointAfter ?? true,
    run: async (context: PipelineContext): Promise<Record<string, unknown>> => {
      const rawText = (context.state.rawScript || context.state.sourceContent || context.state.script || context.state.sourceText) as string;
      if (!rawText || typeof rawText !== 'string') {
        throw new ValidationError('Pipeline state must include "rawScript", "sourceContent", or "sourceText" string to run Story Intelligence');
      }

      const title = (context.state.scriptTitle as string) || 'Untitled Production';
      const seriesId = (context.state.seriesId as string) || 'default_series';

      context.logger.info(`Ingesting source document: "${title}" (${rawText.length} chars)`);
      const sourceDoc = SourceDocumentManager.createSourceDocument(context.projectId, title, rawText);

      const universeManager = new UniverseManager(context.storage);
      const universe = await universeManager.getOrCreateUniverse(seriesId);

      context.logger.info('Analyzing story with RuleBasedStoryAnalyzer...');
      const analysis = await analyzer.analyze(sourceDoc, universe);

      context.logger.info(
        `Story analysis complete: ${analysis.sceneCandidates.length} scenes, ${analysis.characterCandidates.length} characters, coverage ${analysis.coverage.coveragePercentage}%`
      );

      return {
        sourceDocument: sourceDoc,
        storyAnalysis: analysis,
        sceneCount: analysis.sceneCandidates.length,
        characterCandidateCount: analysis.characterCandidates.length,
      };
    },
  };
}
