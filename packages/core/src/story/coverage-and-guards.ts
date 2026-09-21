/**
 * Source Coverage Calculation and Hallucination Guard for Story Intelligence.
 */

import { computeSha256 } from '../storage/index.js';
import {
  SourceDocument,
  SourceCoverage,
  SourceCoverageSchema,
  HallucinationGuardReport,
  HallucinationGuardReportSchema,
  SourceTraceability,
  SceneCandidate,
  CharacterCandidate,
  LocationCandidate,
  PropCandidate,
  NarrativeBeat,
} from '../domain/story.js';

export class CoverageAndGuards {
  /**
   * Computes the exact character coverage of the source document by extracted scenes, beats, and dialogue.
   */
  public static calculateCoverage(
    doc: SourceDocument,
    items: {
      scenes?: SceneCandidate[];
      beats?: NarrativeBeat[];
      characters?: CharacterCandidate[];
      locations?: LocationCandidate[];
      props?: PropCandidate[];
    }
  ): SourceCoverage {
    const rawLen = doc.rawContent.length;
    if (rawLen === 0) {
      return SourceCoverageSchema.parse({
        coveragePercentage: 100,
        totalCharacters: 0,
        coveredCharacters: 0,
        coveredRanges: [],
        uncoveredRanges: [],
      });
    }

    const ranges: [number, number][] = [];

    // Collect ranges from all traces
    const collectTrace = (trace?: SourceTraceability) => {
      if (trace && trace.charEnd > trace.charStart) {
        ranges.push([trace.charStart, trace.charEnd]);
      }
    };

    if (items.scenes) {
      for (const sc of items.scenes) {
        sc.sourceTrace.forEach(collectTrace);
        sc.beats.forEach((b) => collectTrace(b.sourceTrace));
        sc.dialogueLines.forEach((d) => collectTrace(d.sourceTrace));
        sc.narrationLines.forEach((n) => collectTrace(n.sourceTrace));
      }
    }

    if (items.beats) {
      items.beats.forEach((b) => collectTrace(b.sourceTrace));
    }

    if (items.characters) {
      for (const char of items.characters) {
        char.sourceTrace.forEach(collectTrace);
      }
    }

    if (items.locations) {
      for (const loc of items.locations) {
        loc.sourceTrace.forEach(collectTrace);
      }
    }

    if (items.props) {
      for (const prop of items.props) {
        prop.sourceTrace.forEach(collectTrace);
      }
    }

    // Merge overlapping intervals
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];

    for (const [start, end] of ranges) {
      const clampedStart = Math.max(0, Math.min(start, rawLen));
      const clampedEnd = Math.max(clampedStart, Math.min(end, rawLen));

      if (merged.length === 0) {
        merged.push([clampedStart, clampedEnd]);
      } else {
        const last = merged[merged.length - 1];
        if (clampedStart <= last[1]) {
          last[1] = Math.max(last[1], clampedEnd);
        } else {
          merged.push([clampedStart, clampedEnd]);
        }
      }
    }

    // Calculate covered character count
    let coveredCount = 0;
    for (const [start, end] of merged) {
      coveredCount += end - start;
    }

    // Find uncovered intervals
    const uncovered: [number, number][] = [];
    let currentPos = 0;

    for (const [start, end] of merged) {
      if (start > currentPos) {
        uncovered.push([currentPos, start]);
      }
      currentPos = Math.max(currentPos, end);
    }
    if (currentPos < rawLen) {
      uncovered.push([currentPos, rawLen]);
    }

    const percentage = Number(((coveredCount / rawLen) * 100).toFixed(2));

    return SourceCoverageSchema.parse({
      coveragePercentage: percentage,
      totalCharacters: rawLen,
      coveredCharacters: coveredCount,
      coveredRanges: merged,
      uncoveredRanges: uncovered,
    });
  }

  /**
   * Validates all source traces against the real source document to guard against hallucinated text and offsets.
   */
  public static validateHallucinationGuard(
    doc: SourceDocument,
    items: {
      scenes?: SceneCandidate[];
      beats?: NarrativeBeat[];
      characters?: CharacterCandidate[];
      locations?: LocationCandidate[];
      props?: PropCandidate[];
    }
  ): HallucinationGuardReport {
    const violations: HallucinationGuardReport['violations'] = [];
    const ungroundedEntities: string[] = [];

    const verifyTrace = (entityType: string, entityId: string, trace: SourceTraceability) => {
      if (trace.documentId !== doc.id) {
        violations.push({
          entityType,
          entityId,
          reason: `Trace references document ID "${trace.documentId}" instead of "${doc.id}"`,
          invalidOffset: { charStart: trace.charStart, charEnd: trace.charEnd },
        });
        return;
      }

      if (trace.charStart < 0 || trace.charEnd > doc.rawContent.length || trace.charStart > trace.charEnd) {
        violations.push({
          entityType,
          entityId,
          reason: `Character range [${trace.charStart}, ${trace.charEnd}] is out of bounds (document length ${doc.rawContent.length})`,
          invalidOffset: { charStart: trace.charStart, charEnd: trace.charEnd },
        });
        return;
      }

      const actualSlice = doc.rawContent.slice(trace.charStart, trace.charEnd);
      const computedHash = computeSha256(actualSlice);
      if (computedHash !== trace.contentHash) {
        violations.push({
          entityType,
          entityId,
          reason: `Content hash mismatch for slice "${actualSlice.slice(0, 30)}...": expected ${trace.contentHash}, got ${computedHash}`,
          invalidOffset: { charStart: trace.charStart, charEnd: trace.charEnd },
        });
      }
    };

    if (items.characters) {
      for (const char of items.characters) {
        if (!char.sourceTrace || char.sourceTrace.length === 0) {
          ungroundedEntities.push(`character:${char.suggestedName}`);
        } else {
          char.sourceTrace.forEach((t) => verifyTrace('character', char.candidateId, t));
        }
      }
    }

    if (items.locations) {
      for (const loc of items.locations) {
        if (!loc.sourceTrace || loc.sourceTrace.length === 0) {
          ungroundedEntities.push(`location:${loc.suggestedName}`);
        } else {
          loc.sourceTrace.forEach((t) => verifyTrace('location', loc.candidateId, t));
        }
      }
    }

    if (items.props) {
      for (const prop of items.props) {
        if (!prop.sourceTrace || prop.sourceTrace.length === 0) {
          ungroundedEntities.push(`prop:${prop.suggestedName}`);
        } else {
          prop.sourceTrace.forEach((t) => verifyTrace('prop', prop.candidateId, t));
        }
      }
    }

    if (items.scenes) {
      for (const sc of items.scenes) {
        sc.sourceTrace.forEach((t) => verifyTrace('scene', sc.id, t));
        sc.beats.forEach((b) => verifyTrace('beat', b.id, b.sourceTrace));
        sc.dialogueLines.forEach((d) => verifyTrace('dialogue', `${sc.id}:${d.speaker}`, d.sourceTrace));
        sc.narrationLines.forEach((n) => verifyTrace('narration', sc.id, n.sourceTrace));
      }
    }

    return HallucinationGuardReportSchema.parse({
      isValid: violations.length === 0 && ungroundedEntities.length === 0,
      violations,
      ungroundedEntities,
    });
  }
}
