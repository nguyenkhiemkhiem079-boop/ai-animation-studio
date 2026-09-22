# Visual Semantic Continuity QA & Multimodal Architecture

## 1. Overview & Motivation

In classical generative animation pipelines, individual shots are rendered as isolated video clips. Without a continuous multimodal feedback loop, downstream timelines suffer from:
1. **Character Identity Drift**: Subtly altered facial structures, eye colors, or costumes between cuts.
2. **Spatial Perspective Jumps**: Background horizons, lens focal lengths, or camera angles contradicting the director's shot contract.
3. **Temporal Visual Anomalies**: Geometry popping, limb morphing, or hallucinated artifacts across frames.
4. **Color & Lighting Incoherence**: Color temperature and key light shifts breaking the mood of the scene.

Phase 17 and Phase 17.1 introduce the **Multimodal Visual Semantic Continuity QA Engine** into AI Animation Studio. Positioned directly between real video generation and timeline assembly/continuity auto-repair, it audits rendered video keyframes against canonical Character DNA, World Environment landmarks, and ShotContracts.

```
Story Ingestion
      ↓
LLM Story Intelligence (StoryAnalysis & Beats)
      ↓
Director Engine (ShotContracts & Camera Moves)
      ↓
Character & World Canon (Turnarounds & Spatial Memory)
      ↓
Production Router (Deterministic vs Generative vs Flow)
      ↓
Real Video Generation (HyperFrames / Video Providers / Flow)
      ↓
Visual Semantic QA (FrameExtractor + Multimodal Vision)  ← PHASE 17 / 17.1
      ↓
Continuity QA (180° Rule, Eyelines, Audio Ducking)
      ↓
Auto-Repair Engine (Proposed Retakes, Non-destructive Proposals)
      ↓
Multi-Track Timeline Assembly (V1, A1, A2, A3, S1)
      ↓
Final Master Export (Production Safety Gate + Verified MP4)
```

---

## 2. Key Components

### 2.1 FrameExtractor
- **Path**: `packages/core/src/qa/frame-extractor.ts`
- **Mechanism**: Invokes the local FFmpeg toolchain to extract non-volatile keyframes across video duration (`-ss <timestamp> -i <file> -vframes 1 -q:v 2`).
- Samples across the 10%–90% timeline span to avoid title cards or black frame anomalies.
- Produces `ExtractedFrame` records with frame indices, timestamps, dimensions, and non-empty base64 image data.

### 2.2 VisualSemanticQAEvaluator
- **Path**: `packages/core/src/qa/visual-semantic-qa-evaluator.ts`
- **Architecture & Evaluation Modes**:
  1. **Provider-Neutral Multimodal Vision (`MULTIMODAL_PROVIDER`)**:
     - When an `LLMProvider` is registered with multimodal support (`supportsImages: true`, `supportsMultimodalStructuredOutput: true`), sends extracted video frame parts alongside canonical Character DNA references, canonical wardrobe/outfit references, and environment backdrop references using typed `LLMContentPart` structures.
     - Employs the dedicated `VISION_QA` model role.
     - Receives structured `VisualQAOutput` conforming to Zod schema.
     - Truthful failure categorization: if provider fails (AUTH_ERROR, RATE_LIMITED, QUOTA_EXCEEDED, TIMEOUT, etc.), PRODUCTION records failure and marks dimensions as `NOT_EVALUATED`.
  2. **Local Media Metadata Fallback (`LOCAL_MEDIA_METADATA`)**:
     - When running offline in `LOCAL` mode without multimodal credentials, inspects local media metadata (dimensions, aspect ratio, frame existence, duration).
     - **Truthful Identity Scoring**: Identity is NOT visually evaluated offline; `identityConsistencyScore` is strictly `null` and `coverage.identityVisual` is `NOT_EVALUATED`.
     - `LOCAL_MEDIA_METADATA` can satisfy local mock/smoke tests, but **CANNOT** satisfy semantic visual approval in `PRODUCTION` mode.

### 2.3 Approved Canon References
- Consumes authoritative `state.characterReferencePackets` and `state.environmentReferencePackets`.
- Semantic roles delivered into Multimodal Vision:
  - `CHARACTER_IDENTITY` / `turnaround_front`
  - `turnaround_side`
  - `expression_anchor`
  - `canonical_outfit_reference_<characterId>_<outfitId>`
  - `canonical_location_reference` / `background_anchor`
- **Canon Requirement**: Only approved canonical assets are recognized for identity anchoring. If approved references are missing, records `missingIdentityAnchors`, sets `coverage.identityVisual = 'NOT_EVALUATED'`, and fails closed in `PRODUCTION`.

### 2.4 Production QA Coverage Gate
- **Path**: `packages/core/src/export/master-export-pipeline-step.ts`
- In `PRODUCTION` execution mode, master export blocks physically if:
  - `visualQASummary` is missing or `overallStatus !== 'PASSED'`.
  - `missingArtifacts > 0`, `notEvaluatedShots > 0`, or `criticalDefects > 0`.
  - Pending critical retakes are unresolved.
  - Character shots have `coverage.identityVisual !== 'VERIFIED'`.
  - Motion shots have `coverage.temporalArtifactVisual !== 'VERIFIED'`.
  - Acting shots have `coverage.semanticAction !== 'VERIFIED'`.
  - Any video in authoritative `state.shotVideoMap` is missing or 0 bytes.

### 2.5 Truthful Auto-Repair Semantics
- **Path**: `packages/core/src/qa/auto-repair-engine.ts`
- Mitigations maintain truthful representation:
  - `color_palette_drift`: Since metadata color grading is not physically baked into pixels by the renderer, records `status: 'PROPOSED'`, `applied: false`, and preserves the issue as unresolved.
  - `character_identity_drift`: Emits a `trigger_retake` proposal with `status: 'PROPOSED'`, `applied: false`. Cross-dissolve transitions are NOT used to mask character identity drift.
  - `spatial_perspective_mismatch`: May propose editorial cross-dissolves, but underlying mismatch remains unresolved until physical artifact replacement.
  - `temporal_visual_flicker` / `visual_artifact_defect`: Issues remain unresolved until a replacement physical artifact is generated, evaluated, and passes QA.

---

## 3. Core Tenet Compliance

1. **Provider-Independent**: Core visual QA contracts depend only on domain types (`ShotContract`, `VisualSemanticQAReport`, `LLMContentPart`). Multimodal providers implement `LLMProvider` abstractions with `VISION_QA` role.
2. **Candidate != Canon**: Only approved canonical reference images establish visual truth. Detected defects never overwrite approved Canon; they produce retake proposals. Failed QA reports are registered as `candidate`, never `approved_canon`.
3. **Deterministic Animation First**: Deterministic HyperFrames and real video assets are strictly resolved via authoritative `state.shotVideoMap`.
4. **Resumable & Checkpoint-Driven**: Every step persists state across checkpoints (`v0.8-visual-qa`, `v0.9-continuity-qa`, etc.).
5. **Fail-Closed Production Reality**: In production, missing artifacts, unverified frames, or offline fallbacks fail closed to prevent hallucinated or defective video delivery.
