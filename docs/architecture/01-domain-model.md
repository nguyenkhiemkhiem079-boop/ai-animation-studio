# Architecture: Domain Model

## Core Domain Entities

```
┌──────────────────────────────────────────────┐
│                    Project                   │
│   id, name, seriesId, currentEpisodeId       │
└──────────────────────┬───────────────────────┘
                       │ 1:1
                       ▼
┌──────────────────────────────────────────────┐
│                    Universe                  │
│  seriesId, characters, locations, props,     │
│  canonState, relationships, timeline         │
└──────────────────────┬───────────────────────┘
                       │ contains
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│   CharacterDNA   │      │   LocationDNA    │
│ id, name, traits,│      │ id, name, zones, │
│ versions, outfits│      │ lighting, props  │
└──────────────────┘      └──────────────────┘
```

### 1. Project & Series
A **Project** belongs to a **Series**. Projects within the same series share a single **Universe** to ensure story continuity, while projects from different series are strictly isolated.

### 2. CharacterDNA & Versions
- `CharacterDNA` contains visual traits (hair, eyes, build, clothing preferences), voice timbre, and personality anchors.
- Characters have versioned states (`v1`, `v2`). Creating or editing `v2` creates a new snapshot and never mutates `v1`.

### 3. Candidates vs. Canon
- AI extraction produces `Candidate` records (e.g. `CharacterCandidate`, `SceneCandidate`).
- Candidates cannot become Canon until accepted by the universe resolver or confirmed by user approval.

### 4. ShotContract
A `ShotContract` is the single source of truth for a visual shot. It contains:
- Frame intent (aspect ratio, duration, resolution, fps).
- Camera intent (movement, lens, angle, cinematic skills like push-in/orbit).
- Staging & Acting intent (characters present, poses, expressions, dialogue).
- Lighting & Atmosphere intent.
- Renderer intent (deterministic HyperFrames vs generative video).
- Dependency graph (requires asset IDs, audio tracks, previous shot tails).
