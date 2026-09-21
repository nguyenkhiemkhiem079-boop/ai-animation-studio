---
name: scene-direct
description: Scene direction skill. Converts Story Intelligence SceneCandidates into ProductionScenes with narrative intent, dramatic goals, and shot sequences.
version: 1.0.0
category: directing
---

# Scene Direction Skill (`scene-direct`)

Use this skill to direct overall scene structure and establish narrative pacing.

---

## 🎬 Scene Direction Protocol

1. **Classify Scene Purpose**:
   - `establishing`: Introduces the world, setting, or environmental mood.
   - `dialogue`: Primary interaction between characters.
   - `conflict` / `action`: Physical or emotional clash.
   - `reveal` / `climax`: Peak revelation or confrontation.
2. **Define Narrative Intent**:
   - Dramatic goal (what must change between start and end).
   - Emotional tone (tense, warm, somber, triumphant).
   - Pacing priority (`slow_cinema`, `deliberate`, `dynamic`, `frenetic`).
3. **Sequence Planning**:
   - Coordinate with `shot-plan` to generate a structured shot list and dependency DAG.
