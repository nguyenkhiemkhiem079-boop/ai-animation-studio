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
```

### Knowledge vs Execution
- **Skills (`.agents/skills/`)**: Provide **KNOWLEDGE**, mental models, guidelines, diagnostic decision trees, and workflow protocols.
- **Core Domain (`packages/core/`)**: Provides **EXECUTION**, runtime schemas, algorithms, storage, pipelines, and validation.
- **Cinematic Registry (`packages/core/src/cinematic-skills/`)**: Provides runtime application-level cinematic capability definitions.

---

## 2. Skill Categories & Directory Layout

All skills reside in `.agents/skills/` organized by domain:

| Category | Description | Primary Skills |
| :--- | :--- | :--- |
| **`studio`** | Central router entry point | `studio/SKILL.md` |
| **`development`** | Engineering rigor, auditing, and gates | `repo-audit`, `architecture-review`, `implementation`, `testing`, `debugging`, `phase-gate` |
| **`story`** | Script ingestion, beat extraction, preservation | `story-analyze`, `source-preservation`, `story-coverage`, `canon-conflict` |
| **`universe`** | Persistent series canon & state | `universe-resolve`, `character-resolve`, `world-state-check` |
| **`directing`** | Scene staging, shot planning, cinematic grammar | `scene-direct`, `shot-plan`, `cinematography` |
| **`character`** | Identity lock, turnarounds, facial QA | `character-consistency`, `identity-qa` |
| **`world`** | Environments, spatial sets, lighting continuity | `environment-resolve` |
| **`production`** | Routing, reference binding, retakes, continuation| `production-route`, `hyperframes-production`, `reference-binding`, `continuation`, `retake` |
| **`qa`** | Continuity audits, visual frame inspection, director QA| `continuity-qa`, `visual-qa`, `director-qa` |
| **`external`** | Official third-party framework skills | `hyperframes`, `hyperframes-core`, `hyperframes-animation` |

---

## 3. External Skills & HyperFrames Integration

Official external skills are installed directly from upstream repositories and tracked in `.agents/skills/registry.json` as `type: EXTERNAL`.

### HyperFrames Skills
Installed via:
```bash
npx skills add heygen-com/hyperframes
```
- `/hyperframes`: Root entry point for declarative motion design.
- `/hyperframes-core`: Core composition primitives, audio, and asset specs.
- `/hyperframes-animation`: Animation syntax, easing, camera movements, and layer transforms.

### Update & Health Check
- Check status: `npx hyperframes skills check`
- Update skills: `npx hyperframes skills update`

> [!IMPORTANT]
> Never duplicate or edit official HyperFrames skills in our repository. Treat them as external production knowledge. Our internal `hyperframes-production` skill defines *when* and *how* AI Animation Studio translates `ShotContract` semantics into HyperFrames compositions.

---

## 4. Architectural Influences & Attribution

AI Animation Studio studied patterns from leading open-source animation and video orchestration projects:

### 1. HyperFrames (`heygen-com/hyperframes`)
- **Adopted**: Declarative timeline composition, camera choreography, deterministic layer animation, and zero-cost 2D/2.5D transforms.
- **Rejected/Deferred**: We do not duplicate their compiler or component schemas inside core domain models. We compile our neutral `ShotContract` to their format at production runtime.

### 2. OpenMontage (`calesthio/OpenMontage`)
- **Adopted**: Agent contracts, stage-based pipelines, provider fallback, resource metadata, retries, cost awareness, and production QA.
- **Rejected/Deferred**: We intentionally avoided copying AGPL code or vendoring monolithic pipelines. Our modular DAG pipeline and `IProvider` architecture remain authoritative.

### 3. Seedance Skill OS (`Emily2040/seedance-2.0`)
- **Adopted**: Provider-neutral concepts: reference role binding, sequence state, first/last frame continuation, motion contracts, shot-specific character contracts, retake protocol, and Director DNA.
- **Rejected/Deferred**: Seedance-specific prompt compilers and client-tied installers were rejected. All concepts are implemented as provider-neutral Studio contracts.

---

## 5. Adding & Validating Custom Skills

### Adding a New Skill
1. Create a directory `.agents/skills/<category>/<skill-id>/`.
2. Add a `SKILL.md` file with standard YAML frontmatter:
   ```yaml
   ---
   name: my-skill
   version: 1.0.0
   category: production
   description: "Concise summary of skill purpose."
   dependencies:
     - production-route
   applicablePhases:
     - "Phase 4"
     - "Phase 5"
   ---
   ```
3. Register the skill in `.agents/skills/registry.json`.
4. Run validation:
   ```bash
   npm run skills:check
   ```

### Validation Gates
The validation system verifies:
- Unique skill IDs across custom and external skills.
- Semver version strings (e.g. `1.0.0`).
- Valid category enum.
- Existing entrypoint files on disk.
- Dependency existence in the registry.
- Acyclic dependency graph (no circular dependencies).

---

## 6. Skill Security Guidelines

All skills must adhere to strict security constraints:
- **No Secret Exfiltration**: Skills must never instruct agents or scripts to read, print, or log API keys, secrets, or `.env` files.
- **No Destructive Commands**: Skills must never recommend unconstrained deletion commands (`rm -rf`, `git clean -fdx`) without explicit user review.
- **No Private Data Uploads**: Skills must not configure background uploads of user project data to unauthorized external endpoints.
- **Audit External Skills**: Inspect any newly installed external skill files before running them in production.
