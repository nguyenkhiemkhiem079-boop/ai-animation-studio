---
name: story-coverage
description: Source coverage and hallucination detection skill. Measures what percentage of source text is mapped to scenes/beats and detects ungrounded extractions.
version: 1.0.0
category: story
---

# Story Coverage & Hallucination Guard Skill (`story-coverage`)

Use this skill to ensure comprehensive narrative mapping and prevent phantom/hallucinated entities.

---

## 📊 Coverage Calculation

- Computes the union of all character ranges `[charStart, charEnd]` referenced by scenes, dialogue, beats, and candidates.
- `coveragePercentage = (coveredCharacters / totalCharacters) * 100`.
- Identifies unmapped paragraphs and passages in `uncoveredRanges`.

## 🛡️ Hallucination Guard

- Verifies every `SourceTraceability` reference against the raw document:
  - `0 <= charStart < charEnd <= doc.rawContent.length`.
  - `computeSha256(doc.rawContent.slice(charStart, charEnd)) === trace.contentHash`.
- Flags any candidate without source evidence in `ungroundedEntities`.
