---
name: continuation
version: 1.0.0
category: production
description: "Workflow for chaining consecutive shots across cut boundaries, extracting terminal states from shot N to seed shot N+1 with visual and motion continuity."
dependencies:
  - reference-binding
  - world-state-check
applicablePhases:
  - "Phase 3.5"
  - "Phase 5"
  - "Phase 6"
---

# Continuation Skill

## Purpose
The `continuation` skill manages temporal and visual transitions between sequential shots. Rather than generating shot $N+1$ in isolation, the continuation workflow inspects the verified terminal state of shot $N$, extracts continuity variables, and binds them as initial conditions for shot $N+1$, preventing jump cuts, disappearing objects, and spatial jarring.

## Continuation Workflow

```
                        Shot N Render (Accepted)
                                   │
                                   ▼
                       Extract Terminal State at t=T
         ├── Last frame image (END_FRAME)
         ├── Subject positions and facing directions
         ├── Prop mutations (held objects, damage)
         ├── Environmental lighting & weather
         └── Motion momentum (velocity, direction)
                                   │
                                   ▼
                     Map to Shot N+1 Initial State
         ├── Cut Type: Direct Cut, Match Cut, or Continuation
         ├── START_FRAME binding (if same angle/scene)
         ├── Reverse Angle Line Check (180° rule)
         └── Prop state propagation
                                   │
                                   ▼
                      Execute Shot N+1 Production
```

## Continuation Rules
1. **Never Blindly Regenerate**:
   - Shot $N+1$ must never be generated from zero context when it continues an unbroken scene.
2. **Terminal State Extraction**:
   - Extract the last frame of Shot $N$ and store it in `AssetRegistry` as a candidate `START_FRAME` reference.
3. **Motion Continuity**:
   - If a character is walking left-to-right at the end of Shot $N$, the beginning of Shot $N+1$ must respect that vector (or show the consequence of halting).
4. **Prop & Damage Persistence**:
   - If Shot $N$ ends with an item broken or a door opened, Shot $N+1$ MUST reflect that updated state in its `ShotContract.environment`.
