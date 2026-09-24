---
name: studio
description: Main Antigravity router skill for AI Animation Studio. Directs requests to specialized development, story, universe, directing, cinematic, character, world, production, QA, and release skills.
version: 1.1.0
category: directing
---

# Studio Router Skill (`/studio`)

The **Studio Router** is the primary navigation hub for Antigravity agents working in the `ai-animation-studio` repository. It classifies developer prompts, identifies the required domain, resolves dependencies, and activates the appropriate specialized project and external skills.

---

## 🧭 Master Routing Table

| Developer Request / Intent | Primary Skills to Activate | Secondary / Reference Skills |
| :--- | :--- | :--- |
| **"Start Phase X", "Audit repo", "Check architecture"** | `repo-audit`, `architecture-review` | `phase-gate` |
| **"Implement feature", "Write code", "Fix bug"** | `implementation`, `testing`, `debugging` | `phase-gate` |
| **"Analyze script", "Extract beats", "Check source"** | `story-analyze`, `source-preservation` | `story-coverage`, `canon-conflict` |
| **"Resolve character", "Universe memory", "World state"** | `universe-resolve`, `character-resolve` | `world-state-check` |
| **"Make camera cinematic", "Camera direction is wrong", "180 degree"** | `cinematography`, `director-qa` | `shot-plan`, `scene-direct` |
| **"Character face changed", "Identity drift", "Outfit bug"** | `character-consistency`, `identity-qa` | `character-resolve` |
| **"Persistent location", "Room zones", "Spatial memory"** | `environment-resolve` | `world-state-check` |
| **"HyperFrames animation", "Deterministic camera"** | `hyperframes` (external), `hyperframes-production` | `production-route` |
| **"Route shot", "Deterministic vs Generative"** | `production-route` | `reference-binding` |
| **"Retake shot", "Shot 3 continuity broken"** | `retake`, `continuation`, `continuity-qa` | `reference-binding` |
| **"Continuity QA", "Visual defect inspection"** | `continuity-qa`, `visual-qa` | `director-qa` |
| **"Check Gemini live", "Gemini API live test", "Quota 429"** | `live-provider-validation` | `architecture-review` |
| **"Validate production evidence", "Why can't this run become master verified?"** | `production-trust-evidence` | `live-provider-validation` |
| **"Prepare Google Flow generation", "Flow handoff", "Import video"** | `flow-operator-workflow` | `reference-binding`, `cinematography` |
| **"Audit secrets and FFmpeg security", "Check leaked API key"** | `release-security` | `repo-audit`, `architecture-review` |
| **"Can we release?", "Are we ready to release?", "Release gate"** | `release-validation` | `production-trust-evidence`, `release-security` |

---

## ⛓️ Multi-Skill Operational Chains

For complex, multi-stage production workflows, Antigravity executes tasks in structured, acyclic sequences:

### 1. Genuine Live Pilot Workflow
```
repo-audit
  └── architecture-review
        └── live-provider-validation
              └── production-trust-evidence
                    └── flow-operator-workflow
                          └── visual-qa
                                └── release-security
                                      └── release-validation
```

### 2. Surgical Shot Retake Workflow
```
visual-qa
  └── identity-qa / continuity-qa
        └── retake
              └── reference-binding
                    └── flow-operator-workflow
```

### 3. Production Bug Resolution Workflow
```
repo-audit
  └── debugging
        └── testing
              └── production-trust-evidence
                    └── phase-gate
```

---

## ⚡ Execution Flow for Agents

1. **Classify Intent**: Match the prompt against the routing table above. Favor the smallest relevant set of skills (do not load every skill for every task).
2. **Inspect Relevant Skill**: Read the specialized `SKILL.md` to internalize invariants, boundaries, and failure conditions.
3. **Execute via Core Application Code**: Skills provide *operational knowledge* and *discipline*; runtime truth and validation reside authoritatively in `@ai-studio/core` schemas and `@ai-studio/cli`.
4. **Respect Operator & Provider Boundaries**: Never simulate human approvals (`AUTOMATED_TEST != HUMAN`) or fake live external provider execution (`OFFLINE_TEST_DOUBLE != LIVE_EXTERNAL`).
5. **Enforce Release Gates**: Run `npm run studio -- skills check` and `npm run test` before concluding any milestone.
