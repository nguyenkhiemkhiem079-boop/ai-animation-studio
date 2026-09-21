---
name: shot-plan
version: 1.0.0
category: directing
description: "Deconstructs a directed scene beat into a coherent sequence of provider-neutral ShotContracts with complete cinematic parameters and source traceability."
dependencies:
  - scene-direct
  - cinematography
applicablePhases:
  - "Phase 3"
  - "Phase 3.5"
---

# Shot Plan Skill

## Purpose
The `shot-plan` skill guides agents in planning and synthesizing concrete `ShotContract` sequences from scene narrative beats and director profiles. It transforms high-level narrative intent and emotional arcs into detailed, shot-by-shot specifications while preserving strict provider neutrality and source traceability.

## Core Inputs & Domain Concepts
- **`NarrativeBeat`**: The unit of story action or dialogue with source character offsets (`source_traceability`).
- **`DirectorProfile`**: Pacing, framing biases, lens choices, lighting style, and camera movement preferences.
- **`SequenceState`**: Spatial continuity, subject positioning, screen direction (180-degree rule), and motion vectors from previous shots.
- **`CinematicGrammar`**: Rules governing shot scale progression, cutting on action, match cuts, and temporal flow.

## Shot Planning Workflow

```
NarrativeBeat + DirectorProfile + SequenceState
                      │
                      ▼
       1. Coverage & Scale Selection (Establishing -> Medium -> Close-up)
                      │
                      ▼
       2. Camera Setup (Angle, Lens, Movement, Character)
                      │
                      ▼
       3. Subject & Acting Choreography (Pose, Expression, Eye Line)
                      │
                      ▼
       4. Lighting & Atmosphere (Key, Fill, Color Temp, Atmosphere)
                      │
                      ▼
       5. Transition & Audio Setup (Cut/Dissolve/Whip, Dialogue, SFX)
                      │
                      ▼
       6. ShotContract Construction & Grammar Validation
```

## Planning Guidelines

1. **Maintain Source Traceability**:
   - Every `ShotContract` MUST include `source_traceability` with `source_text_hash`, `start_offset`, and `end_offset` linking to the source script.
2. **Respect the 180-Degree Rule**:
   - In two-character dialogue scenes, maintain consistent screen direction (left/right eyelines) unless an intentional camera move or cutaway crosses the line.
3. **Pacing and Shot Duration**:
   - Action beats: 1.0s – 3.0s per shot with dynamic movement (handheld/truck/tracking).
   - Emotional / intimate beats: 3.5s – 6.0s per shot with slow push-ins or locked framing.
   - Establishing beats: 4.0s – 8.0s wide or aerial framing.
4. **Cinematic Progression**:
   - Avoid jumping directly between extreme shot scales (e.g., Extreme Long Shot to Extreme Close-Up) without deliberate dramatic intent.
   - Cut on action to maintain continuous temporal energy.
5. **Output Neutral ShotContracts**:
   - Do NOT emit provider-specific prompt strings (e.g., Midjourney flags or Seedance tokens).
   - Populate strongly-typed parameters in `ShotContract` (camera, lighting, subjects, transitions).
