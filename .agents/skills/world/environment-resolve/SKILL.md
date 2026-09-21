---
name: environment-resolve
version: 1.0.0
category: world
description: "Resolves environment, architectural layout, spatial geometry, and lighting states from canonical location DNA to ensure environmental continuity across scenes."
dependencies:
  - universe-resolve
  - world-state-check
applicablePhases:
  - "Phase 3.5"
  - "Phase 4"
  - "Phase 5"
---

# Environment Resolve Skill

## Purpose
The `environment-resolve` skill governs how physical spaces, backgrounds, architectural details, and environmental conditions are retrieved from canonical Location DNA and applied to scenes. It guarantees spatial, architectural, and atmospheric continuity across multi-shot sequences occurring within the same setting.

## Core Dimensions of Environment Resolution

1. **Location Canon**:
   - Query `UniverseResolver` for the active `Location` entity.
   - Extract canonical reference assets (wide establishing plates, architectural plans, color palettes, material definitions).
2. **Spatial & Architectural Consistency**:
   - Maintain landmark positions (doors, windows, furniture, major props).
   - Ensure camera angles reflect the correct 3D layout (e.g., if shot A looks north toward a bookshelf, a reverse shot B looking south must not show the same bookshelf).
3. **Lighting & Time-of-Day Continuity**:
   - Establish baseline key lighting (solar position, ambient sky light, interior practical fixtures).
   - Synchronize color temperature and shadow directions across all shots within the scene.
4. **Weather & Atmosphere State**:
   - Propagate active weather conditions (rain, fog, haze, dust particles, snow) consistently across sequence shots.
5. **Prop State Tracking**:
   - Track mutable props (e.g., a shattered glass, a moved chair, an open drawer) as world state mutations that persist across consecutive shots.

## Resolution Workflow

```
Scene Location Identifier + Scene Time/Weather
                      │
                      ▼
1. Fetch Canonical Location DNA from Universe
                      │
                      ▼
2. Load Active WorldState (Time of Day, Weather, Intact vs Damaged)
                      │
                      ▼
3. Determine Camera Field of View & Visible Set Elements
                      │
                      ▼
4. Output Environment Context to ShotContract.environment
```
