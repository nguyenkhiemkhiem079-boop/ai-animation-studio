---
name: flow-operator-workflow
version: 1.0.0
category: production
description: "Governs the human-assisted Google Flow video generation boundary, handoff packaging, media import validation, and operator escalation protocols."
dependencies:
  - shot-plan
  - reference-binding
  - cinematography
applicablePhases:
  - "Phase 5"
  - "Phase 6"
  - "Phase 18"
  - "Phase 20"
  - "Phase 23"
  - "Phase 24"
  - "Live Production"
---

# Flow Operator Workflow Skill

## Purpose
The `flow-operator-workflow` skill governs the human-assisted production boundary with Google Flow (and external generative video studios). Because Google Flow operates as an interactive human-in-the-loop creative workspace without a public headless generation API, this skill defines the exact preparation, handoff, import verification, and escalation boundaries.

## The Core Agent Boundary Invariant

> **CRITICAL ARCHITECTURAL BOUNDARY**:
> Antigravity orchestrates everything **up to** the handoff and resumes immediately **upon** media import.
> Antigravity **MUST NOT** simulate, fabricate, or fake the human Google Flow generation step.
> When operator video generation is needed, Antigravity transitions to `NEEDS_USER_ACTION` and provides clear, actionable instructions.

## The End-to-End Flow Pipeline

```
[ShotContract & DNA]
         │
         ▼
[Assemble Handoff Package]
  ├── Structured Prompt & Negative Prompts
  ├── Visual References (Character DNA, Location DNA, Style Anchor)
  ├── Camera Directives (Pan, Tilt, Dolly, Lens, Motion Strength)
  └── Continuation Frames (End-frame of Shot N-1 if continuing)
         │
         ▼
[Emit NEEDS_USER_ACTION] ───► Human Operator in Google Flow
                                      │
                                      ▼
                             [Export Video from Flow]
                                      │
                                      ▼
[Media Import & Verification] ◄── Operator Places Video in Import Path
  ├── FFprobe Video Spec Validation (codec, resolution, fps, duration)
  ├── SHA-256 Checksum Computation
  └── Asset Registry Ingestion as Candidate
         │
         ▼
[Automated Visual QA] ────── (Defects Exceed Threshold) ──► Retake Workflow
         │ (QA Pass)
         ▼
[Human Review & Canon Promotion]
```

## Step-by-Step Operator Protocol

### 1. Preparing the Handoff Package
Assemble all context needed by the human operator into a single, cohesive bundle:
- **Prompt Specification**: Natural language video prompt compiled from `ShotContract`, enriched with character/world tags.
- **Reference Binding**: Paths or URLs to canonical character turnarounds, expression sheets, and environment plates.
- **Camera Semantics**: Focal length (e.g. 35mm, 85mm), motion vector (e.g. slow push-in, static wide), depth of field.
- **Continuation Anchor**: If shot continuation is active, provide the exact last frame of the previous shot as the first frame anchor.
- **Output Target**: Directory path where the generated MP4 must be placed.

### 2. Emitting `NEEDS_USER_ACTION`
When the handoff package is prepared, present a structured notice to the operator:
```markdown
### 🎬 Action Required: Google Flow Video Generation
- **Shot ID**: `shot-01-intro`
- **Handoff Bundle**: `artifacts/handoffs/shot-01-intro/`
- **Recommended Prompt**: "Wide establishing shot of Cybernetic Alley at dusk, neon reflections in puddles..."
- **Reference Images**:
  - Character: `assets/characters/hero-v1/turnaround.png`
  - Location: `assets/locations/alley-v1/plate.png`
- **Expected Output File**: `artifacts/imports/shot-01-intro.mp4`
- **Next CLI Command**: `npm run studio -- import --shot shot-01-intro --file artifacts/imports/shot-01-intro.mp4`
```

### 3. Media Ingestion & Technical Validation
When the operator delivers the video file:
1. **File Presence**: Verify file exists and is non-empty.
2. **FFprobe Audit**:
   - Video codec: `h264` or `hevc`.
   - Audio codec: `aac` or none.
   - Resolution matches shot contract (e.g. 1920x1080, 3840x2160).
   - Duration is within tolerance of planned timing (±0.5s).
3. **Cryptographic Fingerprint**:
   - Compute SHA-256 digest of imported media.
   - Record in candidate provenance record.
4. **Visual QA Dispatch**:
   - Dispatch to `visual-qa` skill to check for artifacts, warping, or identity drift.
   - If QA passes, prompt operator for final human sign-off.

## Do / Do Not Rules

- **DO** generate comprehensive, self-contained handoff instructions so the operator can work without confusion.
- **DO** validate all imported videos with FFprobe before passing downstream.
- **DO** continue unrelated background tasks (e.g. script planning, asset preparation) while waiting for the operator.
- **DO NOT** claim a shot is complete when video media has not been generated and imported.
- **DO NOT** create dummy zero-byte MP4s or copy placeholder video files to pretend Flow generation succeeded.
- **DO NOT** block CLI execution indefinitely; use `NEEDS_USER_ACTION` status.

## Architecture References
- `packages/core/src/director/` (`ShotContract`, `Director`)
- `packages/core/src/asset-registry/` (`AssetRegistry`, `Candidate`)
- `packages/core/src/production-verifier/` (`MediaVerification`, `HandoffManifest`)
- `AGENTS.md` (Tenet 3: Candidate != Canon, Tenet 5: Deterministic Animation First)
