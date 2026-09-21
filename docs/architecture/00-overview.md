# Architecture: System Overview

## Objective

The **AI Animation Studio** transforms raw user story content into complete, editable animation and video productions while preserving continuity, character consistency, and source truth across entire multi-episode series.

## Pipeline Dataflow

```
FULL USER CONTENT
      ↓
[Phase 2] Story Intelligence Engine (Beats, Dialogue, Candidates)
      ↓
[Phase 1] Universe Resolver & Persistent Memory (Character/Location DNA)
      ↓
[Phase 3] Scene & Shot Director (Grammar, ShotContracts, Sequencing)
      ↓
[Phase 4 & 5] Character & World Asset Resolution (Deduplication, Canon Sheets)
      ↓
[Phase 6] Production Router (Deterministic vs Generative)
      ↓
[Phase 7 & 8 & 9] Animation & Video Workers (HyperFrames, Rigging, Generative Video)
      ↓
[Phase 10] Voice / Music / Sound Effects
      ↓
[Phase 11] Timeline Editing & Assembly
      ↓
[Phase 12] Continuity QA & Auto-Repair
      ↓
Final Render (MP4 + Editable Project)
```

## Non-Negotiable Guarantees

1. **Provider Independence**: External models are swappable workers through `IProvider`.
2. **Series Awareness**: Universes are isolated by series; characters and locations evolve across versions without historical breakage.
3. **Character Consistency**: Assets are indexed by visual identity, pose, outfit, and angle; existing canonical assets are reused rather than re-generated.
4. **Resumable Pipeline**: Pipeline execution is step-driven and checkpointed, allowing immediate resumption from partial runs.
5. **Cost-Aware Routing**: Deterministic motion graphics (HyperFrames, transforms, parallax) are chosen over heavy video generation whenever the shot contract allows.
