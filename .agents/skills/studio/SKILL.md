---
name: studio
description: Main Antigravity router skill for AI Animation Studio. Directs requests to specialized development, story, universe, directing, cinematic, character, world, production, and QA skills.
version: 1.0.0
category: router
---

# Studio Router Skill (`/studio`)

The **Studio Router** is the primary navigation hub for Antigravity agents working in the `ai-animation-studio` repository. It classifies developer prompts, identifies the required domain, and activates the appropriate specialized project skills.

---

## 🧭 Routing Table

| Developer Request / Intent | Primary Skills to Activate | Secondary / Reference Skills |
| :--- | :--- | :--- |
| **"Start Phase X", "Audit repo", "Check architecture"** | `repo-audit`, `architecture-review` | `phase-gate` |
| **"Implement feature", "Write code", "Fix bug"** | `implementation`, `testing`, `debugging` | `phase-gate` |
| **"Analyze script", "Extract beats", "Check source"** | `story-analyze`, `source-preservation` | `story-coverage`, `canon-conflict` |
| **"Resolve character", "Universe memory", "World state"** | `universe-resolve`, `character-resolve` | `world-state-check` |
| **"Make camera cinematic", "Plan shots", "Direct scene"** | `cinematography`, `scene-direct`, `shot-plan` | `director-qa` |
| **"Fix character consistency", "Identity drift"** | `character-consistency`, `identity-qa` | `character-resolve` |
| **"Persistent location", "Room zones", "Spatial memory"** | `environment-resolve` | `world-state-check` |
| **"Route shot", "Deterministic vs Generative"** | `production-route`, `hyperframes-production` | `reference-binding` |
| **"Shot continuation", "Retake shot"** | `continuation`, `retake` | `continuity-qa` |
| **"Continuity QA", "Visual defect inspection"** | `continuity-qa`, `visual-qa`, `director-qa` | `phase-gate` |

---

## ⚡ Execution Flow for Agents

1. **Classify Intent**: Map the developer instruction to the table above.
2. **Inspect Relevant Skill**: Read the specialized `SKILL.md` before executing modifications.
3. **Execute via Core Application Code**: The skills provide *knowledge* and *workflow*; runtime execution and validation must be carried out through `@ai-studio/core` and `@ai-studio/cli`.
4. **Enforce Phase Gates**: Run `phase-gate` and test suites before concluding any phase.
