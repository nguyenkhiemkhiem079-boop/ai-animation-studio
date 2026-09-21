import { describe, it, expect } from 'vitest';
import { SourceDocumentManager } from '../src/index.js';

describe('SourceDocumentManager & Lossless Preservation', () => {
  const sampleScript = `INT. OLD HOUSE - LIVING ROOM - NIGHT

Rain lashes against the shattered window pane.
A shadow flickers across the wooden altar.

MINH:
Is anyone here?

LAN:
Don't move, Minh. Look at the floor.

An ancient jade amulet rests near the incense burner.`;

  it('ingests raw text losslessly and verifies byte-for-byte reconstruction', () => {
    const doc = SourceDocumentManager.createSourceDocument('proj_001', 'Episode 1 Script', sampleScript);

    expect(doc.id).toBeDefined();
    expect(doc.rawContent).toBe(sampleScript);
    expect(doc.contentHash).toBeDefined();
    expect(doc.isPreserveOriginal).toBe(true);

    // Assert lossless reconstruction
    const isLossless = SourceDocumentManager.verifyLosslessReconstruction(doc);
    expect(isLossless).toBe(true);
  });

  it('creates accurate character-offset segments with distinct hashes', () => {
    const doc = SourceDocumentManager.createSourceDocument('proj_001', 'Test', sampleScript);

    expect(doc.segments.length).toBeGreaterThan(1);

    for (const seg of doc.segments) {
      expect(seg.charEnd).toBeGreaterThanOrEqual(seg.charStart);
      const slice = doc.rawContent.slice(seg.charStart, seg.charEnd);
      expect(slice).toBe(seg.text);
      expect(seg.hash).toBeDefined();
    }
  });

  it('creates valid traceability pointers into the source document', () => {
    const doc = SourceDocumentManager.createSourceDocument('proj_001', 'Test', sampleScript);
    const charStart = sampleScript.indexOf('MINH:');
    const charEnd = charStart + 5;

    const trace = SourceDocumentManager.createTraceabilityPointer(doc, charStart, charEnd);
    expect(trace.documentId).toBe(doc.id);
    expect(trace.charStart).toBe(charStart);
    expect(trace.charEnd).toBe(charEnd);

    const slice = doc.rawContent.slice(trace.charStart, trace.charEnd);
    expect(slice).toBe('MINH:');
  });

  it('throws on invalid character ranges out of bounds', () => {
    const doc = SourceDocumentManager.createSourceDocument('proj_001', 'Test', 'Short text');
    expect(() => SourceDocumentManager.createTraceabilityPointer(doc, 0, 100)).toThrow();
    expect(() => SourceDocumentManager.createTraceabilityPointer(doc, 10, 5)).toThrow();
  });
});
