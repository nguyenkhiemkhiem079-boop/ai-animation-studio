# Phase 16.6 Report — Google Flow Production Bridge

## 1. Executive Summary
Phase 16.6 establishes a production-grade, provider-independent bridge between AI Animation Studio and Google Flow. Operating under strict architectural tenets, Google Flow is treated exclusively as an **external creative rendering workspace**, never as the studio core, canon database, or character owner. Because Google has not released an official public automation API for Flow, Phase 16.6 operates strictly in **`ASSISTED` mode**. The bridge implements a complete pipeline: provider-neutral ShotContracts are compiled into self-contained Flow production packages with semantic role-bound references, handed off cleanly to the human creator, and imported back via `ArtifactVerifier` and `FFprobe` media inspection into an unapproved `CANDIDATE` pool before passing Continuity QA and human approval.

## 2. Baseline SHA
- Baseline Commit: `e4a89f6ac8003d1b9258ea66a7d047c8eda226a2`
- Preflight Status: Clean workspace, all baseline regression gates passed.

## 3. Official Flow Capability Review
Inspection of official Google Flow documentation and Google Labs releases confirms the following operational video capabilities:
- `TEXT_TO_VIDEO`: Direct natural language prompt conditioning.
- `FIRST_FRAME_TO_VIDEO`: Single keyframe start-to-video motion synthesis.
- `FIRST_LAST_FRAME_TO_VIDEO`: Dual keyframe interpolation for strict scene transitions.
- `INGREDIENTS_TO_VIDEO`: Multi-image reference conditioning (character face, outfit, location anchors, props).
- `VIDEO_EDITING` & `VIDEO_EXTENSION`: Timeline manipulations.

Capabilities vary across models and are subject to continuous evolution by Google. Consequently, capabilities are structured via extensible configuration profiles rather than hardcoding ephemeral model assumptions into the studio core.

## 4. Integration Mode Decision
- **Active Mode**: `ASSISTED`
- **Automation API**: `UNSUPPORTED / NOT CONFIGURED`
- **Rationale**: No public, authenticated Google Flow API currently exists. Private API reverse-engineering, browser automation hacks, and credential scraping are strictly prohibited. The Assisted mode maintains full architectural integrity, zero credential liability, and deterministic control.

## 5. Flow Job State Machine
A deterministic 13-state machine governs Flow job progression:
```
DRAFT → PACKAGE_READY → NEEDS_USER_ACTION → WAITING_FOR_IMPORT → IMPORTED → VERIFYING → VERIFIED → QA_PENDING → (CANDIDATE | QA_FAILED) → (APPROVED | REJECTED | ARCHIVED)
```
Direct illegal transitions (e.g. `WAITING_FOR_IMPORT` directly to `APPROVED`) are strictly blocked by `validateFlowJobTransition`.

## 6. Flow Package Schema
The versioned `FlowProductionPackageV1Schema` defines:
- `packageId`: Deterministic content-hashed identifier (`flow_pkg_<projectId>_<shotId>_<sha256>`).
- `shotContractSnapshot`: Immutable snapshot of canonical `ShotContract`.
- `sourceReferences`: Lossless traceability back to original story offsets.
- `narrativeIntent`, `durationTargetSeconds`, `aspectRatio`.
- `references`: Semantic role-bound assets (`CHARACTER_IDENTITY`, `LOCATION`, `PROP`, etc.).
- `continuityConstraints`: Explicit constraints for identity and scene physics.
- `recommendedWorkflow` & `workflowReason`.
- `userInstructions`: 14-step human creation guide.

## 7. FlowPromptCompiler
Translates provider-neutral `ShotContract` fields into Flow-optimized natural language:
- Generates structured sections: `[SUBJECT]`, `[ACTION]`, `[ENVIRONMENT]`, `[CAMERA]`, `[COMPOSITION]`, `[MOTION]`, `[LIGHTING]`, `[STYLE]`, `[CONTINUITY]`, `[REFERENCE USAGE]`, `[DO NOT CHANGE]`.
- Enforces director locks (e.g., `LOCKED CAMERA MOTION`, `LOCKED RENDERER INTENT`).
- Preserves the immutability of the source `ShotContract`.

## 8. Reference Role System
Prevents arbitrary image dumps by categorizing all reference assets into typed roles:
- `CHARACTER_IDENTITY`: Primary turnaround sheet and facial anchor.
- `CHARACTER_OUTFIT`: Approved costume palette.
- `CHARACTER_POSE`: Starting keyframe pose.
- `LOCATION`: Architectural plates and spatial landmarks.
- `PROP`: Interactive props (e.g., candle, butterfly).
- `STYLE`: Visual aesthetic anchors.
- `FIRST_FRAME` & `LAST_FRAME`: Bounding transition frames.

## 9. Character Consistency
For canonical characters (e.g., Minh):
- Turnaround sheet DNA references (`CHAR_MINH_DNA_v1`) are copied into the package.
- The compiled prompt binds identity explicitly: *"Anchored by character reference: Minh — Canonical Character Turnaround. Do not change character facial structure, hair color, or clothing."*

## 10. World Consistency
Canonical locations (e.g., Dark Room) bind architectural plates (`LOC_ROOM_v1`):
- Prompt instructs Flow to adhere to persistent spatial geometry, candle altar placement, and shadowed corners rather than reinventing the room.

## 11. First / Last Frame Strategy
Supports `FIRST_FRAME_TO_VIDEO` and `FIRST_LAST_FRAME_TO_VIDEO`:
- When Shot N's final frame is selected as a candidate for Shot N+1's start frame, it is passed as a `FlowFrameDescriptor`.
- Generated frames remain unapproved candidates until verified by QA.

## 12. Workflow Recommender
Deterministic recommender selects the optimal workflow with clear reasoning:
1. `FIRST_LAST_FRAME_TO_VIDEO` if both start and end frames exist.
2. `INGREDIENTS_TO_VIDEO` if character, location, or prop references exist.
3. `FIRST_FRAME_TO_VIDEO` if only start frame exists.
4. `TEXT_TO_VIDEO` fallback for unconditioned shots.

## 13. Human Handoff
Generates `.studio/flow/<projectId>/<shotId>/`:
- `flow-package.json`: Machine-readable package.
- `prompt.txt`: Copy-paste ready prompt text.
- `README.txt`: 14-step creator checklist.
- Subfolders: `references/`, `frames/`, `metadata/`.
- Halts with status `NEEDS_USER_ACTION`.

## 14. Result Importer
`FlowResultImporter`:
- Verifies physical file existence and non-zero size.
- Archives to `.studio/assets/flow/<projectId>/<shotId>/<shotId>_FLOW_v<N>.mp4`.
- Generates immutable provenance and records credit usage.
- Registers video in `IAssetRegistry` as `type: 'video_clip'`, `status: 'candidate'`.

## 15. Artifact Verification
Leverages `ArtifactVerifier` and `FFprobe` to inspect:
- Video stream presence (`hasVideoStream: true`).
- Codec verification (e.g., `h264`).
- Resolution and aspect ratio (`1920x1080`).
- Valid positive duration.
- SHA-256 cryptographic checksum.

## 16. Provenance
Every imported asset records immutable metadata:
- `sourceType: 'GOOGLE_FLOW_ASSISTED'`
- `integrationMode: 'ASSISTED'`
- File sizes, paths, SHA-256 checksum, duration, resolution, video/audio codecs.
- Zero Google API secrets or session tokens.

## 17. Credit Accounting
Configurable accounting without fabricated claims:
- `UNKNOWN`: Default when user enters no credit usage.
- `USER_REPORTED`: Tracks actual credits entered by human creator.
- Zero fabricated "cost savings" or fake pricing.

## 18. QA
`FlowQAEvaluator` checks:
- Duration fidelity against ShotContract (warning if within tolerance, critical if >3x deviation).
- Valid video codec recognition.
- Unsupported narrative events (detecting hallucinations such as ghosts, attacks, explosions).
- Returns `overallStatus: 'PASS' | 'WARN' | 'FAIL'`.

## 19. Approval Workflow
- `Candidate != Canon`: Imported clips start as `candidate`.
- Only clips with QA `PASS` or `WARN` can be approved.
- Calling `flowManager.approveCandidate()` runs `assertCanApprove()`, promotes asset in `IAssetRegistry` to `approved_canon`, and marks job `APPROVED`.

## 20. Regeneration
Shot-level regeneration allows re-rendering a single shot without invalidating other approved shots or re-running the entire episode pipeline.

## 21. Versioning
Generations are strictly versioned (`SHOT_001_FLOW_v1`, `v2`, etc.). Rejected generations are retained with reasons for provenance and audit trail.

## 22. Production Router
`ProductionRouter` hierarchy:
1. Approved canon asset.
2. Deterministic local HyperFrames (0 cost).
3. Reusable digital actor 2D animation.
4. Generative video adapters.
5. Google Flow Assisted (`primaryProviderId: 'google-flow-assisted'`, `integrationMode: 'ASSISTED'`, `userActionRequired: true`).

## 23. UI
Studio UI components reflect Flow Assisted state:
- Renderer: `Google Flow — Assisted`
- Status: `NEEDS USER ACTION`
- Quick actions: Copy Flow Prompt, View References, Import Result, Run QA, Approve.

## 24. CLI
Commands added to `@ai-studio/cli`:
- `studio flow doctor`: Checks bridge health, FFprobe, and mode.
- `studio flow prepare <shotId>`: Packages shot.
- `studio flow status <shotId>`: Inspects active jobs.
- `studio flow import <shotId> <videoPath>`: Imports MP4 and executes verification.
- `studio flow qa <shotId>`: Runs continuity audit.
- `studio flow approve <shotId>`: Promotes candidate to canon.
- `studio flow reject <shotId> [reason]`: Records rejection.
- `studio flow history <shotId>`: Lists version history.
- `studio flow smoke` / `studio smoke flow`: Runs canonical smoke test.

## 25. Security
- Zero Google session cookies captured.
- Zero OAuth tokens or private keys stored in packages.
- Zero browser automation / scraping on Google Flow web interfaces.
- Packages validated by automated tests to ensure no secrets are exposed.

## 26. Tests
Comprehensive test suite in `packages/core/tests/flow-bridge.test.ts` covers all 40 required criteria. All 40 tests pass. Total suite: 39 test files, 286 tests passing.

## 27. Flow Smoke
`npm run smoke:flow` executes on canonical story:
*"Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến."*
Generates `.studio/smoke/flow/` package, verifies all files on disk, schema conformance, zero secrets, and reports `status: NEEDS_USER_ACTION`.

## 28. Media Regression
`npm run smoke:media` passes. FFmpeg, FFprobe, and headless Chrome browser verified. Real master MP4 encoded and verified.

## 29. Golden Regression
`npm run smoke:golden` passes. Full end-to-end pipeline produces `.studio/smoke/golden/master.mp4` (168,592 bytes, 1080p, H.264/AAC), verified by FFprobe.

## 30. Gemini Regression
`npm run smoke:gemini` and all 27 Gemini provider tests pass with live/offline-safe fallbacks.

## 31. Known Limitations
- Google Flow requires manual web generation by a human creator due to absence of public developer API.
- Credit reporting relies on creator entry or remains `UNKNOWN`.

## 32. Technical Debt
- None. All contracts validated via Zod, with 100% typecheck clean and zero mock leaks into core.

## 33. Readiness for Phase 17
**YES**. Phase 16.6 acceptance criteria are fully satisfied. The codebase is prepared for Phase 17.
