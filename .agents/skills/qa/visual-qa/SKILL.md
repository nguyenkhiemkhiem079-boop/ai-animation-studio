---
name: visual-qa
version: 1.0.0
category: qa
description: "Inspection criteria for rendered video frames and animations, detecting artifacts, anatomical flaws, layer clipping, and visual rendering errors."
dependencies:
  - identity-qa
applicablePhases:
  - "Phase 3.5"
  - "Phase 5"
  - "Phase 6"
---

# Visual QA Skill

## Purpose
The `visual-qa` skill equips agents with the criteria, diagnostic rules, and defect taxonomy needed to evaluate rendered visual frames, animations, and video clips. It ensures high visual fidelity and flags generative or compositing anomalies.

## Visual Defect Taxonomy

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ANATOMICAL & CHARACTER DEFECTS                           │
│    - Bad hands (extra fingers, merged digits, distorted palms)│
│    - Face corruption (warped eyes, asymmetric teeth, blur)  │
│    - Body proportion drift (elastic limbs, impossible poses) │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 2. COMPOSITING & LAYER DEFECTS                              │
│    - Layer clipping (character limbs passing through walls)  │
│    - Depth-sorting errors (background in front of subject)   │
│    - Edge halos, matte lines, or chroma key fringing        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 3. TEMPORAL & RENDERING DEFECTS                             │
│    - Flickering / temporal jitter across consecutive frames  │
│    - Black frames or blank flashes                           │
│    - Object pop-in / spontaneous disappearance               │
│    - Frame tearing, pixelation, or compression artifacts     │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 4. PRESENTATIONAL DEFECTS                                   │
│    - Subtitle overflow or font clipping                      │
│    - Aspect ratio distortion or unwanted pillarboxing        │
│    - Color space / gamma clipping (blown highlights/crushed) │
└─────────────────────────────────────────────────────────────┘
```

## Agent Evaluation Protocol
1. **Frame Inspection**: Sample keyframes at $t=0$, $t=0.25T$, $t=0.5T$, $t=0.75T$, and $t=T$.
2. **Defect Categorization**: Categorize any detected defects using the taxonomy above.
3. **Severity Rating**:
   - **Critical (Blocking)**: Face corruption, bad hands on prominent subject, black frames, layer clipping.
   - **Minor (Non-blocking)**: Minor background flicker, subtle grain discrepancy.
4. **Remediation Routing**:
   - Critical defects automatically trigger the `retake` protocol.
