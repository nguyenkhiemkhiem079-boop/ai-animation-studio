/**
 * SourceDocumentManager: Ingests raw story content losslessly,
 * produces character-offset segments, and guarantees 100% text reconstruction.
 */

import { computeSha256 } from '../storage/index.js';
import {
  SourceDocument,
  SourceDocumentSchema,
  SourceSegment,
  SourceTraceability,
} from '../domain/story.js';
import { ValidationError } from '../errors/index.js';

export class SourceDocumentManager {
  /**
   * Ingests raw content into a lossless SourceDocument with segment boundaries and SHA-256 hashes.
   */
  public static createSourceDocument(
    projectId: string,
    title: string,
    rawContent: string,
    options: { documentId?: string } = {}
  ): SourceDocument {
    if (typeof rawContent !== 'string') {
      throw new ValidationError('Source document rawContent must be a string');
    }

    const documentId = options.documentId ?? `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const contentHash = computeSha256(rawContent);

    // Segment by paragraphs / double newlines or single newlines, preserving all whitespace verbatim
    const segments: SourceSegment[] = [];
    let currentIndex = 0;

    // Regex that splits on double or single newlines while keeping them attached to segments
    // or standard chunking:
    const regex = /([^\r\n]*(?:\r?\n|$))/g;
    let match: RegExpExecArray | null;
    let segmentIndex = 0;

    while ((match = regex.exec(rawContent)) !== null) {
      const text = match[0];
      if (text.length === 0) {
        // end of string
        break;
      }

      const charStart = currentIndex;
      const charEnd = charStart + text.length;
      currentIndex = charEnd;

      segments.push({
        index: segmentIndex++,
        text,
        charStart,
        charEnd,
        hash: computeSha256(text),
      });
    }

    // Fallback if empty
    if (segments.length === 0 && rawContent.length === 0) {
      segments.push({
        index: 0,
        text: '',
        charStart: 0,
        charEnd: 0,
        hash: computeSha256(''),
      });
    }

    const wordCount = rawContent.trim() ? rawContent.trim().split(/\s+/).length : 0;

    const document: SourceDocument = {
      id: documentId,
      projectId,
      title,
      rawContent,
      contentHash,
      segments,
      wordCount,
      isPreserveOriginal: true,
      createdAt: new Date().toISOString(),
    };

    const validated = SourceDocumentSchema.parse(document);

    // Assert lossless guarantee
    if (!this.verifyLosslessReconstruction(validated)) {
      throw new ValidationError('Critical error: SourceDocument failed lossless reconstruction check');
    }

    return validated;
  }

  /**
   * Verifies that joining all segments produces the exact raw content verbatim (byte-for-byte).
   */
  public static verifyLosslessReconstruction(doc: SourceDocument): boolean {
    const reconstructed = doc.segments.map((s) => s.text).join('');
    return reconstructed === doc.rawContent;
  }

  /**
   * Generates a SourceTraceability pointer for an arbitrary character range in the document.
   */
  public static createTraceabilityPointer(
    doc: SourceDocument,
    charStart: number,
    charEnd: number
  ): SourceTraceability {
    if (charStart < 0 || charEnd > doc.rawContent.length || charStart > charEnd) {
      throw new ValidationError(
        `Invalid character range [${charStart}, ${charEnd}] for document length ${doc.rawContent.length}`
      );
    }

    // Find enclosing segment index
    const segments = doc.segments ?? [];
    const seg = segments.find((s) => charStart >= s.charStart && charStart < s.charEnd) ?? segments[0];
    const sliceText = doc.rawContent.slice(charStart, charEnd);

    return {
      documentId: doc.id,
      segmentIndex: seg ? seg.index : 0,
      charStart,
      charEnd,
      contentHash: computeSha256(sliceText),
    };
  }
}
