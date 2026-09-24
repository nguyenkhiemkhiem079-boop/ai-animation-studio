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

# Multi-Track Timeline & Subtitles
npx studio timeline assemble <projectId> [sceneId]
npx studio timeline inspect <projectId>
npx studio timeline subtitles <projectId> [--format srt|vtt]

# Continuity QA & Automated Repairs
npx studio qa audit <projectId>
npx studio qa repair <projectId>

# Master Export & Packaging
npx studio export html5 <projectId>
npx studio export nle <projectId> [--format otio|edl]
npx studio export render <projectId> [--format mp4|webm]

# End-to-End Master Production Pipeline
npx studio run <storyFile> [--project <id>] [--series <id>] [--from-checkpoint <ckptId>]
npx studio status <projectId>

# Interactive Studio Web Suite
npx studio ui [--port <port>]
npm run ui

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
- [x] **PHASE 11: TIMELINE, EDITING & MULTI-TRACK ASSEMBLY** (`v0.12-timeline-assembly`)
  * Domain models (`TimelineTrack`, `TimelineClip`, `TimelineTransition`, `TimelineSequence`, `SubtitleItem`), `SubtitleGenerator` generating .srt and .vtt WebVTT formats, `CutTransitionEngine` validating temporal overlap and generating CSS keyframe mix curves, `TimelineAssembler` compiling video, dialogue, score, SFX, and subtitle tracks, `TimelineEditingPipelineStep` for DAG pipeline, Studio CLI timeline commands (`assemble`, `inspect`, `subtitles`).
- [x] **PHASE 12: CONTINUITY QA & AUTO-REPAIR** (`v0.13-continuity-qa`)
  * Domain models (`ContinuityCheckResult`, `RepairAction`, `ContinuityQAReport`), `ContinuityQAEvaluator` checking 180-degree screen direction, lighting jumps, prop persistence, wardrobe mismatches, pacing stalling, and audio lip-sync bounds, `AutoRepairEngine` applying automated fixes (cross-dissolve softens, wardrobe sync, digital push-in transform, audio duration adjustments), `ContinuityQAPipelineStep` for DAG pipeline, Studio CLI qa commands (`audit`, `repair`).
- [x] **PHASE 13: MASTER RENDER, HTML5 PLAYER & NLE INTERCHANGE** (`v0.14-master-render`)
  * Domain models (`ExportFormat`, `OutputFileDescriptor`, `ExportManifest`), `Html5PlayerPackager` compiling standalone interactive HTML5 player with dark mode UI, timeline scrub bar, Web Audio stems, and subtitle captions, `NLEInterchangeExporter` generating OpenTimelineIO (.otio) and CMX 3600 (.edl) formats for DaVinci Resolve, Premiere Pro, and Final Cut, `VideoRenderer` compiling MP4/WebM render manifests, `MasterExportPipelineStep` for DAG pipeline, Studio CLI export commands (`html5`, `nle`, `render`).
- [x] **PHASE 14: END-TO-END PIPELINE DAG ORCHESTRATOR** (`v0.15-end-to-end`)
  * `StudioPipelineFactory` composing all 11 production steps in topological sequence with automated checkpointing and resume support, `ProductionSummaryCalculator` computing financial metrics and cost savings (Deterministic Animation First), Studio CLI commands (`studio run <storyFile>`, `studio status <projectId>`), comprehensive end-to-end execution testing.
- [x] **PHASE 15: INTERACTIVE STUDIO PLAYER & PRODUCTION WEB APP** (`v1.0-studio-complete`)
  * Full-featured production web suite (`@ai-studio/studio-ui`), Dual-Mode Player (Deterministic HyperFrames DOM vs Master Video Compositor), Multi-Track Timeline Editor with draggable playhead, Web Audio multichannel mixer, Screenplay Source with character highlights and narrative beats, Canonical Character Turnaround (6-view inspector with Identity Lock), Dynamic Cost Savings Gauge (Deterministic vs Generative Benchmark), One-click NLE and deliverable downloads, Studio CLI command (`studio ui`).
- [x] **PHASE 16: PRODUCTION REALITY & MOCK ELIMINATION** (`PRODUCTION VERIFIED`)
  * Real FFmpeg/FFprobe media toolchain integration, headless Chrome frame capture via `HyperFramesVideoBridge`, real wav/mp3 audio generation and multichannel mixer, physical media artifact verification on disk with `ArtifactVerifier`, strict `ProductionSafetyError` enforcement in PRODUCTION mode, end-to-end golden smoke pipeline producing verified master MP4 video deliverable.
- [x] **PHASE 16.5: GOOGLE AI STUDIO / GEMINI INTEGRATION** (`IMPLEMENTED`, Live Verification: `OPTIONAL / NOT RUN IN CI`)
  * Provider-independent LLM abstraction (`LLMProvider`, `LLMProviderRegistry`), official `@google/genai` integration via Google AI Studio API key (`GEMINI_API_KEY`), centralized role-based model policy (`FAST`, `REASONING`, `STRUCTURED`, `QA`), Zod-validated structured outputs, source-preserving Story Intelligence integration, `LLMDirectorAssistant` with strict user lock precedence, `SemanticQAEvaluator` with explicit deterministic vs LLM provenance, bounded exponential backoff on 429 rate limits, deterministic series-isolated cache (`LLMCache`), provider diagnostics (`studio providers doctor`, `studio gemini doctor`).
- [x] **PHASE 17 — MULTIMODAL VISUAL SEMANTIC CONTINUITY QA** (`LOCAL_VERIFIED`, `CI_VERIFIED`)
  * Real keyframe extraction via `FrameExtractor`, multimodal vision evaluation via `VisualSemanticQAEvaluator`, 4-pillar continuous scoring (identity consistency, spatial perspective, visual defect rate, overall continuity), structured defect taxonomy and surgical retake recommendations, truthful auto-repair integration into `ContinuityQA`, offline metadata evaluation mode with explicit provenance (`LOCAL_MEDIA_METADATA` vs `MULTIMODAL_VISION_MODEL`), visual QA smoke test (`npm run smoke:visual-qa`).
- [x] **PHASE 18 — REAL PRODUCTION PILOT & LIVE PROVIDER EVIDENCE** (`CLOSED`, `LOCAL_VERIFIED`, `CI_VERIFIED`, Master Production: `NOT VERIFIED (OFFLINE_REHEARSAL_VERIFIED)`)
  * First-class `ProductionRun` domain model with 15-state lifecycle and fail-closed transitions, durable sanitized evidence store (`production-run.json`, `provider-evidence.json`, `media-evidence.json`, `qa-evidence.json`, `approval-evidence.json`, `master-evidence.json`), quota-aware execution transitioning to `WAITING_FOR_PROVIDER` while preserving completed work, assisted Google Flow handoff (`NEEDS_USER_ACTION`) and resumable media import (`studio production import`), strict media authority (Candidate != Canon, QA pass != Human approval), `ProductionLeakDetector` preventing test/smoke artifacts from becoming production canon, 13-point `ProductionMasterVerifier` gate, canonical production pilot harness (`CanonicalProductionPilot`), deterministic offline provider double (`DeterministicOfflineLLMDouble`), studio CLI production commands (`create`, `run`, `status`, `resume`, `evidence`, `import`, `approve`, `reject`, `verify`, `verify-live`), studio UI production run monitor.
- [x] **PHASE 19 — REAL PRODUCTION OPERATOR WORKFLOW** (`CLOSED`, `LOCAL_VERIFIED`, `CI_VERIFIED`)
  * Closed Phase 18 trust semantics (operator challenge ceremony defined as application-level boundary); canonical 1-shot pilot mode (`studio production pilot <storyFile>`); deterministic Google Flow operator handoff package (`.studio/production/<projectId>/<runId>/handoff/<shotId>/`) with prompts, reference assets, continuity parameters, and expected filename; strict external media inbox with FFprobe stream validation, SHA-256 bindings, and automatic invalidation of stale approvals/challenges upon re-import; live Gemini multimodal visual QA ready state (8 dimensions, quota-aware transition to `WAITING_FOR_PROVIDER` without mock fallback); unified Next-Action engine (`ProductionNextActionResolver`) and 11-step status matrix; real-production pilot Studio UI dashboard; acceptance bundle finalization with `approval-challenges.json` and strict secret sanitization; normalized error taxonomy (`ProductionErrorCode`).
- [x] **PHASE 20 — OFFLINE ACCEPTANCE READINESS & TRUST HARDENING** (`CLOSED`, `LOCAL_VERIFIED`, `CI_VERIFIED`)
  * `ProductionPilotReadinessValidator` (zero-network preflight inspecting Node, FFmpeg, FFprobe, storage, single-credential Gemini configuration, model policies, and Flow bridge), dry-run mode (`studio production pilot <storyFile> --dry-run`), story input hardening (lossless UTF-8 preservation, BOM stripping, empty input rejection), filesystem security containment (`assertSafeIdentifier`, `assertPathContained`), elimination of command injection risks across all FFmpeg/FFprobe invocations (`execFileSync` with argument arrays), production run schema versioning (`schemaVersion: 1`, `revision: 1`), safe structural migrations (`migrateProductionRun`), deterministic key and array sorting in `ProductionAcceptanceBundle`.
- [x] **PHASE 21 — MULTI-SHOT OFFLINE PRODUCTION CONTRACTS** (`CLOSED`, `OFFLINE_REHEARSAL_VERIFIED`, `CI_VERIFIED`)
  * Canonical 3-shot offline rehearsal scenarios, circular DAG detection in `DirectorQA`, `ContinuationEngine` terminal frame reference binding, CharacterDNA and LocationDNA continuity persistence across shots, prop state tracking in `WorldStateTracker`, director 180-degree eyeline clash detection, per-shot retake isolation preserving earlier approved shot evidence, multi-shot timeline binding, multi-shot acceptance bundles with required-shot set validation, budget controller cap enforcement.
- [x] **PHASE 22 — RELIABILITY, CONCURRENCY & RECOVERY HARDENING** (`CLOSED`, `LOCAL_VERIFIED`, `CI_VERIFIED`)
  * Single-writer concurrency model with optimistic revision checking (`expectedRevision`), `cancelRun` with durable state preservation, `CorruptedEvidenceError` with actionable fail-closed diagnostics, physical checksum caching for read-only status commands, centralized secret redaction (`redactSecrets`) removing API keys and bearer tokens from logs, error reports, and exported evidence.
- [x] **PHASE 23 — RELEASE CANDIDATE ENGINEERING** (`RC PREPARED`, `OFFLINE_REHEARSAL_VERIFIED`)
  * Truthful doctor diagnostics cleanly categorizing `REQUIRED`, `OPTIONAL`, and `LIVE-ONLY` components; machine-readable `--json` output for `status` and `evidence`; sanitized evidence export (`studio production export-evidence <runId> [destinationDir]`); comprehensive final adversarial chain test verifying tampering detection, per-shot isolation, repair, master rendering, and acceptance integrity; release candidate trust model documentation (`docs/architecture/trust-model.md`).

---

## 🔒 Production Verification Status

| Milestone | Status | Details |
| :--- | :--- | :--- |
| **Phases 0–19** | **CLOSED** | Foundation, Universe, Director, HyperFrames, Generative Video, Audio, Web UI, Operator Workflow. |
| **Phase 20** | **CLOSED** | Safe zero-network pilot validator, dry-run, path traversal hardening, command injection audit. |
| **Phase 21** | **CLOSED** | 3-shot contracts, DAG ordering, continuity, retake isolation, multi-shot acceptance bundle. |
| **Phase 22** | **CLOSED** | Optimistic revision checking, corrupted JSON recovery, secret redaction, safe cleanup rules. |
| **Phase 23** | **RC PREPARED** | Doctor audit, `--json` inspector, `export-evidence`, adversarial chain test, trust model guide. |
| **GENUINE LIVE PILOT** | **PENDING** | **Ready for first genuine operator pilot execution with live Gemini & Google Flow.** |
| **REAL MASTER PRODUCTION** | **NOT VERIFIED** | **`OFFLINE_REHEARSAL_VERIFIED`** (Master production verification requires live human pilot). |