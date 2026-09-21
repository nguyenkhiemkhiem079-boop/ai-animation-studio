---
name: story-analyze
description: Screenplay and prose story analysis skill. Extracts scene headings, dialogue lines, character candidates, location candidates, and narrative beats with exact source traceability.
version: 1.0.0
category: story
---

# Story Analysis Skill (`story-analyze`)

Use this skill to guide the extraction of narrative beats, scenes, and candidates from user-provided stories.

---

## 📖 Extraction Protocol

1. **Ingest Losslessly**: Always use `SourceDocumentManager.createSourceDocument()` to ensure byte-for-byte fidelity and content hashing.
2. **Scene Heading Parsing**: Detect `INT.` / `EXT.` boundaries, time of day (`day`, `night`, `dawn`, `dusk`), and primary location names.
3. **Dialogue Extraction**: Isolate speaker names and dialogue text, attaching exact `SourceTraceability` character offsets.
4. **Candidate Separation**:
   - Extract character candidates with mention counts and sample dialogue.
   - Extract location candidates with detected zones.
   - Extract prop candidates.
   - **Rule**: Never overwrite Canon with Candidates.
5. **Cross-Reference Canon**: Invoke `UniverseResolver` to bind candidates to existing canonical IDs where possible.
