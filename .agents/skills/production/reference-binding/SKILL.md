---
name: reference-binding
version: 1.0.0
category: production
description: "Discipline for binding multimodal reference assets to explicit semantic roles (identity, pose, outfit, environment, motion) to prevent reference cross-contamination."
dependencies:
  - character-consistency
  - environment-resolve
applicablePhases:
  - "Phase 3.5"
  - "Phase 4"
  - "Phase 5"
  - "Phase 6"
---

# Reference Binding Skill

## Purpose
The `reference-binding` skill establishes the discipline and contracts for mapping reference media to strict, isolated functional roles in generative and hybrid video pipelines. It prevents "reference bleed" — where a reference meant to specify a pose accidentally distorts the character's facial identity, or an environment plate overrides the artistic style.

## Canonical Reference Roles

| Reference Role | Target Influence | Anti-Influence (What Must NOT Bleed) |
| :--- | :--- | :--- |
| **`CHARACTER_IDENTITY`** | Facial geometry, distinctive features, skin/eye color | Pose, clothing, background, camera framing |
| **`CHARACTER_POSE`** | Skeletal posture, arm/head angle, gesture | Face features, clothing, body proportions |
| **`OUTFIT`** | Garment fabric, color, cut, emblems, accessories | Face, skin color, bodily dimensions |
| **`ENVIRONMENT`** | Architecture, lighting direction, materials, layout | Characters, stylistic filters |
| **`STYLE`** | Line weight, color grading, shading technique, medium | Character identity, specific scene geometry |
| **`MOTION`** | Trajectory, velocity vector, optical flow | Character appearance, background details |
| **`CAMERA`** | Perspective, field of view, tilt/pan movement | Scene content, character action |
| **`AUDIO`** | Voice timbre, pitch, tempo, musical score | Visual artifacts |
| **`START_FRAME`** | Initial visual state at $t=0$ for I2V continuation | Post-$t=0$ trajectory divergence |
| **`END_FRAME`** | Target visual state at $t=T$ for interpolation | Premature arrival before $t=T$ |

## Binding Architecture & Rules

```
                      Input Assets from AssetRegistry
                                    │
                                    ▼
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
[CHARACTER_IDENTITY]        [CHARACTER_POSE]              [ENVIRONMENT]
Canon Turnaround Sheet      OpenPose Skeleton             Empty Set Plate
       │                            │                            │
       └────────────────────────────┼────────────────────────────┘
                                    │
                                    ▼
                         Targeted Conditioning
       (Each reference applied ONLY to its designated conditioning slot)
```

## Guidelines for Agents
1. **Never use full scene screenshots as identity references**:
   - Always crop and isolate the face/head when binding to `CHARACTER_IDENTITY`.
2. **Use structural representations for pose**:
   - Prefer skeletal wireframes, depth maps, or line art for `CHARACTER_POSE` rather than photos containing another person's likeness.
3. **Validate Role Separation**:
   - If a test render exhibits identity distortion toward the pose model, flag an identity bleed error and enforce stricter prompt/conditioning weighting.
