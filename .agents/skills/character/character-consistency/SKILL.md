---
name: character-consistency
version: 1.0.0
category: character
description: "Rules and workflows for maintaining visual identity, facial features, proportions, and outfit continuity across shots and episodes using persistent Character DNA."
dependencies:
  - character-resolve
applicablePhases:
  - "Phase 3.5"
  - "Phase 4"
  - "Phase 5"
---

# Character Consistency Skill

## Purpose
The `character-consistency` skill governs the preservation of character identity throughout multi-shot sequences, episodes, and entire series. It establishes that a character's physical appearance, facial geometry, distinctive marks, and costuming are immutable references derived from Canonical Character DNA, preventing identity drift and accidental reinvention.

## Core Tenets of Character Consistency

1. **Existing Canon Must Be Reused**:
   - Never regenerate an established character's visual identity from scratch.
   - Always query the Universe via `UniverseResolver` to obtain the canonical `Character` entity and active `CharacterVersion`.
2. **Identity Lock via Canonical References**:
   - Every shot featuring a character must bind to canonical visual references (front, 3/4 turn, profile, expression sheets).
   - Reference images serve as the ground-truth anchor for generation and rendering.
3. **Separation of Identity, Pose, Expression, and Outfit**:
   - **Identity** (facial structure, eye shape, skin tone, hair texture) remains static.
   - **Outfit** is versioned and trackable per scene/beat.
   - **Pose** and **Expression** are ephemeral parameters dictated by the specific `ShotContract`.
4. **Immutability of Historical Versions**:
   - When a character undergoes physical progression (e.g., aging, battle scar, haircut), create a new version (e.g., `v2`).
   - Updating `v2` must NEVER modify or overwrite `v1`.

## Character Consistency Checklist for Agents

```
Step 1: Obtain Canonical Character Identity
        - Verify character_id exists in Universe.
        - Load active CharacterVersion and canonical DNA references.

Step 2: Bind Shot-Specific State
        - Check current scene outfit (e.g., "school_uniform", "casual").
        - Determine emotional expression from NarrativeBeat acting cues.
        - Ensure pose matches spatial layout and eyelines.

Step 3: Reference Role Isolation
        - Supply identity reference strictly to CHARACTER_IDENTITY role.
        - Supply outfit reference to OUTFIT role.
        - Do NOT cross-contaminate pose with identity references.

Step 4: Consistency Verification
        - Compare candidate renders against canon face embedding / reference anchors.
        - If drift exceeds threshold, trigger Retake Protocol targeting identity weights.
```
