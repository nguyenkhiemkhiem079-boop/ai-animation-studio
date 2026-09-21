# Visual Semantic Continuity QA & Multimodal Architecture

## 1. Overview & Motivation

In classical generative animation pipelines, individual shots are rendered as isolated video clips. Without a continuous multimodal feedback loop, downstream timelines suffer from:
1. **Character Identity Drift**: Subtly altered facial structures, eye colors, or costumes between cuts.
2. **Spatial Perspective Jumps**: Background horizons, lens focal lengths, or camera angles contradicting the director's shot contract.
3. **Temporal Visual Anomalies**: Geometry popping, limb morphing, or hallucinated artifacts across frames.
4. **Color & Lighting Incoherence**: Color temperature and key light shifts breaking the mood of the scene.

Phase 17 introduces the **Multimodal Visual Semantic Continuity QA Engine** into AI Animation Studio. Positioned directly between real video generation and timeline assembly/continuity auto-repair, it audits rendered video keyframes against canonical Character DNA, World Environment landmarks, and ShotContracts.

```
Story Ingestion
      ↓
Gemini Intelligence (StoryAnalysis & Beats)
      ↓
Director Engine (ShotContracts & Camera Moves)
      ↓
Character & World Canon (Turnarounds & Spatial Memory)
      ↓
Production Router (Deterministic vs Generative vs Flow)
      ↓
Real Video Generation (HyperFrames / Video Providers / Flow)
      ↓
Visual Semantic QA (FrameExtractor + Multimodal Vision)  ← PHASE 17
      ↓
Continuity QA (180° Rule, Eyelines, Audio Ducking)
      ↓
Auto-Repair Engine (Cross-Dissolve Blends, Retake Recommendations)
      ↓
Multi-Track Timeline Assembly (V1, A1, A2, A3, S1)
      ↓
Final Master Export (Verified MP4, HTML5 Player, OTIO, EDL)
```

---

## 2. Key Components

### 2.1 FrameExtractor
- **Path**: `packages/core/src/qa/frame-extractor.ts`
- **Mechanism**: Invokes the local FFmpeg toolchain to extract non-volatile keyframes across video duration (`-ss <timestamp> -i <file> -vframes 1 -q:v 2`).
- Samples across the 10%–90% timeline span to avoid title cards or black frame anomalies.
- Produces `ExtractedFrame` records with frame indices, timestamps, dimensions, and optional base64 image data.

### 2.2 VisualSemanticQAEvaluator
- **Path**: `packages/core/src/qa/visual-semantic-qa-evaluator.ts`
- **Dual Evaluation Architecture**:
  1. **Multimodal Gemini Vision (`MULTIMODAL_GEMINI`)**:
     - When `GeminiProvider` is configured with a valid `GEMINI_API_KEY`, sends keyframe images alongside canonical Character Profile DNA and ShotContract metadata.
     - Receives structured `VisualQAOutput` conforming to Zod schema.
  2. **Deterministic Local Vision (`DETERMINISTIC_LOCAL`)**:
     - When running offline, in CI, or in local test environments, performs deterministic frame analysis (aspect ratio coherence, landscape vs portrait checks, character palette verification, and static camera stability).
     - Ensures 100% of pipeline tests execute without external cloud credentials.

### 2.3 VisualDefect Taxonomy
- `character_identity_drift`: Face, hair, or anatomical traits deviate from canonical Character DNA.
- `spatial_perspective_mismatch`: Background vanishing point or angle contradicts camera angle.
- `temporal_visual_flicker`: Severe frame-to-frame texture popping or geometry instability.
- `visual_artifact_defect`: Hallucinated artifacts, limb anomalies, or visual noise.
- `color_palette_drift`: Color grade or lighting deviates from scene lighting contract.

### 2.4 Auto-Repair Engine Integration
- **Path**: `packages/core/src/qa/auto-repair-engine.ts`
- When visual defects are identified, `AutoRepairEngine` applies targeted mitigations:
  - **Transition Insertion**: Converts hard cuts across drifting shots into 0.5s–0.6s cross-dissolve transitions to blend facial or perspective transitions smoothly.
  - **Color Grade Compensation**: Applies lighting compensation curves to correct palette drift.
  - **Surgical Retake Triggering**: Emits structured `RetakeRecommendation` records with prompt modifications and seed adjustments for non-destructive regeneration.

---

## 3. Core Tenet Compliance

1. **Provider-Independent**: Core visual QA contracts depend only on domain types (`ShotContract`, `CharacterProfile`, `VisualSemanticQAReport`). Multimodal providers implement `LLMProvider` abstractions.
2. **Candidate != Canon**: Detected defects never overwrite approved Canon; they produce candidates and retake proposals.
3. **100% Testable Locally**: Deterministic local vision allows complete unit and integration test coverage without cloud API tokens.
