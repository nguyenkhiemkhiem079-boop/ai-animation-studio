---
name: canon-conflict
description: Canon conflict detection skill. Cross-references story candidates against persistent Universe Canon and World Facts to catch continuity contradictions.
version: 1.0.0
category: story
---

# Canon Conflict Detection Skill (`canon-conflict`)

Use this skill to detect narrative and continuity contradictions between story content and established universe history.

---

## 🔍 Conflict Checking Rules

1. **Character Status**:
   - If a candidate matches a canonical character, check `universe.canonState.worldFacts`.
   - Flag if a character declared dead/killed in canon appears actively in a non-flashback scene.
2. **Location Constraints**:
   - Check if a location visited has been destroyed, relocated, or locked in canon.
3. **Prop Integrity**:
   - Check if a prop utilized in the scene was destroyed or lost in prior episodes.
4. **Resolution Strategy**:
   - For every flagged conflict, provide a `suggestedResolution` (e.g. "Identify as flashback", "Check canon resurrection", "Mark as replica prop").
