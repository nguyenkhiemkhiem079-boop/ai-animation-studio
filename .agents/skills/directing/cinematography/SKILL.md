---
name: cinematography
version: 1.0.0
category: directing
description: "Master cinematography knowledge skill translating narrative intent, scene purpose, and emotional subtext into semantic camera, framing, composition, motion, and transition techniques."
dependencies: []
applicablePhases:
  - "Phase 3"
  - "Phase 3.5"
  - "Phase 4"
  - "Phase 5"
---

# Master Cinematography Skill

## Purpose
The `cinematography` skill is the core semantic domain reference for visual storytelling in AI Animation Studio. It translates dramatic intent and scene objectives into structured, provider-neutral cinematic parameters across framing, camera angles, movement, composition, lighting, transitions, and camera character.

## Core Architectural Separation of Layers

```
┌──────────────────────────────────────────────────────────┐
│ 1. SEMANTIC SKILL (Cinematography Knowledge)             │
│    - Intent, emotional effect, framing, movement         │
│    - Example: PUSH_IN, MEDIUM_CLOSE_UP, DUTCH_ANGLE      │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│ 2. DIRECTOR TRANSLATION                                  │
│    - Populates typed ShotContract.camera.*               │
│    - Easing, duration, focal length, subject tracking    │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│ 3. PRODUCTION STRATEGY (ProductionRouter)                │
│    - Selects: Deterministic (HyperFrames) vs Generative   │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│ 4. PROVIDER IMPLEMENTATION                               │
│    - HyperFrames transforms OR Provider prompt compiler  │
└──────────────────────────────────────────────────────────┘
```

> [!CRITICAL]
> Semantic skills and ShotContracts must NEVER contain provider-specific prompt strings, seeds, or model flags. Provider compilation occurs strictly at Layer 4.

---

## Semantic Cinematic Contract Structure

Every cinematic technique follows this conceptual schema:
- **`name`**: Unique semantic identifier (e.g., `PUSH_IN`, `DUTCH_ANGLE`).
- **`intent`**: Emotional and narrative purpose.
- **`whenToUse`**: Narrative and dramatic contexts where this technique excels.
- **`whenNotToUse`**: Anti-patterns, overuse risks, and inappropriate scenes.
- **`parameters`**: Typed parameters (e.g., speed, strength, axis, easing, target).
- **`compatibility`**: Techniques that pair effectively together.
- **`conflicts`**: Mutually exclusive techniques (e.g., cannot combine `LOCKED` with `ORBIT360`).
- **`narrativeEffect`**: Cognitive and emotional impact on the viewer.
- **`continuityConsiderations`**: Impact on 180-degree line, eye-line match, and screen direction.
- **`productionNotes`**: Implementation guidance for deterministic vs generative pipelines.

---

## Cinematic Knowledge Taxonomy

### 1. Camera Movement
| Movement | Semantic Intent | Key Parameters | When to Avoid |
| :--- | :--- | :--- | :--- |
| **`pushin`** | Intensify intimacy, realization, or tension | `speed`, `distance`, `target`, `easing` | Overuse in casual dialogue |
| **`pullout`** | Reveal isolation, scale, context, or detachment | `speed`, `distance`, `final_framing` | High-urgency kinetic action |
| **`dollyout`** | Physical camera retreat maintaining perspective | `speed`, `path`, `lens_compensation` | Confined interior sets |
| **`orbit` / `orbit360`** | Wonder, disorientation, heroic showcase, trapped feeling | `angle_deg`, `speed`, `elevation`, `center` | Intimate whispering moments |
| **`panleft` / `panright`** | Scan environment, track horizontal attention | `angle`, `angular_velocity`, `target` | Rapid cutting action scenes |
| **`tiltup` / `tiltdown`** | Reveal vertical scale, status/power, discovery | `start_pitch`, `end_pitch`, `speed` | Fast lateral character chases |
| **`truckleft` / `truckright`** | Parallel tracking with walking/moving subject | `speed`, `distance`, `ground_plane` | Stationary dialogue shots |
| **`craneup`** | Elevate perspective, reveal geography or departure | `start_height`, `end_height`, `tilt` | Low-ceiling interiors |
| **`tracking` / `follow`** | Immerse audience with subject movement | `lead_lag`, `distance`, `smoothness` | Static contemplative beats |

### 2. Framing & Scale
- **`establishing`**: Locates geographic and temporal context, sets tone and atmospheric scale.
- **`wide`**: Full subject and surrounding environment; emphasizes physical relationship to world.
- **`medium`**: Waist-up; balances subject expression with body language; workhorse for narrative dialogue.
- **`mediumcloseup`**: Chest-up; concentrates on character emotions while retaining shoulder orientation.
- **`closeup`**: Face-only; reveals subtle micro-expressions, vulnerability, or intense focus.
- **`extremecloseup`**: Eyes, lips, or a crucial detail; creates extreme tension, claustrophobia, or intimacy.
- **`macro`**: Microscopic or ultra-fine details (e.g., watch ticking, insect, drop of water).
- **`overshoulder` (OTS)**: Anchors conversational depth and spatial eyelines between two characters.
- **`twoshot`**: Captures relational dynamics, status parity, or tension between two subjects simultaneously.

### 3. Camera Angles
- **`eyelevel`**: Neutral, objective, empathetic; viewer is an equal peer.
- **`lowangle`**: Subject appears dominant, powerful, menacing, or heroic.
- **`highangle`**: Subject appears vulnerable, diminished, trapped, or overwhelmed.
- **`dutchangle`**: Canted horizon (5°–25°); signifies psychological instability, chaos, or unease.
- **`aerial` / `drone`**: Top-down bird's-eye view; evokes detachment, fate, or tactical overview.
- **`pov`**: First-person perspective; direct identification with character experience.

### 4. Camera Motion & Temporal Dynamics
- **`slowmo`**: Dilates pivotal emotional impact, physical grace, or devastating consequence.
- **`speedramp`**: Modulates temporal pacing (e.g., slow-to-fast or fast-to-slow) for kinetic action.
- **`hyperlapse`**: Shows passage of time and environmental evolution over large spatial journeys.
- **`freeze`**: Halts motion completely to punctuate a moment of shock, realization, or comic timing.
- **`motionblur`**: Accentuates speed and kinetic disorientation.

### 5. Camera Character
- **`locked`**: Absolute tripod stability; disciplined, classical, formal, or ominous.
- **`smooth`**: Steadicam / gimbal / dolly; fluid, cinematic, elegant, controlled.
- **`floating`**: Slight organic buoyancy; dreamlike, detached, observational.
- **`handheld`**: Natural human micro-tremor; immediacy, realism, documentary feel, tension.
- **`shaky`**: Violent, chaotic camera perturbation; explosions, panic, visceral combat.

### 6. Composition
- **`centered`**: Symmetry, authority, iconic confrontation, or Wes Anderson-style formalism.
- **`ruleofthirds`**: Natural balance and visual flow across intersection nodes.
- **`symmetry`**: Architectural order, perfection, ritual, or psychological rigidity.
- **`negative-space`**: Subject offset by large empty background; evokes isolation, yearning, or emptiness.
- **`foreground-frame`**: Natural framing (doorways, foliage, windows) to create voyeuristic depth.
- **`silhouette`**: High contrast backlighting; highlights posture, shape, and mystery over surface detail.

### 7. Transitions & Effects
- **Transitions**: `cut` (direct temporal transition), `fade` (to/from black/white for passage of time), `dissolve` (subtle temporal blending or thematic connection), `whip` (kinetic whip pan disguising a cut), `matchcut` (graphic or motion continuity between disparate scenes), `mask` (screen wiping using moving foreground objects).
- **Cinematic Effects**: `vintagefilm`, `grain`, `fog`, `glow`, `flicker`, `lightleak`.
