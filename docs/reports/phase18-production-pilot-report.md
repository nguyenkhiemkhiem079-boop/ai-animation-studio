# Phase 18 — Production Evidence Truth & Hardening Report

## 1. Executive Summary

Phase 18 and Phase 18.1 establish strict **Production Truth Hardening** across the AI Animation Studio pipeline. Under Phase 18.1 standards:
**NO SYNTHETIC EVIDENCE MAY SATISFY PRODUCTION ACCEPTANCE.**

Deterministic doubles, mock providers, simulated Flow downloads, and automated smoke approvals may satisfy local regression and offline production rehearsals (`OFFLINE_REHEARSAL_VERIFIED`), but they are permanently blocked from producing `MASTER_PRODUCTION_VERIFIED` for a genuine production acceptance run.

---

## 2. Truthful Production Verification Matrix

| Verification Category | Status | Truthful Evidence & Justification |
| :--- | :--- | :--- |
| **IMPLEMENTED** | **PASS** | 15-state `ProductionRun` state machine, durable evidence store, hardened 14-point `ProductionMasterVerifier`, `ProductionLeakDetector`, explicit `ProviderTrustLevel`, `ApprovalType`, and `SIMULATED_FLOW` tagging. |
| **LOCAL VERIFIED** | **PASS** | Full local regression gate: 45+ test files passing; local media toolchains, golden video renderers, Flow bridges, and frame extractors verified locally. |
| **CI VERIFIED** | **PASS** | Clean compilation (0 type errors, 0 lint/schema violations), hermetic builds across Node 20.x & 22.x, and automated offline production rehearsal gate in GitHub Actions. |
| **OFFLINE PRODUCTION REHEARSAL** | **PASS (`OFFLINE_REHEARSAL_VERIFIED`)** | Safe offline execution running the canonical pilot story end-to-end with `DeterministicOfflineLLMDouble`, simulated Flow media, and automated test approvals. Proves state transitions, resume capability, physical MP4 rendering, SHA-256 checksums, timeline assembly, and multi-track audio mixing. |
| **LIVE PROVIDER VERIFIED** | **NOT VERIFIED / QUOTA EXCEEDED** | Live Gemini 2.5/1.5 Flash requests reached Google AI Studio endpoint and truthfully returned HTTP 429 `RESOURCE_EXHAUSTED` (free-tier quota exhaustion). Truthful error evidence recorded. Does NOT fabricate success or fallback to mock data under `PRODUCTION` mode. |
| **REAL FLOW MEDIA VERIFIED** | **NOT VERIFIED (SIMULATED_FLOW)** | Current pilot runs utilize deterministic FFmpeg-generated test videos tagged explicitly as `generationSource: SIMULATED_FLOW`. Real Google Flow provider output requires user download with genuine external provenance. |
| **HUMAN APPROVAL VERIFIED** | **NOT VERIFIED (AUTOMATED_TEST)** | Approvals in smoke suites use `approvalType: AUTOMATED_TEST`. Genuine `MASTER_PRODUCTION_VERIFIED` strictly requires `approvalType: HUMAN` by an interactive director/reviewer. |
| **MASTER PRODUCTION VERIFIED** | **NOT VERIFIED** | Correctly blocked and marked `NOT VERIFIED` until all genuine production-truth criteria (live multimodal vision QA, real external Flow media, and human director approval) are simultaneously satisfied. |

---

## 3. Canonical Offline Rehearsal Evidence

- **Story**: `"Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến."`
- **Rehearsal Mode**: `OFFLINE_REHEARSAL` (`allowRehearsal: true`)
- **Run ID**: `run_pilot_smoke_*`
- **Project ID**: `proj_pilot_smoke`
- **Series ID**: `series_pilot_smoke`

### Shot Pipeline & Truthful Provenance:
1. **Shot 1 (`SHOT_SCENE_01_SH01`)**:
   - Route: Deterministic HyperFrames (`HYPERFRAMES`)
   - Physical File: Headless Chrome rendered 1920x1080 @ 24fps MP4
   - Approval: `AUTOMATED_TEST` (Smoke Harness Sign-off)
   - Visual QA Mechanism: `OFFLINE_TEST_DOUBLE` (Synthetic Semantic Coverage: `NOT_EVALUATED`)

2. **Shot 2 (`SHOT_SCENE_01_SH02`)**:
   - Route: Google Flow Assisted Handoff (`NEEDS_USER_ACTION`)
   - Generation Source: `SIMULATED_FLOW` (FFmpeg blue test video, explicitly tagged)
   - Approval: `AUTOMATED_TEST` (Smoke Harness Sign-off)
   - Visual QA Mechanism: `OFFLINE_TEST_DOUBLE`

3. **Shot 3 (`SHOT_SCENE_01_SH03`)**:
   - Route: Google Flow Assisted Handoff (`NEEDS_USER_ACTION`)
   - Generation Source: `SIMULATED_FLOW` (FFmpeg blue test video, explicitly tagged)
   - Approval: `AUTOMATED_TEST` (Smoke Harness Sign-off)
   - Visual QA Mechanism: `OFFLINE_TEST_DOUBLE`

### Final Rehearsal Deliverable Verification:
- **Master Video File**: `.studio/production/proj_pilot_smoke/run_pilot_smoke_*/master/master.mp4`
- **Physical Verification**: Valid H.264 video stream, AAC stereo audio, non-zero bytes
- **Gate Result**: `OFFLINE_REHEARSAL_VERIFIED` (Truthfully reflects rehearsal status)
- **Production Truth Gate**: Correctly withheld `MASTER_PRODUCTION_VERIFIED` due to synthetic double, simulated media, and automated approval.

---

## 4. Live Provider Execution & Quota Handling

When executing live provider verification via `npm run smoke:production-live` (opt-in with `RUN_LIVE_PROVIDER_TESTS=true`):
- **Provider**: Google Gemini (Google AI Studio)
- **Role**: `STRUCTURED` / `VISION_QA`
- **Endpoint**: `generativelanguage.googleapis.com`
- **Result**: `RESOURCE_EXHAUSTED` (HTTP 429)
- **Classification**: `QUOTA_EXCEEDED`
- **Studio Behavior**:
  - Did NOT generate mock results
  - Did NOT treat HTTP 429 as live verification success
  - Safely transitioned run to `WAITING_FOR_PROVIDER`
  - Persisted completed work and sanitized failure evidence
  - Provided exact resume command: `studio production resume <runId>`
