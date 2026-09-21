# AI Animation Studio

> **Series-aware, character-consistent, provider-independent generative animation pipeline.**

Repository: `nguyenkhiemkhiem079-boop/ai-animation-studio`

---

## 🌟 Vision & Objective

The **AI Animation Studio** converts full user story content into complete, editable, multi-episode animated productions.

```
FULL USER CONTENT
      ↓
Story Intelligence (Source-preserving, beats, candidates, coverage, hallucination guard)
      ↓
Persistent Universe (Character DNA, Location DNA, isolated series memory)
      ↓
Scene & Shot Direction (Cinematic grammar, ShotContract, shot rhythm, DirectorQA)
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
│   │   │   ├── universe/       # UniverseManager, WorldStateTracker, UniverseResolver, ProjectManager
│   │   │   ├── story/          # SourceDocumentManager, StoryAnalyzer, Coverage, HallucinationGuard
│   │   │   └── director/       # ShotPlanner, Sub-directors, CinematicGrammar, DirectorQA
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

# Story Intelligence
npx studio story ingest <projectId> script.txt
npx studio story analyze <projectId> script.txt [seriesId]
npx studio story report <projectId> script.txt [seriesId]

# Scene & Shot Director
npx studio director plan <projectId>
npx studio director qa <projectId>
npx studio director list <projectId>

# Character & Assets
npx studio character sheet <seriesId> <characterId>
npx studio character resolve <seriesId> <characterId> <view|expression|pose> <key>
npx studio character qa <seriesId> <characterId> <assetId>
npx studio character approve <assetId>

# World & Environment
npx studio world show <seriesId> <locationId>
npx studio world staging <seriesId> <locationId> [zoneId]
npx studio world resolve <seriesId> <locationId> [zoneId]
npx studio world props <seriesId> <locationId> [zoneId]

# Production Routing & Budgeting
npx studio production route <projectId> <shotId>
npx studio production plan <projectId> [seriesId]
npx studio production budget <projectId> [--set-cap <usd>]

# HyperFrames & Deterministic Animation
npx studio hyperframes compile <projectId> <shotId>
npx studio hyperframes preview <projectId> <shotId>
npx studio hyperframes render <projectId> <shotId>

# Digital Actor Animation & Lip-Sync
npx studio actor list-clips
npx studio actor animate <characterId> <clipName> [--dialogue <text>]
npx studio actor lipsync <characterId> "<dialogue text>"

# Generative Video Providers & Continuation
npx studio video list-providers
npx studio video render <projectId> [shotId] [--provider <id>]
npx studio video continuation <projectId> <shotA> <shotB>
npx studio video retake <projectId> <shotId> --reason <reason> [--type <type>]

# Voice, Music & SFX Audio Studio
npx studio audio list-voices [seriesId]
npx studio audio voice-synth <charId> "<dialogue text>" [seriesId]
npx studio audio score <projectId> [sceneId] [--mood <mood>]
npx studio audio sfx <projectId> [shotId] [--name <name>]
npx studio audio mix [projectId]

# Validate a JSON artifact against domain schemas
npx studio inspect ./project.json project
```

---

## 🗺️ Development Roadmap

- [x] **PHASE 0: FOUNDATION** (`v0.1-foundation`)
  * Monorepo skeleton, Core domain, Zod schemas, Provider abstraction, Pipeline engine, Checkpoint system, Asset Registry, ShotContract, CinematicSkill foundation, Storage abstraction, Errors, Logging, Events, Vitest test suite, CI workflow, AGENTS.md, Architecture documentation.
- [x] **PHASE 1: PROJECT + SERIES + UNIVERSE CORE** (`v0.2-universe`)
  * Series namespace isolation, UniverseManager, Immutable CharacterDNA versioning, LocationDNA zones & props, Relationships, WorldStateTracker, StateTransitions, ContinuitySnapshot, UniverseResolver, Local persistence, Universe import/export.
- [x] **PHASE 2: STORY INTELLIGENCE ENGINE** (`v0.3-story-intelligence`)
  * Lossless source document ingestion, character-offset segmentation, RuleBasedStoryAnalyzer, ProviderStoryAnalyzer, Candidate != Canon extraction, exact source traceability, Source Coverage calculation, Hallucination Guard, Canon conflict detection, StoryIntelligenceStep for DAG pipeline.
- [x] **PHASE 3: SCENE & SHOT DIRECTOR** (`v0.4-director`)
  * ShotContract planning, DirectorProfile DNA, specialized sub-directors (Camera, Acting, Composition, Lighting, Motion, Transition), CinematicGrammarEngine (180-degree rule, repetition detection, shot rhythm), ShotDependencyGraph, DirectorQA, DirectorPipelineStep.
- [x] **PHASE 4: CHARACTER & ASSET STUDIO** (`v0.5-character-assets`)
  * Character Studio, Canonical Character Sheet (6 turnaround views), ExpressionLibrary, PoseLibrary, OutfitLibrary, CharacterAssetFactory, AssetResolver & AssetReuseEngine, CharacterReferenceResolver, IdentityLock & IdentityQAEvaluator, CharacterAssetPipelineStep for DAG pipeline.
- [x] **PHASE 5: WORLD & ENVIRONMENT STUDIO** (`v0.6-world-studio`)
  * SpatialMemory & 2D/3D SceneMap staging, Multi-plane depth layer management (foreground, midground, background, depth_map), Parallax displacement computation (pan, truck, push_in), Lighting presets (noir, golden hour, high noon, etc.), Atmosphere presets (dense fog, blizzard, dust motes, etc.), PropPlacementTracker & mutable prop state tracking, LocationReferenceResolver, WorldStudio coordinator, WorldEnvironmentPipelineStep for DAG pipeline.
- [x] **PHASE 6: PRODUCTION ROUTER & ASSET GENERATION** (`v0.7-production-router`)
  * ProductionRouter implementing Deterministic Animation First rules, PromptCompiler implementing reference-binding discipline and anti-bleed rules, BudgetController for monitoring and enforcing financial caps, RenderCache for deterministic SHA-256 deduplication and zero-cost re-runs, ProviderBenchmarkTracker for performance, cost, and quality statistics, JobOrchestrator with automatic retries and fallback providers, ProductionPlanningPipelineStep for DAG pipeline.
- [x] **PHASE 7: HYPERFRAMES & DETERMINISTIC ANIMATION** (`v0.8-hyperframes`)
  * HyperFramesCompositionCompiler compiling ShotContracts and layer hierarchies into standalone HTML compositions, ParallaxEngine computing differential motion vectors for multi-plane depth, HyperFramesLayerSystem structuring foreground/midground/backdrop/subtitle layers, CinematicSkillCompiler translating semantic skills (push_in, pull_out, pan_left, orbit, handheld, vintagefilm, motionblur, slowmo) into seekable GSAP timelines, HyperFramesAdapter (IProvider) rendering deterministic animations at $0.00 cost, HyperFramesExecutionPipelineStep for DAG pipeline.
- [x] **PHASE 8: CHARACTER ANIMATION SYSTEM** (`v0.9-character-animation`)
  * 15-bone humanoid Skeleton with Forward Kinematics (FK), CharacterAnimationLibrary with 14 standard keyframed clips (idle, walk, run, sit, stand, turn, look, point, wave, pick_up, hold, react, fear, surprise), FacialSystem with naturalistic blink cycles and gaze direction, LipSyncEngine translating text dialogue into timed visemes, AnimationBlender for cross-fading and sampling, CharacterController orchestrating actor motions, RigToHyperFramesCompiler for compiling actor rigs into HyperFrames GSAP tweens, CharacterAnimationPipelineStep for DAG pipeline.
- [x] **PHASE 9: GENERATIVE VIDEO PROVIDERS & CONTINUATION** (`v0.10-generative-video`)
  * Generative Video Provider Adapters (`VeoVideoAdapter`, `SeedanceVideoAdapter`, `ComfyUIVideoAdapter`, `MockVideoProvider`), Reference conditioning binding (turnaround images, start frames, environment plates), ContinuationEngine extracting terminal frames (`FRAME_TERMINAL_<shotId>`) and binding `START_FRAME` across cut boundaries, SurgicalRetakeEngine for targeted single-variable adjustments (lighting, acting, camera speed, seed variation) with lineage tracking, GenerativeVideoPipelineStep for DAG pipeline, Studio CLI video commands.
- [x] **PHASE 10: VOICE, MUSIC & SFX AUDIO STUDIO** (`v0.11-audio-studio`)
  * Domain models (`CharacterVoiceProfile`, `AudioDialogueTrack`, `MusicTrack`, `SfxCue`, `AudioMixContract`), Audio Provider Adapters (`ElevenLabsVoiceAdapter`, `MusicGenAdapter`, `FoleySfxAdapter`, `MockAudioProvider`), VoiceStudio managing character vocal identity and syncing with LipSyncEngine, ScoreComposer for background musical themes and scene pacing, FoleyMixer for shot-level sound effects, AudioMixEngine with automatic dialogue ducking (-6dB) and Web Audio API export, AudioProductionPipelineStep for DAG pipeline, Studio CLI audio commands.
- [ ] **PHASE 11: TIMELINE, EDITING & FINAL RENDER**