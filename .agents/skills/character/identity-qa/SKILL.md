---
name: identity-qa
version: 1.0.0
category: character
description: "Quality assurance protocol for verifying visual character fidelity, detecting identity drift, facial warping, and costume discrepancies against Canonical DNA."
dependencies:
  - character-consistency
applicablePhases:
  - "Phase 3.5"
  - "Phase 4"
  - "Phase 5"
---

# Identity QA Skill

## Purpose
The `identity-qa` skill defines the inspection, scoring, and diagnostic workflow for validating character appearance in candidate visual assets and rendered shots. It flags identity drift, facial deformation, anatomy errors, and outfit inconsistencies before an asset or shot can be promoted to Canon.

## Verification Dimensions

1. **Facial Geometry & Features**:
   - Eye shape, iris color, nose contour, lip fullness, jawline, and skin tone.
   - Distinctive marks (moles, scars, freckles, tattoos, piercings).
2. **Hair Consistency**:
   - Color, style, parting, length, and texture under varying lighting conditions.
3. **Anatomy & Proportions**:
   - Height ratio relative to other characters in the shot.
   - Proper limb count, natural hand structure (5 fingers, correct joints).
4. **Costume & Accessories**:
   - Correct costume matching the scene's designated outfit version.
   - Consistency of accessories (glasses, jewelry, badges, hats).
5. **Lighting & Style Integrity**:
   - Character integration with scene ambient illumination without altering intrinsic skin or hair pigmentation.

## QA Diagnostic Decision Tree

```
                     Candidate Asset / Shot Render
                                  │
                                  ▼
                   Facial Recognition / Visual Match
                     >= Threshold (e.g. 0.85)?
                                ╱   ╲
                              YES    NO
                              ╱       ╲
            Check Anatomy & Costume    TRIGGER RETAKE
              Matching Scene State?    Target: Identity Reference /
                     ╱   ╲             Identity Strength Bias
                   YES    NO
                   ╱       ╲
             [PASS]      TRIGGER RETAKE
                         Target: Outfit / Costume Slot
```

## Remediation Rules
- If identity fails: **DO NOT** rewrite the narrative script or camera plan.
- Instead:
  1. Increase identity reference strength in the `ProductionRouter`.
  2. Switch to high-fidelity reference role bindings.
  3. Re-run render with targeted retake parameters.
