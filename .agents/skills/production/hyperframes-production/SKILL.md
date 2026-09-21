---
name: hyperframes-production
version: 1.0.0
category: production
description: "Instructs agents when and how AI Animation Studio delegates deterministic shot execution to HyperFrames, bridging ShotContract semantics to HyperFrames compositions."
dependencies:
  - production-route
applicablePhases:
  - "Phase 3.5"
  - "Phase 5"
  - "Phase 6"
---

# HyperFrames Production Skill

## Purpose
The `hyperframes-production` skill provides the integration bridge between Studio's provider-neutral `ShotContract` and the HyperFrames rendering engine. It defines when and how Studio delegates deterministic animation tasks to HyperFrames without duplicating official HyperFrames documentation.

> [!NOTE]
> The official HyperFrames skills (`/hyperframes`, `/hyperframes-core`, `/hyperframes-animation`) are installed as external skills and remain the sole authority on HyperFrames composition schemas, component props, and timeline definitions.

## When to Delegate to HyperFrames
AI Animation Studio delegates to HyperFrames when:
1. **Camera-Only Moves**:
   - The shot consists of camera pans, tilts, zooms (push-in/pull-out), or tracking shots over pre-rendered 2D/2.5D background art.
2. **Layered Parallax**:
   - Multi-plane compositions (foreground silhouettes, midground characters, background scenery) moving with differential speed.
3. **Motion Graphics & UI**:
   - Titles, lower thirds, credits, graphical overlays, split screens, and kinetic typography.
4. **Deterministic Character Puppetry**:
   - Cutout / puppet animation with discrete interchangeable layers (mouth shapes, blink cycles, arm positions).

## Compilation Workflow: ShotContract to HyperFrames

```
Studio ShotContract
  ├── camera (pushin, 3.0s, easeInOut)
  ├── subjects (character_id, layered PNG/SVG assets)
  ├── environment (background plate, foreground occlusion)
  └── audio (voice track, sfx track)
         │
         ▼
Studio HyperFrames Compiler
         │
         ▼ (Consult official /hyperframes skill for syntax)
HyperFrames Composition (TSX / JSON)
  ├── <Composition duration={90} fps={30}>
  ├──   <Camera movement="push-in" easing="easeInOut" ... />
  ├──   <Layer src={bg} parallaxFactor={0.2} />
  ├──   <Layer src={char} ... />
  └── </Composition>
```

## Boundary Rules
- **Do not invent custom HyperFrames syntax**: Always verify component tags and animation syntax against the official `/hyperframes-animation` skill.
- **Isolate Assets**: Ensure all layered visual assets referenced in the composition exist in the `AssetRegistry`.
