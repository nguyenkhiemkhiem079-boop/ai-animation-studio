# Antigravity Skill OS & Production Knowledge

Welcome to the **AI Animation Studio Skill OS** documentation. This system provides a project-native, discoverable knowledge and workflow architecture for Antigravity and future AI coding agents.

---

## 1. Skill OS Architecture

Rather than relying on giant, monolithic system prompts, AI Animation Studio organizes agent knowledge into modular, discoverable skills under `.agents/skills/`.

```
ANTIGRAVITY AGENT
       │
       ▼
SKILL ROUTER (/studio)
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
DEVELOPMENT SKILLS          STORY SKILLS              UNIVERSE SKILLS
- repo-audit                - story-analyze           - universe-resolve
- architecture-review       - source-preservation     - character-resolve
- implementation            - story-coverage          - world-state-check
- testing                   - canon-conflict
- debugging
- phase-gate
- release-security
- release-validation
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
DIRECTING SKILLS            CHARACTER SKILLS          WORLD SKILLS
- scene-direct              - character-consistency   - environment-resolve
- shot-plan                 - identity-qa
- cinematography
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
PRODUCTION SKILLS           QA SKILLS                 EXTERNAL SKILLS
- production-route          - continuity-qa           - /hyperframes
- hyperframes-production    - visual-qa               - /hyperframes-core
- reference-binding         - director-qa             - /hyperframes-animation
- continuation
- retake
- live-provider-validation
- production-trust-evidence
- flow-operator-workflow
```

### Knowledge vs Execution
- **Skills (`.agents/skills/`)**: Provide **KNOWLEDGE**, mental models, operational guidelines, diagnostic decision trees, and workflow protocols.
- **Core Domain (`packages/core/`)**: Provides **EXECUTION**, runtime schemas, algorithms, storage, pipelines, and validation.
- **Cinematic Registry (`packages/core/src/cinematic-skills/`)**: Provides runtime application-level cinematic capability definitions.
- **Core Schemas Remain Authoritative**: If a skill instruction conflicts with a Zod schema or runtime invariant, the runtime schema strictly wins.

---

## 2. Skill Categories & Directory Layout

The repository contains **36 total registered skills** (33 custom domain skills and 3 external HyperFrames skills):

| Category | Description | Registered Skills |
| :--- | :--- | :--- |
| **`directing` (Router)** | Central router and directing entry point | `studio`, `scene-direct`, `shot-plan` |
| **`development`** | Engineering rigor, auditing, security, and release gates | `repo-audit`, `architecture-review`, `implementation`, `testing`, `debugging`, `phase-gate`, `release-security`, `release-validation` |
| **`story`** | Script ingestion, beat extraction, preservation | `story-analyze`, `source-preservation`, `story-coverage`, `canon-conflict` |
| **`universe`** | Persistent series canon & world state | `universe-resolve`, `character-resolve`, `world-state-check` |
| **`cinematic`** | Cinematic camera, framing, and grammar | `cinematography` |
| **`character`** | Identity lock, turnarounds, facial QA | `character-consistency`, `identity-qa` |
| **`world`** | Environments, spatial sets, lighting continuity | `environment-resolve` |
| **`production`** | Routing, reference binding, retakes, live providers, trust evidence, Flow boundary | `production-route`, `hyperframes-production`, `reference-binding`, `continuation`, `retake`, `live-provider-validation`, `production-trust-evidence`, `flow-operator-workflow` |
| **`qa`** | Continuity audits, visual frame inspection, director QA | `continuity-qa`, `visual-qa`, `director-qa` |
| **`external`** | Official third-party framework skills | `hyperframes`, `hyperframes-core`, `hyperframes-animation` |

---

## 3. Modern Production Skills (Phases 18–24+)

As the studio advanced through Phase 24 live production, five canonical production skills were established to govern external boundaries, evidence integrity, and release safety:

### 1. `live-provider-validation` (Production)
- **Purpose**: Governs real external multimodal provider calls (Gemini).
- **Invariants**: Strictly enforces single-credential architecture (`GEMINI_API_KEY`). Never introduces secondary keys or credential pools. Enforces role-based policies (`FAST`, `REASONING`, `STRUCTURED`, `QA`, `VISION_QA`), structured output schemas, rate limit handling (`WAITING_FOR_PROVIDER`), and provider provenance. Mocks never count as live proof.

### 2. `production-trust-evidence` (Production)
- **Purpose**: Protects the studio's truth model and fail-closed evidence derivations.
- **Truth Distinctions**:
  - `Candidate != Canon`
  - `QA PASS != HUMAN APPROVAL`
  - `OFFLINE_TEST_DOUBLE != LIVE_EXTERNAL`
  - `SIMULATED_FLOW != GOOGLE_FLOW_REAL`
  - `AUTOMATED_TEST != HUMAN`
  - `OFFLINE_REHEARSAL_VERIFIED != MASTER_PRODUCTION_VERIFIED`
- **Derivation Invariant**: `MASTER_PRODUCTION_VERIFIED` can only be derived from verifiable media files, matching SHA-256 bindings, QA logs, and authentic human approvals on disk. Missing, tampered, or contradictory evidence defaults to `UNVERIFIED`.

### 3. `flow-operator-workflow` (Production)
- **Purpose**: Governs the human-assisted Google Flow generation boundary.
- **Boundary**: Google Flow is an interactive human creative workspace without a public headless API. Antigravity prepares complete handoff packages, issues `NEEDS_USER_ACTION`, and audits imported media with FFprobe and cryptographic checksums upon operator delivery. Antigravity never fakes the operator step.

### 4. `release-security` (Development)
- **Purpose**: Enforces zero credential leakage, process injection defenses, and containment.
- **Coverage**: Prevents hardcoded API keys (`GEMINI_API_KEY`, `AIza...`), unescaped shell commands (`child_process.exec` vs argument array `spawn`), path traversal escapes (`../`), and test double contamination of production release manifests.

### 5. `release-validation` (Development)
- **Purpose**: Governs the final path to production across ten stratified lifecycle states.
- **States**: `IMPLEMENTED` → `LOCAL_VERIFIED` → `CI_VERIFIED` → `OFFLINE_REHEARSAL_VERIFIED` → `READY_FOR_LIVE_PILOT` → `WAITING_FOR_PROVIDER` / `NEEDS_USER_ACTION` → `LIVE_PILOT_VERIFIED` → `MASTER_PRODUCTION_VERIFIED` → `RELEASE_READY`.

---

## 4. Multi-Skill Routing Chains

Complex production operations require orchestrated, acyclic chains of skills:

```
Genuine Live Pilot Chain:
  repo-audit ──► architecture-review ──► live-provider-validation ──► production-trust-evidence
              ──► flow-operator-workflow ──► visual-qa ──► release-security ──► release-validation

Surgical Shot Retake Chain:
  visual-qa ──► continuity-qa / identity-qa ──► retake ──► reference-binding ──► flow-operator-workflow

Production Bug Chain:
  repo-audit ──► debugging ──► testing ──► production-trust-evidence ──► phase-gate
```

---

## 5. CLI Skill Commands

The studio CLI provides full discovery, inspection, and verification tools:

```bash
# Validate skill registry, dependency graph, and disk entrypoints
npm run studio -- skills check
npm run studio -- skills check --json

# List registered skills (with optional category filter)
npm run studio -- skills list
npm run studio -- skills list production
npm run studio -- skills list --json

# Inspect a specific skill, dependencies, and applicable phases
npm run studio -- skills inspect live-provider-validation
npm run studio -- skills inspect flow-operator-workflow --json

# Route a query to relevant domain skills
npm run studio -- skills route "check Gemini live"
npm run studio -- skills route "prepare Google Flow generation" --json
```

---

## 6. External Skills & HyperFrames Integration

Official external skills are installed directly from upstream repositories and tracked in `.agents/skills/registry.json` as `type: EXTERNAL` and locked via `skills-lock.json`.

- `/hyperframes`: Root entry point for declarative motion design.
- `/hyperframes-core`: Core composition primitives, audio, and asset specs.
- `/hyperframes-animation`: Animation syntax, easing, camera movements, and layer transforms.

> [!IMPORTANT]
> Never duplicate or edit official HyperFrames skills in our repository. Treat them as authoritative external production knowledge. Our internal `hyperframes-production` skill defines *when* and *how* AI Animation Studio compiles neutral `ShotContract` models into HyperFrames compositions.

---

## 7. Adding & Validating Custom Skills

1. Create a directory `.agents/skills/<category>/<skill-id>/`.
2. Add a `SKILL.md` file with standard YAML frontmatter (`name`, `version`, `category`, `description`, `dependencies`, `applicablePhases`).
3. Register the skill in `.agents/skills/registry.json`.
4. Validate with `npm run skills:check`.
