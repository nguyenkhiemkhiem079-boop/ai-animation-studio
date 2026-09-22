import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene, ShotContract } from '../domain/director.js';
import { TimelineSequence } from '../domain/timeline.js';
import { ContinuityQAReport } from '../domain/qa.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { ContinuityQAEvaluator } from './continuity-qa-evaluator.js';
import { AutoRepairEngine } from './auto-repair-engine.js';

export interface ContinuityQAStepSummary {
  reportId: string;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  repairedActions: number;
  overallPassed: boolean;
  [key: string]: unknown;
}

export class ContinuityQAPipelineStep implements PipelineStep {
  public readonly id = 'continuity_qa_step';
  public readonly name = 'Continuity QA & Auto-Repair';
  public readonly description =
    'Audits shot-to-shot boundaries and timeline synchronization for 180-degree rule, lighting jumps, wardrobe mismatches, and lip-sync desync, applying automated repairs.';
  public readonly saveCheckpointAfter = true;

  constructor(
    private autoRepair: boolean = true,
    private assetRegistry?: IAssetRegistry
  ) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;
    const projectId = (state.projectId as string) || 'default_project';

    logger.info('Starting Continuity QA & Auto-Repair step...', { projectId });

    // 1. Gather Shots & TimelineSequence
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    let shots: ShotContract[] = (state.shotContracts as ShotContract[]) || [];

    if (shots.length === 0 && productionScenes && Array.isArray(productionScenes)) {
      for (const sc of productionScenes) {
        if (sc.shots && Array.isArray(sc.shots)) {
          shots.push(...sc.shots);
        }
      }
    }

    const timelineSequence = state.timelineSequence as TimelineSequence | undefined;

    // 2. Run Continuity Evaluation
    const report = ContinuityQAEvaluator.evaluate({
      projectId,
      sceneId: (state.activeSceneId as string) || productionScenes?.[0]?.id,
      shots,
      timelineSequence,
    });

    // Merge in any defects from Visual Semantic QA step if present
    const visualQAReports = state.visualQAReports as any[] | undefined;
    if (visualQAReports && visualQAReports.length > 0) {
      for (const vReport of visualQAReports) {
        if (vReport.defects && Array.isArray(vReport.defects)) {
          for (const defect of vReport.defects) {
            // Identity drift and visual artifacts are NEVER auto-repairable via simple editorial transition
            const isAutoRepairable =
              defect.severity !== 'critical' &&
              (defect.issueType === 'color_palette_drift' || defect.issueType === 'pacing_stalling');

            report.issues.push({
              issueId: defect.defectId,
              shotId: vReport.shotId,
              type: defect.issueType,
              severity: defect.severity,
              message: `[Visual Semantic QA] ${defect.description}`,
              suggestedFix: defect.suggestedFix,
              autoRepairable: isAutoRepairable,
              isResolved: false,
              metadata: {
                region: defect.region,
                confidence: defect.confidence,
                frameIndex: defect.frameIndex,
                timestampSeconds: defect.timestampSeconds,
              },
            });
          }
        }
      }
    }

    logger.info(`Continuity QA found ${report.issues.length} issue(s).`, {
      issuesCount: report.issues.length,
      overallPassed: report.overallPassed,
    });

    let finalReport: ContinuityQAReport = report;
    let repairedSequence = timelineSequence;
    let repairedShots = shots;

    // 3. Apply Auto-Repairs if enabled and timeline sequence exists
    if (this.autoRepair && timelineSequence && report.issues.length > 0) {
      const repairResult = AutoRepairEngine.repair({
        report,
        timelineSequence,
        shots,
      });

      repairedSequence = repairResult.repairedSequence;
      repairedShots = repairResult.repairedShots;

      finalReport = {
        ...report,
        issues: repairResult.remainingIssues,
        repairActions: repairResult.appliedActions,
        overallPassed: !repairResult.remainingIssues.some((i) => i.severity === 'critical'),
      };

      logger.info(`Applied ${repairResult.appliedActions.length} auto-repair action(s).`, {
        appliedCount: repairResult.appliedActions.length,
      });
    }

    // 4. Register QA Report Asset in AssetRegistry if available
    if (this.assetRegistry) {
      const seriesId = (state.seriesId as string) || 'default_series';
      await this.assetRegistry.register({
        id: `ASSET_QA_${finalReport.reportId}`,
        seriesId,
        type: 'qa_report',
        status: 'approved_canon',
        name: `Continuity QA Report [${projectId}]`,
        contentHash: `hash_qa_${finalReport.reportId}`,
        storageUri: `.studio/qa/${finalReport.reportId}.json`,
        mimeType: 'application/json',
        sizeBytes: JSON.stringify(finalReport).length,
        version: 1,
        tags: ['qa', 'continuity', projectId],
        metadata: {
          reportId: finalReport.reportId,
          totalIssues: finalReport.issues.length,
          overallPassed: finalReport.overallPassed,
        },
      });
    }

    // 5. Update pipeline state
    state.continuityReport = finalReport;
    if (repairedSequence) state.timelineSequence = repairedSequence;
    state.shotContracts = repairedShots;

    const criticalCount = finalReport.issues.filter((i) => i.severity === 'critical').length;
    const warningCount = finalReport.issues.filter((i) => i.severity === 'warning').length;

    const summary: ContinuityQAStepSummary = {
      reportId: finalReport.reportId,
      totalIssues: finalReport.issues.length,
      criticalIssues: criticalCount,
      warningIssues: warningCount,
      repairedActions: finalReport.repairActions.length,
      overallPassed: finalReport.overallPassed,
    };

    logger.info('Continuity QA & Auto-Repair step completed.', summary);

    return {
      report: finalReport,
      summary,
    };
  }
}
