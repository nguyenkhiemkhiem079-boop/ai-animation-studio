# PHASE 17.1.1 — VISUAL QA PRODUCTION REALITY HARDENING REPORT

## 1. Executive Summary

Phase 17.1.1 closes the remaining production reality gaps in the Visual Semantic Continuity QA Engine. It eliminates silent offline fallback in production mode, enforces canonical identity reference anchoring, implements the strict Master Export Production Safety Gate, ensures truthful auto-repair proposals, and validates physical frame inspection under controlled tests.

---

## 2. Separate Evidence States

| Evidence State | Status | Evidence / Verification Notes |
|:---|:---:|:---|
| **IMPLEMENTED** | **PASS** | Complete architecture in place across `packages/core` and `packages/cli`: Master Export Gate, Visual QA Evaluator, Character/Env Reference Packets, Authoritative Shot Video Map, Truthful Auto-Repair. |
| **LOCAL VERIFIED** | **PASS** | All local unit, integration, and e2e test suites execute and pass locally without cloud credentials (`npm run test`, `npm run typecheck`, `npm run build`, `npm run skills:check`, and all smoke suites). |
| **MULTIMODAL CONTRACT VERIFIED** | **PASS** | Controlled visual tests (`multimodal-contract.test.ts`) verify that canonical RED reference + RED rendered frames yields PASS, while canonical RED reference + BLUE rendered frames yields FAIL with `character_identity_drift`. Provider spy verifies transmission of canonical reference image parts alongside extracted keyframes using non-empty base64 bytes, valid MIME types, and `VISION_QA` role. |
| **LIVE PROVIDER VERIFIED** | **YES** | Verified locally via `npm run smoke:visual-qa-live` using real Gemini API:<br>• **Model**: `gemini-3.5-flash`<br>• **Role**: `VISION_QA`<br>• **Input Tokens**: 1118<br>• **Output Tokens**: 73<br>• **Total Tokens**: 1349<br>• **Result**: Validated structured `VisualQAOutput` received with realistic latency and 0 leaks. |
| **GITHUB CI VERIFIED** | **NOT VERIFIED** | Local environment execution only; remote GitHub Action CI status is not asserted without remote log verification. |

---

## 3. Hardened Production Reality Rules

### 3.1 Master Export Production Safety Gate
In `PRODUCTION` mode, final master export strictly fails closed (`ProductionSafetyError`) if:
- `visualQASummary` is missing or `overallStatus !== 'PASSED'`.
- `missingArtifacts > 0`, `notEvaluatedShots > 0`, or `criticalDefects > 0`.
- Any required coverage dimension (`identityVisual`, `temporalArtifactVisual`, `semanticAction`) is `NOT_EVALUATED`.
- Any pending retake recommendation is unresolved.
- Any critical continuity defect remains unresolved.
- Any video path in authoritative `state.shotVideoMap` is missing or has a file size of 0 bytes.

### 3.2 Multimodal Provider Failure Behavior
- In `PRODUCTION`: Provider failures (`AUTH_ERROR`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`, `TIMEOUT`, `SERVER_ERROR`, `INVALID_REQUEST`, schema error) result in safe categorization, set `coverage.identityVisual = 'NOT_EVALUATED'`, and block export.
- In `LOCAL`: Truthfully falls back to `LOCAL_MEDIA_METADATA`, recording `identityConsistencyScore = null` and `coverage.identityVisual = 'NOT_EVALUATED'`.

### 3.3 Approved Canonical References Only
- Only assets with approved/canonical lifecycle status establish identity truth.
- Candidate assets and missing anchors result in `missingIdentityAnchors` and `coverage.identityVisual = 'NOT_EVALUATED'`, blocking production character shots.
- Outfit and wardrobe identity requirements resolve canonical outfit references when available; missing outfit references cap identity scores and trigger defects.
- Multi-scene isolation is strictly preserved; shots resolve specific scene and location packets without falling back to Scene 1.

### 3.4 Authoritative Shot Video Map
- Production mode strictly resolves media from `state.shotVideoMap` and verified registered assets.
- Fallback searching in `.studio/smoke/media` and `.studio/smoke/golden` has been completely eliminated from production logic.

### 3.5 Truthful Auto-Repair
- `color_palette_drift`: Because renderer does not bake metadata color grading into pixels, status is `PROPOSED`, `applied: false`, and issue remains unresolved.
- `character_identity_drift`: Proposes surgical retake (`PROPOSED`, `applied: false`). Cross-dissolves are prohibited from masking identity drift.
- `spatial_perspective_mismatch`: Editorial cross-dissolve mitigation does not mark the underlying spatial mismatch resolved.
- `temporal_visual_flicker` / `visual_artifact_defect`: Retake proposals remain unresolved until physical replacement media is generated and verified.

---

## 4. Test Matrix Verification

1. `PRODUCTION blocks missing visualQASummary`: Verified in `master-export.test.ts`.
2. `PRODUCTION blocks visualQASummary.overallStatus != PASSED`: Verified in `master-export.test.ts`.
3. `PRODUCTION blocks missingArtifacts > 0`: Verified in `master-export.test.ts`.
4. `PRODUCTION blocks notEvaluatedShots > 0`: Verified in `master-export.test.ts`.
5. `PRODUCTION blocks character shot when coverage.identityVisual == NOT_EVALUATED`: Verified in `master-export.test.ts`.
6. `PRODUCTION blocks required temporal visual QA when temporalArtifactVisual == NOT_EVALUATED`: Verified in `master-export.test.ts`.
7. `PRODUCTION blocks acting shot when semanticAction == NOT_EVALUATED`: Verified in `master-export.test.ts`.
8. `LOCAL_MEDIA_METADATA cannot satisfy production identity approval`: Verified in `master-export.test.ts`.
9. `characterReferencePackets resolve canonical identity references`: Verified in `visual-semantic-qa.test.ts`.
10. `canonical identity image reaches evaluator`: Verified in `multimodal-contract.test.ts`.
11. `outfit reference reaches evaluator where applicable`: Verified in `multimodal-contract.test.ts`.
12. `missing identity reference creates missingIdentityAnchors`: Verified in `multimodal-contract.test.ts`.
13. `missing identity anchor blocks production character shot`: Verified in `master-export.test.ts`.
14. `environment reference is resolved correctly per shot`: Verified in `visual-semantic-qa.test.ts`.
15. `multi-scene shots do not all use Scene 1`: Verified in `visual-semantic-qa.test.ts`.
16. `PRODUCTION ignores .studio/smoke/media`: Verified in `visual-semantic-qa.test.ts`.
17. `PRODUCTION ignores .studio/smoke/golden`: Verified in `visual-semantic-qa.test.ts`.
18. `authoritative shotVideoMap used in production`: Verified in `visual-semantic-qa.test.ts`.
19. `canonical RED reference + RED rendered video => PASS`: Verified in `multimodal-contract.test.ts`.
20. `canonical RED reference + BLUE rendered video => FAIL`: Verified in `multimodal-contract.test.ts`.
21. `test actually inspects extracted_frame_* bytes`: Verified in `multimodal-contract.test.ts`.
22. `provider spy receives canonical + extracted images`: Verified in `multimodal-contract.test.ts`.
23. `every image has non-empty bytes`: Verified in `multimodal-contract.test.ts`.
24. `correct image MIME types`: Verified in `multimodal-contract.test.ts`.
25. `VISION_QA modelRole is used`: Verified in `multimodal-contract.test.ts`.
26. `text-only provider cannot produce semantic visual pass`: Verified in `visual-semantic-qa.test.ts`.
27. `multimodal provider failure in PRODUCTION does not silently become pass`: Verified in `multimodal-contract.test.ts`.
28. `multimodal provider failure in LOCAL can downgrade truthfully`: Verified in `multimodal-contract.test.ts`.
29. `color_palette_drift remains PROPOSED`: Verified in `visual-semantic-qa.test.ts`.
30. `color_palette_drift remains unresolved`: Verified in `visual-semantic-qa.test.ts`.
31. `character_identity_drift retake remains PROPOSED`: Verified in `visual-semantic-qa.test.ts`.
32. `character_identity_drift remains unresolved`: Verified in `visual-semantic-qa.test.ts`.
33. `spatial cross-dissolve does not resolve underlying mismatch`: Verified in `continuity-qa.test.ts`.
34. `temporal flicker retake remains unresolved`: Verified in `visual-semantic-qa.test.ts`.
35. `visual artifact retake remains unresolved`: Verified in `visual-semantic-qa.test.ts`.
36. `critical visual issue survives continuity merge`: Verified in `visual-semantic-qa.test.ts`.
37. `production export blocks unresolved critical continuity issue`: Verified in `master-export.test.ts`.
38. `production export blocks pending critical retake`: Verified in `master-export.test.ts`.
39. `failed visual QA report not registered as approved canon`: Verified in `visual-semantic-qa.test.ts`.
40. `successful multimodal visual QA report lifecycle remains correct`: Verified in `visual-semantic-qa.test.ts`.

---

## 5. Security & Isolation

- `.env` is uncommitted and excluded from git tracking.
- No secrets or API keys are printed in terminal logs, documentation, or reports.
- Safe provider failure categorization prevents error payloads from leaking credentials.
- Zero mock video generation permitted in `PRODUCTION` mode.
