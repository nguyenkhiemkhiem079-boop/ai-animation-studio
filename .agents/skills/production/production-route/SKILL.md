---
name: production-route
version: 1.0.0
category: production
description: "Evaluates ShotContract specifications and chooses optimal execution paths (Deterministic HyperFrames vs Generative Video) based on fidelity, cost, and motion complexity."
dependencies:
  - shot-plan
  - cinematography
applicablePhases:
  - "Phase 3.5"
  - "Phase 5"
  - "Phase 6"
---

# Production Route Skill

## Purpose
The `production-route` skill governs production strategy decisions for translating a `ShotContract` into visual media. It enforces the **Deterministic Animation First** architectural tenet by evaluating whether a shot can be accomplished deterministically (using 2D/2.5D layer animation, camera moves, and parallax via HyperFrames) or requires generative video models (Veo, Seedance, ComfyUI).

## Decision Matrix: Deterministic vs Generative

```
                         ShotContract Inspection
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
Deterministic Candidate?                                Generative Candidate?
- 2D character with rigged layers / poses               - Organic 3D deformations
- Motion graphics, UI, text, cards                      - Complex fluid dynamics (water, fire)
- Parallax camera moves across static layers            - High-fidelity human micro-expressions
- Pan, tilt, push-in, truck across background plates    - Unconstrained character gymnastics
- Static dialogue with mouth flap / eye blink           - Photorealistic cinematic footage
    │                                                               │
    ▼                                                               ▼
[ROUTED TO HYPERFRAMES]                                 [ROUTED TO GENERATIVE VIDEO]
Cost: $0.00 | Latency: Realtime                         Cost: High | Latency: 30s-120s
```

## Routing Workflow
1. **Analyze Shot Complexity**:
   - Assess character movement: static pose with camera move vs dynamic physical interaction.
   - Assess environmental interaction: static background vs changing weather/lighting.
2. **Evaluate Production Constraints**:
   - Compute cost, token budget, and latency impact.
   - Check available assets in `AssetRegistry` (layered SVG/PNG plates vs raw concept images).
3. **Dispatch to Strategy**:
   - If deterministic: Delegate to `hyperframes-production` skill.
   - If generative: Delegate to `generative-video` and `reference-binding` skills.
4. **Fallback & Hybrid Routing**:
   - Hybrid: Deterministic camera moves applied on top of AI-generated initial frames or plates.
