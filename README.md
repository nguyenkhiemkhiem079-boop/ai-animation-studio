# AI Animation Studio

> **Series-aware, character-consistent, provider-independent generative animation pipeline.**

Repository: `nguyenkhiemkhiem079-boop/ai-animation-studio`

---

## 🌟 Vision & Objective

The **AI Animation Studio** converts full user story content into complete, editable, multi-episode animated productions.

```
FULL USER CONTENT
      ↓
Story Intelligence (Source-preserving, beats, candidates)
      ↓
Persistent Universe (Character DNA, Location DNA, isolated series memory)
      ↓
Scene & Shot Direction (Cinematic grammar, ShotContract, shot rhythm)
      ↓
Character & Asset Resolution (Consistency, deduplication, pose/expression libraries)
      ↓
Production Planning & Routing (Deterministic HyperFrames first, generative video as needed)
      ↓
Animation / Generative Video (Rigged 2D actors, layer transforms, video synthesis)
      ↓
Voice / Music / SFX
      ↓
Editing / Timeline Assembly
      ↓
Continuity QA & Auto-Repair
      ↓
Final Render (MP4 + Editable Project)
```

---

## 🏛️ Architectural Tenets

1. **Provider-Independent**: External engines (Gemini, Veo, Seedance, HyperFrames) are modular workers, not the core product.
2. **Series-Aware**: Multi-episode series maintain isolated universes; historical versions (v1, v2) remain immutable.
3. **Character-Consistent**: Visual assets are indexed, deduplicated by SHA-256, and verified against identity locks.
4. **Source-Preserving**: The original user story is preserved losslessly; every beat and shot traces back to source offsets.
5. **Deterministic First**: Prioritizes local deterministic animations (HyperFrames, parallax, camera motion) to minimize latency and generative video costs.
6. **Resumable**: DAG-based pipeline with state snapshots and checkpointer (`CheckpointManager`).
7. **100% Testable Locally**: Fully functional offline via in-memory storage, mock providers, and local event buses.

---

## 📦 Monorepo Structure

```
ai-animation-studio/
├── .github/workflows/ci.yml    # Continuous Integration pipeline
├── docs/architecture/          # System design documents
│   ├── 00-overview.md
│   ├── 01-domain-model.md
│   ├── 02-provider-model.md
│   └── 03-pipeline-and-checkpoints.md
├── packages/
│   ├── core/                   # Domain schemas, pipeline, storage, providers, checkpoints
│   │   ├── src/
│   │   │   ├── domain/         # Zod schemas (Project, Universe, Story, Director, Asset, Cinematic)
│   │   │   ├── errors/         # StudioError hierarchy
│   │   │   ├── logging/        # Contextual structured logger
│   │   │   ├── events/         # Strongly-typed event bus
│   │   │   ├── storage/        # FileSystemStorage & MemoryStorage
│   │   │   ├── checkpoint/     # CheckpointManager
│   │   │   ├── pipeline/       # Pipeline execution engine
│   │   │   ├── providers/      # IProvider, ProviderRegistry, MockProvider
│   │   │   ├── asset-registry/ # AssetRegistry (dedup, versioning, canon approval)
│   │   │   ├── cinematic-skills/# Semantic skills (push_in, orbit, etc.)
│   │   │   └── universe/       # UniverseManager, WorldStateTracker, UniverseResolver, ProjectManager
│   │   └── tests/              # Vitest test suite
│   └── cli/                    # Studio developer CLI
│       ├── src/
│       └── tests/
├── AGENTS.md                   # Contributor & AI Agent guidelines
├── package.json
└── tsconfig.json
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation
```bash
npm install
```

### Build & Typecheck
```bash
npm run build
npm run typecheck
```

### Run Tests
```bash
npm run test
```

### CLI Usage
```bash
# Check studio environment health
npx studio doctor

# Checkpoints
npx studio checkpoint list <projectId>
npx studio checkpoint create <projectId> v0.1-foundation
npx studio checkpoint restore <projectId> v0.1-foundation

# Universe & Characters
npx studio universe show <seriesId>
npx studio character list <seriesId>
npx studio universe export <seriesId> backup.json
npx studio universe import <seriesId> backup.json

# Validate a JSON artifact against domain schemas
npx studio inspect ./project.json project
```

---

## 🗺️ Development Roadmap

- [x] **PHASE 0: FOUNDATION** (`v0.1-foundation`)
  * Monorepo skeleton, Core domain, Zod schemas, Provider abstraction, Pipeline engine, Checkpoint system, Asset Registry, ShotContract, CinematicSkill foundation, Storage abstraction, Errors, Logging, Events, Vitest test suite, CI workflow, AGENTS.md, Architecture documentation.
- [x] **PHASE 1: PROJECT + SERIES + UNIVERSE CORE** (`v0.2-universe`)
  * Series namespace isolation, UniverseManager, Immutable CharacterDNA versioning, LocationDNA zones & props, Relationships, WorldStateTracker, StateTransitions, ContinuitySnapshot, UniverseResolver, Local persistence, Universe import/export.
- [ ] **PHASE 2: STORY INTELLIGENCE ENGINE** (`v0.3-story-intelligence`)
- [ ] **PHASE 3: SCENE & SHOT DIRECTOR** (`v0.4-director`)
- [ ] **PHASE 4: CHARACTER & ASSET STUDIO** (`v0.5-character-assets`)
- [ ] **PHASE 5: WORLD & ENVIRONMENT STUDIO** (`v0.6-world-studio`)
- [ ] **PHASE 6: PRODUCTION ROUTER & ASSET GENERATION** (`v0.7-production-router`)
- [ ] **PHASE 7: HYPERFRAMES & DETERMINISTIC ANIMATION** (`v0.8-hyperframes`)
- [ ] **PHASE 8: CHARACTER ANIMATION SYSTEM** (`v0.9-character-animation`)
- [ ] **PHASE 9: GENERATIVE VIDEO PROVIDERS**