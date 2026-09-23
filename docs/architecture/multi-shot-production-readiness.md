# Architectural Readiness Analysis — Multi-Shot Production (Phase 21A)

**Status**: ARCHITECTURAL ANALYSIS ONLY (Pre-Implementation)  
**Scope**: Evaluates readiness of Studio architecture to scale from 1-shot pilot to 3-shot continuous production.  
**Rule**: No speculative provider integrations or untested live generation performed during this review.  

---

## 1. Multi-Shot Production Dimension Audit

| Dimension | Assessment | Architectural Analysis & Current Status |
| :--- | :---: | :--- |
| **1. Continuation Frames** | `READY` | `ContinuationEngine` extracts the terminal frame of Shot $N$ and injects it into the prompt and reference descriptors of Shot $N+1$ as an initial latent conditioning frame (`start-frame/terminal_frame.png`). |
| **2. Screen Direction & 180° Rule** | `READY` | `DirectorQA` and `ContinuityQAEvaluator` evaluate eye-line vectors, gaze direction, and screen axis crosses across sequential shot contracts. Violations are flagged and auto-repairable via `AutoRepairEngine`. |
| **3. Character Identity Persistence** | `READY` | Persistent `CharacterDNA` and canonical 6-view turnaround packages in `UniverseManager` are linked to ShotContract `requiredAssetIds`. Visual QA explicitly measures character identity fidelity across shots. |
| **4. Location Consistency** | `READY` | `LocationDNA` and environmental zone presets in `WorldStudio` enforce consistent anchor points, background depth layers, and architectural landmarks across shots within the same scene. |
| **5. Lighting Consistency** | `READY` | `ShotContract.lighting` enforces `keyLightDirection`, `colorTemperature`, `fogAtmosphere`, and `mood`. `ContinuityQAEvaluator` compares lighting deltas between consecutive shots to prevent jarring illumination jumps. |
| **6. Prop Persistence & State** | `PARTIAL` | `WorldStudio.listProps()` tracks mutable prop states (e.g. door opened/closed, candle lit/unlit). However, automatic propagation of destroyed or modified prop states across multi-shot Flow handoffs requires explicit state-diff binding. |
| **7. Timeline Ordering & Assembly** | `READY` | `TimelineAssembler` supports arbitrary shot sequences, track layouts (V1, A1, A2, A3, S1), and transitions (cut, dissolve, wipe). Order is strictly determined by planned scene shot lists. |
| **8. Surgical Retakes** | `READY` | `SurgicalRetakeEngine` supports variable-specific retakes (`lighting_adjustment`, `acting_adjustment`, `seed_variation`) while freezing invariant parameters. `ProductionInvalidationEngine` safely resets dependent timeline and master states. |
| **9. Per-Shot Approval Ceremony** | `READY` | `ProductionOrchestrator` iterates over pending shots sequentially, issuing single-use operator challenges per shot. Each shot is approved independently before entering canonical timeline assembly. |
| **10. Cross-Shot Continuity QA** | `READY` | `ContinuityQAEvaluator` evaluates whole-timeline sequences across all shots before master rendering, verifying cuts, audio ducking intervals, and visual transition smoothness. |

---

## 2. Multi-Shot Production Workflow Flowchart

```
┌────────────────────────────────────────────────────────┐
│                   Story Intelligence                   │
│          Extracts Scene & Plans 3 Shot Contracts       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                Shot 1: Establishing                    │
│   Build Handoff ➔ Flow Gen ➔ Import ➔ QA ➔ Approval   │
└──────────────────────────┬─────────────────────────────┘
                           │ (Terminal Frame Extracted)
                           ▼
┌────────────────────────────────────────────────────────┐
│                Shot 2: Medium Action                   │
│   Conditioned on Shot 1 Frame ➔ Import ➔ QA ➔ Approval │
└──────────────────────────┬─────────────────────────────┘
                           │ (Terminal Frame Extracted)
                           ▼
┌────────────────────────────────────────────────────────┐
│                Shot 3: Close-Up Reaction               │
│   Conditioned on Shot 2 Frame ➔ Import ➔ QA ➔ Approval │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             Multi-Track Timeline Assembly              │
│       V1 Video Sequence + Audio Mix + Subtitles        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                 Cross-Shot Continuity QA               │
│        180-Degree Rule, Lighting, & Screen Axis        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            Final Master Render & Acceptance            │
└────────────────────────────────────────────────────────┘
```

---

## 3. Findings & Next Steps for Phase 21

1. **Prop State Machine (PARTIAL)**:
   - *Recommendation*: Introduce a lightweight `ScenePropStateTracker` that updates prop states upon shot completion and injects modified prop descriptions into downstream shot contracts.
2. **Sequential Flow Handoff Staging**:
   - Because Shot $N+1$ depends on the physical terminal frame of Shot $N$, Google Flow packages for downstream shots must be compiled sequentially after the prior shot is imported and verified.
3. **No Code Blockers**:
   - Current abstractions cleanly support multi-shot DAG pipelines. Moving to 3-shot production will be straightforward once the single-shot pilot is validated with a live operator.
