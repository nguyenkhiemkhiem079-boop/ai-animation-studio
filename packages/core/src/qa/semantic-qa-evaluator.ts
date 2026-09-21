/**
 * SemanticQAEvaluator: Uses LLM reasoning (such as Gemini) to perform semantic QA
 * alongside deterministic QA, distinguishing deterministic checks from LLM checks.
 */

import { ShotContract } from '../domain/director.js';
import { SourceDocument, StoryAnalysis } from '../domain/story.js';
import { ContinuityCheckResult, ContinuityQAReport } from '../domain/qa.js';
import { LLMProvider } from '../llm/llm-provider.js';
import {
  CONTINUITY_QA_PROMPT_V1,
  ContinuityQAOutputSchema,
  ContinuityQAOutput,
} from '../llm/prompts/continuity-qa.js';
import { ContinuityQAEvaluator as DeterministicQAEvaluator, EvaluateContinuityOptions } from './continuity-qa-evaluator.js';

export interface SemanticQAOptions {
  sourceDoc?: SourceDocument;
  storyAnalysis?: StoryAnalysis;
  shots: ShotContract[];
  projectId: string;
  sceneId?: string;
  seriesId?: string;
}

export interface CombinedQAReport extends ContinuityQAReport {
  deterministicIssuesCount: number;
  semanticIssuesCount: number;
  sourceFidelityScore?: number;
  inventedEventsDetected?: string[];
}

export class SemanticQAEvaluator {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  /**
   * Evaluates semantic narrative continuity, dialogue preservation, and source fidelity
   * using LLM while preserving deterministic QA results and tracking provenance.
   */
  public async evaluate(options: SemanticQAOptions): Promise<CombinedQAReport> {
    const { sourceDoc, storyAnalysis, shots, projectId, sceneId, seriesId } = options;

    // 1. Run deterministic QA first
    const deterministicReport = DeterministicQAEvaluator.evaluate({
      projectId,
      sceneId,
      shots,
    });

    // Mark deterministic issues with provenance
    const deterministicIssues: ContinuityCheckResult[] = deterministicReport.issues.map((iss) => ({
      ...iss,
      metadata: {
        ...iss.metadata,
        qaMechanism: 'DETERMINISTIC',
      },
    }));

    // 2. Run LLM Semantic QA
    const shotSummaries = shots.map((s) => ({
      shotNumber: s.shotNumber,
      purpose: s.purpose,
      camera: `${s.camera.shotSize} / ${s.camera.angle} / ${s.camera.movement}`,
      acting: s.acting.map((a) => `${a.characterId}: ${a.actionPrompt || a.dialogueLine || a.expression}`).join('; '),
      lighting: `${s.lighting.mood} (${s.lighting.colorTemperature})`,
    }));

    const result = await this.llm.generateStructured<ContinuityQAOutput>({
      taskType: 'CONTINUITY_QA',
      systemInstruction: CONTINUITY_QA_PROMPT_V1.systemInstruction,
      prompt: CONTINUITY_QA_PROMPT_V1.buildPrompt({
        sourceText: sourceDoc?.rawContent || (storyAnalysis ? JSON.stringify(storyAnalysis.sceneCandidates) : 'N/A'),
        shots: shotSummaries,
        storySummary: storyAnalysis?.review?.summary,
      }),
      responseSchema: ContinuityQAOutputSchema,
      schemaName: 'ContinuityQAOutput',
      projectId,
      seriesId,
      metadata: {
        promptVersion: CONTINUITY_QA_PROMPT_V1.version,
      },
    });

    const semanticOutput = result.data;
    const semanticIssues: ContinuityCheckResult[] = [];

    // Map semantic issues to domain ContinuityCheckResult with explicit LLM_SEMANTIC provenance
    for (const [idx, item] of semanticOutput.issues.entries()) {
      // Map issue type to domain enum
      let type: ContinuityCheckResult['type'] = 'screen_direction_180';
      if (item.type.includes('lighting')) type = 'lighting_jump';
      else if (item.type.includes('prop')) type = 'prop_persistence';
      else if (item.type.includes('wardrobe') || item.type.includes('costume')) type = 'wardrobe_mismatch';
      else if (item.type.includes('pacing')) type = 'pacing_stalling';
      else if (item.type.includes('audio')) type = 'lip_sync_desync';

      semanticIssues.push({
        issueId: `sem_iss_${idx + 1}_${Date.now()}`,
        shotId: item.shotId || (shots[0] ? shots[0].id : 'SHOT_01'),
        type,
        severity: item.severity as any,
        message: `[LLM Semantic] ${item.description}`,
        suggestedFix: item.suggestedFix,
        autoRepairable: false,
        metadata: {
          qaMechanism: 'LLM_SEMANTIC',
          rawType: item.type,
          provider: this.llm.metadata.name,
        },
      });
    }

    // Add invented events as critical or warning issues if any were detected
    if (semanticOutput.inventedEvents && semanticOutput.inventedEvents.length > 0) {
      for (const [idx, invented] of semanticOutput.inventedEvents.entries()) {
        semanticIssues.push({
          issueId: `sem_invented_${idx + 1}_${Date.now()}`,
          shotId: shots[0] ? shots[0].id : 'SHOT_01',
          type: 'pacing_stalling',
          severity: 'warning',
          message: `[LLM Semantic - Source Violation] Unsupported event detected: "${invented}"`,
          suggestedFix: 'Remove unsupported events that do not trace to original source document.',
          autoRepairable: false,
          metadata: {
            qaMechanism: 'LLM_SEMANTIC',
            sourceViolation: true,
            inventedEvent: invented,
          },
        });
      }
    }

    const allIssues = [...deterministicIssues, ...semanticIssues];
    const hasCritical = allIssues.some((iss) => iss.severity === 'critical');

    return {
      reportId: `combined_qa_${sceneId ?? projectId}_${Date.now()}`,
      projectId,
      sceneId,
      issues: allIssues,
      repairActions: deterministicReport.repairActions,
      overallPassed: !hasCritical,
      evaluatedAt: new Date().toISOString(),
      deterministicIssuesCount: deterministicIssues.length,
      semanticIssuesCount: semanticIssues.length,
      sourceFidelityScore: semanticOutput.sourceFidelityScore,
      inventedEventsDetected: semanticOutput.inventedEvents,
    };
  }
}
