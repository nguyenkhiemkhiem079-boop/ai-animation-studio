# Phase 16 — Production Reality Classification

This document provides a component-by-component reality audit of the AI Animation Studio repository as of commit `3c2322d`. Every important system component is classified into exactly one of:

- `REAL`: Executes actual business logic, produces genuine media or data artifacts on the physical filesystem, and connects end-to-end.
- `MOCK`: Synthesizes or hardcodes behavior specifically intended for unit testing or offline simulation.
- `STUB`: Minimal placeholder interface or method returning canned/fixed values.
- `SIMULATED`: Generates realistic-looking metadata, timestamps, or fake URIs without producing corresponding physical files.
- `PLACEHOLDER`: Structural code reserved for future integration.
- `PARTIAL`: Real architecture/abstraction exists, but depends on unconfigured external executors or missing bridges to complete execution.
- `DISCONNECTED`: Implemented component that is not wired into the main pipeline or CLI execution path.
- `BROKEN`: Code with failing contracts or invalid assumptions.
- `DEAD_CODE`: Unused or unreferenced code.
- `TEST_ONLY`: Code exclusively designed for and referenced by test suites.

---

## Component Reality Classification Matrix

| Component | Package / Path | Claimed Capability | Reality | Evidence | Production Blocker? | Remediation / Action in Phase 16 |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **VideoRenderer** | `core/export/video-renderer.ts` | MP4 master render & WebM render | **SIMULATED** | Only creates `ExportManifest` JSON; estimates byte size via `duration * 2.5MB`; does not invoke FFmpeg or create any video file on disk. | **YES** | Implement real FFmpeg renderer executing H.264/AAC muxing and verifying output with FFprobe. |
| **HyperFramesAdapter** | `core/hyperframes/hyperframes-adapter.ts` | Deterministic animation execution ($0.00) | **PARTIAL** | Compiles valid HTML compositions and writes `.html` to storage, but does not capture frames or render video files (`HTML != MP4`). HealthCheck unconditionally returns `true`. | **YES** | Build real headless browser frame capture bridge (PNG sequence -> FFmpeg -> MP4). |
| **AudioMixEngine** | `core/audio/audio-mix-engine.ts` | Master audio mix with ducking | **SIMULATED** | Compiles `AudioMixContract` and generates Web Audio JS script string; does not mix physical audio files or produce `.wav` / `.aac`. | **YES** | Implement FFmpeg multi-stem audio mixer with dynamic volume ducking. |
| **ElevenLabsVoiceAdapter** | `core/audio/elevenlabs-adapter.ts` | Character voice synthesis & TTS | **PARTIAL** | Has full payload schema, but falls back to fake `.studio/audio/dialogue/...wav` URI without writing audio file unless external `executor` is injected. | **YES** | Require real executor/credentials in PRODUCTION; provide real tone/silence generator for LOCAL mode. |
| **MusicGenAdapter** | `core/audio/musicgen-adapter.ts` | Background music score generation | **PARTIAL** | Generates fake `.studio/audio/music/...mp3` URI if executor not provided. HealthCheck returns `true`. | **YES** | Mark PARTIAL; provide real local test audio generator in LOCAL mode. |
| **FoleySfxAdapter** | `core/audio/foley-adapter.ts` | Sound effect cue generation | **PARTIAL** | Returns fake `.studio/audio/sfx/...wav` URI when unconfigured. | **YES** | Mark PARTIAL; generate real local test WAV in LOCAL mode. |
| **MockVideoProvider** | `core/video-providers/mock-video-provider.ts` | Generative video synthesis | **MOCK** | Simulates latency and returns fake `.studio/videos/...mp4` URI. | **EXPECTED** | Restrict to MOCK execution mode; forbid running in PRODUCTION mode. |
| **MockAudioProvider** | `core/audio/mock-audio-provider.ts` | Dialogue & music synthesis | **MOCK** | Returns fake audio URIs for testing. | **EXPECTED** | Restrict to MOCK execution mode; forbid in PRODUCTION. |
| **VeoVideoAdapter** | `core/video-providers/veo-adapter.ts` | Google Veo video generation | **PARTIAL** | Assembles valid client payload, but emits fake `.studio/videos/...veo.mp4` URI if executor absent. HealthCheck returns `true` without credential verification. | **YES** | Fix healthCheck to verify credentials; forbid fake URIs in PRODUCTION mode. |
| **SeedanceVideoAdapter** | `core/video-providers/seedance-adapter.ts` | ByteDance Seedance video generation | **PARTIAL** | Emits fake URI without real network request if executor absent. HealthCheck returns `true`. | **YES** | Fix healthCheck to check credentials/connectivity. |
| **ComfyUIVideoAdapter** | `core/video-providers/comfyui-adapter.ts` | Local ComfyUI workflow generation | **PARTIAL** | Builds prompt workflow JSON, but falls back to fake URI without pinging ComfyUI server. | **YES** | Fix healthCheck to actually ping `http://127.0.0.1:8188/system_stats`. |
| **AssetRegistry** | `core/asset-registry/index.ts` | Canon asset management & deduplication | **PARTIAL** | Has in-memory & FS metadata tracking, but does not verify physical file presence, size > 0, or checksum match on disk. | **YES** | Add `artifactState` (`DECLARED`, `GENERATED`, `VERIFIED`, `MISSING`, `CORRUPT`) and verify physical files. |
| **CharacterAssetFactory** | `core/character/character-asset-factory.ts` | Canonical turnaround generation | **SIMULATED** | Creates asset metadata records with fake `1MB nominal placeholder` size without creating actual binary image files. | **YES** | Distinguish planned asset metadata from verified physical image files. |
| **RenderCache** | `core/production/render-cache.ts` | Deterministic rendering deduplication | **PARTIAL** | Caches `GenerationResult` metadata in memory, but does not verify whether the cached file still physically exists on disk. | **YES** | Add disk artifact verification; return `CACHE_STALE` if file is missing. |
| **ProductionRouter** | `core/production/production-router.ts` | Route assignment & cost estimation | **REAL** | Deterministically routes shots based on complexity, camera movement, and budget caps. | **NO** | Add safety guard preventing mock providers in PRODUCTION mode. |
| **JobOrchestrator** | `core/production/job-orchestrator.ts` | Provider dispatching & retries | **REAL** | Dispatches jobs, tracks benchmarks, records budget expenses, and manages fallbacks. | **NO** | Prevent silent fallback to mock providers when running in PRODUCTION mode. |
| **ContinuityQAEvaluator** | `core/qa/continuity-qa-evaluator.ts` | 180° rule, lighting, prop audit | **REAL** | Full heuristic analysis of shot boundaries, screen direction, and lighting jumps. | **NO** | Retain as real logic. |
| **AutoRepairEngine** | `core/qa/auto-repair-engine.ts` | Automated continuity repairs | **REAL** | Inserts real cross-dissolves, wardrobe synchronizations, and audio timing corrections. | **NO** | Retain as real logic. |
| **Html5PlayerPackager** | `core/export/html5-player-packager.ts` | Standalone player compilation | **REAL** | Compiles complete, offline-capable HTML with embedded JS, CSS, scrubhead, and Web Audio. | **NO** | Retain as real logic. |
| **NLEInterchangeExporter** | `core/export/nle-interchange-exporter.ts` | OTIO and CMX 3600 EDL export | **REAL** | Produces valid OpenTimelineIO JSON and standard CMX 3600 EDL text format. | **NO** | Retain as real logic. |
| **SubtitleGenerator** | `core/timeline/subtitle-generator.ts` | SRT and WebVTT generation | **REAL** | Produces exact, valid SubRip and WebVTT syntax with millisecond timecodes. | **NO** | Retain as real logic. |
| **SourceDocumentManager** | `core/story/source-document-manager.ts` | Lossless script ingestion | **REAL** | Preserves raw content losslessly with exact character offset segmentation. | **NO** | Retain as real logic. |
| **RuleBasedStoryAnalyzer** | `core/story/story-analyzer.ts` | Narrative beat & candidate extraction | **REAL** | Deterministic screenplay parser extracting scenes, candidates, beats, coverage, and guards. | **NO** | Retain as real logic. |
| **ShotPlanner** | `core/director/shot-planner.ts` | Shot contract planning | **REAL** | Compiles StoryCandidates into structured ShotContracts with DirectorProfile styling. | **NO** | Retain as real logic. |
| **StudioPipelineFactory** | `core/pipeline/studio-pipeline-factory.ts` | 11-step DAG production pipeline | **REAL** | Topological pipeline instantiation with CheckpointManager integration and state flow. | **NO** | Wire in real media toolchain and execution mode guards. |
| **Studio UI** | `packages/studio-ui/` | Web application & dual-mode player | **PARTIAL / DEMO** | High-fidelity UI with real scrubber, CSS parallax, and downloads, but relies on preloaded mock/sample state rather than live backend daemon. | **NO** | Add execution mode badge (`MOCK`, `LOCAL`, `PRODUCTION`) and connect to real project state. |
| **CLI** | `packages/cli/src/index.ts` | Developer CLI tool | **REAL** | Complete command suite (`doctor`, `run`, `status`, `ui`, `checkpoint`, `timeline`, `qa`, etc.). | **NO** | Add `doctor --production`, `smoke media`, and `smoke golden`. |
