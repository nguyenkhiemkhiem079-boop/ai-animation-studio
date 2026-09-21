---
name: director-qa
version: 1.0.0
category: qa
description: "Audits directed shot sequences and ShotContracts against narrative intent, director profile, cinematic grammar, and dramatic pacing."
dependencies:
  - shot-plan
  - cinematography
applicablePhases:
  - "Phase 3"
  - "Phase 3.5"
  - "Phase 4"
---

# Director QA Skill

## Purpose
The `director-qa` skill guides agents in evaluating whether a planned shot sequence or generated `ShotContract` fulfills the artistic vision, narrative pacing, and emotional dynamics established by the `DirectorProfile` and `NarrativeBeat`. It ensures that directing choices are intentional, varied, and dramatically justified.

## Evaluation Dimensions

1. **Dramatic Alignment**:
   - Does the shot scale (e.g., Close-Up vs Wide) reflect the emotional intensity of the beat?
   - Does the camera movement (e.g., Push-In vs Locked) support the dramatic subtext?
2. **Grammar & Pacing**:
   - Are consecutive shot durations balanced (avoiding monotonous cadence)?
   - Does the sequence avoid jarring cuts between extreme focal lengths unless intentionally stylized?
   - Is cutting on action observed during physical movement?
3. **Coverage & Angles**:
   - Does the scene possess adequate coverage (master/establishing shot, medium dialogue shots, reaction close-ups)?
   - Is there visual variety without gratuitous camera changes?
4. **Director Profile Fidelity**:
   - Does the shot sequence respect the active `DirectorProfile` biases (e.g., preference for wide anamorphic lenses, naturalistic handheld vs precise formal symmetry)?

## QA Output & Feedback Loop
- **Score (0.0 to 1.0)**: Computed across dramatic alignment, grammar, coverage, and profile fidelity.
- **Actionable Critique**: If the score is below acceptable threshold (e.g. 0.8), emit concrete directives (e.g., "Shot 3 should be a Close-Up instead of Wide to capture character realization").
- **Auto-Correction**: Feed directives back to `shot-plan` to adjust `ShotContract` parameters before production routing.
