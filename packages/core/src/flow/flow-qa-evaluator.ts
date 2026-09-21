import { ShotContract } from '../domain/director.js';
import { FlowImportProvenance } from './flow-result-importer.js';
import { FlowProductionPackageV1 } from './flow-types.js';
import { StudioError } from '../errors/index.js';

export type FlowQASeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type FlowQAResultStatus = 'PASS' | 'WARN' | 'FAIL';

export interface FlowQAIssue {
  dimension:
    | 'SOURCE_FIDELITY'
    | 'CHARACTER_IDENTITY'
    | 'OUTFIT_CONTINUITY'
    | 'LOCATION_CONTINUITY'
    | 'PROP_CONTINUITY'
    | 'ACTION_FIDELITY'
    | 'SHOT_INTENT'
    | 'CAMERA_INTENT'
    | 'UNSUPPORTED_EVENT'
    | 'FIRST_FRAME_CONTINUITY'
    | 'LAST_FRAME_CONTINUITY';
  severity: FlowQASeverity;
  message: string;
  details?: string;
}

export interface FlowQAReport {
  reportId: string;
  shotId: string;
  candidateAssetId: string;
  evaluatedAt: string;
  overallStatus: FlowQAResultStatus;
  score: number; // 0 to 100
  canApprove: boolean;
  issues: FlowQAIssue[];
  unsupportedEventsDetected: string[];
  recommendations: string[];
}

export interface EvaluateFlowCandidateInput {
  shot: ShotContract;
  package?: FlowProductionPackageV1;
  provenance: FlowImportProvenance;
  candidateAssetId: string;
  durationToleranceSeconds?: number;
  unsupportedEventKeywords?: string[];
}

export class FlowQAEvaluator {
  /**
   * Performs deterministic & semantic QA verification on an imported Google Flow candidate clip.
   */
  public evaluate(input: EvaluateFlowCandidateInput): FlowQAReport {
    const issues: FlowQAIssue[] = [];
    const recommendations: string[] = [];
    let score = 100;

    const tolerance = input.durationToleranceSeconds ?? 2.0;
    const targetDuration = input.shot.frame.durationSeconds || 4.0;
    const actualDuration = input.provenance.durationSeconds;

    // 1. Source Fidelity: Duration
    const durationDelta = Math.abs(actualDuration - targetDuration);
    if (actualDuration <= 0) {
      issues.push({
        dimension: 'SOURCE_FIDELITY',
        severity: 'CRITICAL',
        message: `Video duration is zero or unreadable (${actualDuration}s).`,
      });
      score -= 50;
    } else if (durationDelta > tolerance * 3) {
      issues.push({
        dimension: 'SOURCE_FIDELITY',
        severity: 'CRITICAL',
        message: `Severe duration deviation: video (${actualDuration.toFixed(1)}s) deviates from target (${targetDuration}s) by >${(tolerance * 3).toFixed(1)}s.`,
      });
      score -= 50;
    } else if (durationDelta > tolerance) {
      issues.push({
        dimension: 'SOURCE_FIDELITY',
        severity: 'WARNING',
        message: `Video duration (${actualDuration.toFixed(1)}s) deviates from target (${targetDuration}s) by >${tolerance}s.`,
      });
      score -= 15;
      recommendations.push(`Trim or extend video in timeline to align with target ${targetDuration}s.`);
    }

    // 2. Video Stream & Codec
    if (!input.provenance.videoCodec) {
      issues.push({
        dimension: 'SOURCE_FIDELITY',
        severity: 'CRITICAL',
        message: 'No video codec recognized by FFprobe.',
      });
      score -= 50;
    }

    // 3. Unsupported / Hallucinated Event Check
    const forbiddenKeywords = input.unsupportedEventKeywords || [
      'ma quỷ', 'ghost', 'cửa đóng', 'door closing', 'chạm vào nến', 'touching candle',
      'tấn công', 'attack', 'la hét', 'scream', 'explosion', 'nổ tung',
    ];
    const notesText = (input.provenance.notes || '').toLowerCase();
    const unsupportedDetected: string[] = [];

    for (const kw of forbiddenKeywords) {
      if (notesText.includes(kw.toLowerCase())) {
        unsupportedDetected.push(kw);
      }
    }

    if (unsupportedDetected.length > 0) {
      issues.push({
        dimension: 'UNSUPPORTED_EVENT',
        severity: 'CRITICAL',
        message: `Detected unsupported narrative events in generated output notes: [${unsupportedDetected.join(', ')}]`,
      });
      score -= 40;
      recommendations.push('Regenerate shot in Google Flow with stricter negative prompt directives.');
    }

    // 4. Character Continuity
    const characterRefs = (input.package?.references || []).filter(
      (r) => r.role === 'CHARACTER_IDENTITY'
    );
    if (characterRefs.length > 0 && !input.provenance.resolution) {
      issues.push({
        dimension: 'CHARACTER_IDENTITY',
        severity: 'WARNING',
        message: 'Could not verify visual clarity/resolution for character identity anchors.',
      });
      score -= 10;
    }

    // Determine Overall Status
    const hasCritical = issues.some((i) => i.severity === 'CRITICAL');
    const hasWarning = issues.some((i) => i.severity === 'WARNING');

    let overallStatus: FlowQAResultStatus = 'PASS';
    if (hasCritical || score < 50) {
      overallStatus = 'FAIL';
    } else if (hasWarning || score < 85) {
      overallStatus = 'WARN';
    }

    const canApprove = overallStatus !== 'FAIL';

    return {
      reportId: `qa_flow_${input.shot.id}_${Date.now()}`,
      shotId: input.shot.id,
      candidateAssetId: input.candidateAssetId,
      evaluatedAt: new Date().toISOString(),
      overallStatus,
      score: Math.max(0, Math.min(100, score)),
      canApprove,
      issues,
      unsupportedEventsDetected: unsupportedDetected,
      recommendations,
    };
  }

  /**
   * Enforces approval safety gate.
   * Throws StudioError if user attempts to approve a candidate that failed QA.
   */
  public assertCanApprove(report: FlowQAReport): void {
    if (!report.canApprove || report.overallStatus === 'FAIL') {
      throw new StudioError(
        `Cannot approve Google Flow candidate "${report.candidateAssetId}": Candidate failed QA with status "${report.overallStatus}" (Score: ${report.score}/100). Critical issues: ${report.issues.filter(i => i.severity === 'CRITICAL').map(i => i.message).join('; ')}`,
        'FLOW_APPROVAL_FAILED_QA',
        { report }
      );
    }
  }
}
