import { describe, it, expect } from 'vitest';
import {
  SourceDocumentManager,
  CoverageAndGuards,
  SceneCandidate,
} from '../src/index.js';

describe('Coverage & Hallucination Guard', () => {
  const text = 'Scene one starts here. Minh discovers the hidden artifact. Scene ends.';

  it('calculates coverage percentage and detects uncovered ranges', () => {
    const doc = SourceDocumentManager.createSourceDocument('p1', 'T1', text);

    // Range 1: chars 0 to 22 ("Scene one starts here.")
    const trace1 = SourceDocumentManager.createTraceabilityPointer(doc, 0, 22);

    const scenes: SceneCandidate[] = [
      {
        id: 'SC_01',
        sceneNumber: 1,
        heading: 'SCENE 1',
        locationName: 'Room',
        charactersPresent: [],
        beats: [],
        dialogueLines: [],
        narrationLines: [],
        sourceTrace: [trace1],
      },
    ];

    const coverage = CoverageAndGuards.calculateCoverage(doc, { scenes });
    expect(coverage.coveredCharacters).toBe(22);
    expect(coverage.totalCharacters).toBe(text.length);
    expect(coverage.coveragePercentage).toBeCloseTo((22 / text.length) * 100, 1);
    expect(coverage.uncoveredRanges).toEqual([[22, text.length]]);
  });

  it('passes hallucination guard for valid traces', () => {
    const doc = SourceDocumentManager.createSourceDocument('p1', 'T1', text);
    const trace = SourceDocumentManager.createTraceabilityPointer(doc, 23, 58); // "Minh discovers the hidden artifact."

    const report = CoverageAndGuards.validateHallucinationGuard(doc, {
      characters: [
        {
          candidateId: 'C1',
          suggestedName: 'Minh',
          mentionCount: 1,
          traits: [],
          sourceTrace: [trace],
        },
      ],
    });

    expect(report.isValid).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('detects hallucination violations on out of bounds or corrupted hash', () => {
    const doc = SourceDocumentManager.createSourceDocument('p1', 'T1', text);

    // Corrupted hash
    const fakeTrace = {
      documentId: doc.id,
      segmentIndex: 0,
      charStart: 0,
      charEnd: 10,
      contentHash: 'corrupted_hash_value',
    };

    const report = CoverageAndGuards.validateHallucinationGuard(doc, {
      characters: [
        {
          candidateId: 'C_FAKE',
          suggestedName: 'Phantom Character',
          mentionCount: 1,
          traits: [],
          sourceTrace: [fakeTrace],
        },
      ],
    });

    expect(report.isValid).toBe(false);
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.violations[0].reason).toContain('Content hash mismatch');
  });

  it('flags ungrounded entities without source traces', () => {
    const doc = SourceDocumentManager.createSourceDocument('p1', 'T1', text);

    const report = CoverageAndGuards.validateHallucinationGuard(doc, {
      characters: [
        {
          candidateId: 'C_UNGROUNDED',
          suggestedName: 'Ghost Entity',
          mentionCount: 1,
          traits: [],
          sourceTrace: [], // empty!
        },
      ],
    });

    expect(report.isValid).toBe(false);
    expect(report.ungroundedEntities).toContain('character:Ghost Entity');
  });
});
