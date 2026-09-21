---
name: source-preservation
description: Source preservation and evidence linking skill. Enforces lossless user content storage and evidence pointers for all derived narrative elements.
version: 1.0.0
category: story
---

# Source Preservation Skill (`source-preservation`)

Use this skill to protect user source text and maintain complete traceability across the pipeline.

---

## 📜 Non-Negotiable Tenets

1. **User Source is Truth**: The user's script or story text must never be mutated, rewritten, or truncated.
2. **Lossless Segmentation**: The original document must always be reconstructible verbatim from its segments (`verifyLosslessReconstruction`).
3. **Evidence for Every Claim**: Every extracted beat, dialogue line, or character candidate must store a `SourceTraceability` object containing:
   - `documentId`
   - `segmentIndex`
   - `charStart` and `charEnd` offsets
   - `contentHash` (SHA-256 of the cited slice)
4. **Candidate != Canon**: Extracting a character or location does not modify Canon until user or QA validation promotes it.
5. **Analysis != Source**: Storing a narrative analysis does not replace or mutate the underlying source text.
