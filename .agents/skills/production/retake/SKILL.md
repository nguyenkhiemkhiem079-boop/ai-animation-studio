---
name: retake
version: 1.0.0
category: production
description: "Root-cause diagnostic and surgical re-generation protocol for failing shots, isolating and modifying only the responsible production variables."
dependencies:
  - production-route
applicablePhases:
  - "Phase 3.5"
  - "Phase 5"
  - "Phase 6"
---

# Retake Skill

## Purpose
The `retake` skill defines the surgical protocol for repairing defective or failing shots. When a shot fails a QA gate (identity drift, bad anatomy, camera trajectory error, lighting mismatch), the retake protocol isolates the single failing variable and regenerates the shot without disturbing unaffected dimensions (such as story script, dialogue, or sound).

## The Retake Protocol

```
                        Shot QA Gate: REJECTED
                                   │
                                   ▼
                   1. Identify Failed Quality Dimension
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
   Identity Drift            Camera Error               Motion Flaw
(Face/hair altered)      (Wrong angle/speed)        (Jitter / warping)
         │                         │                         │
         ▼                         ▼                         ▼
2. Responsible Variable:  2. Responsible Variable:  2. Responsible Variable:
  Identity ref weight /     Camera movement /         Provider strategy /
  seed / reference slot     easing / lens params      guidance scale
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                   3. Surgical Parameter Adjustment
                      (Keep all other variables LOCKED)
                                   │
                                   ▼
                   4. Targeted Re-execution
                                   │
                                   ▼
                   5. Side-by-Side Comparison & Sign-off
```

## Immutable Retake Rules
1. **Never Rewrite the Narrative Script**:
   - An identity drift or bad hand is a rendering/generation flaw, NEVER an excuse to alter dialogue, scene action, or character motivations.
2. **One Variable at a Time**:
   - Modify the isolated failure parameter (e.g., identity reference weight from 0.7 to 0.9) before changing other factors.
3. **Compare Against Baseline**:
   - Log retake iterations with diffs against the previous attempt to verify that the target flaw was resolved without introducing secondary regressions.
