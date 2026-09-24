---
name: release-validation
version: 1.0.0
category: development
description: "Governs the release gate across ten stratified verification states, enforcing doctor checks, provider provenance, media integrity, human approvals, and security audits."
dependencies:
  - phase-gate
  - testing
  - release-security
  - production-trust-evidence
applicablePhases:
  - "Phase 22"
  - "Phase 23"
  - "Phase 24"
  - "Release Candidate"
  - "Production Release"
---

# Release Validation Skill

## Purpose
The `release-validation` skill governs the final transition gate from development and rehearsal to an authentic production release. It replaces ambiguous notions of "done" with ten distinct, evidence-backed lifecycle states, preventing premature release claims and unverified deployments.

## The Ten Stratified Lifecycle States

Never collapse these states into a generic `DONE`. Each state has clear, uncompromised entry criteria:

```
┌──────────────────────────────┬────────────────────────────────────────────────────────────────┐
│ Lifecycle State              │ Criteria & Evidence Required                                   │
├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ 1. IMPLEMENTED               │ Code written, syntactically valid, files in place.             │
│ 2. LOCAL_VERIFIED            │ Unit tests, lint, and typecheck pass locally.                  │
│ 3. CI_VERIFIED               │ Automated tests pass on clean CI environment.                  │
│ 4. OFFLINE_REHEARSAL_VERIFIED│ End-to-end rehearsal passes with mock/fixture data.            │
│ 5. READY_FOR_LIVE_PILOT      │ Credentials valid, doctor passes, ready for live network execution│
│ 6. WAITING_FOR_PROVIDER      │ Blocked on external provider rate limits or outage (429/503).  │
│ 7. NEEDS_USER_ACTION         │ Blocked on human operator action (e.g. Google Flow generation).│
│ 8. LIVE_PILOT_VERIFIED       │ Real external provider calls executed, live evidence recorded. │
│ 9. MASTER_PRODUCTION_VERIFIED│ All real media, SHA-256 bindings, QA, & human approvals exist. │
│ 10. RELEASE_READY            │ All gates 1-9 satisfied, security audit clear, tag ready.      │
└──────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

## The Release Gate Matrix

A release cannot be declared `RELEASE_READY` without satisfying each of the following twelve verification checks:

| Gate | Check Item | Verification Method | Rejection Condition |
| :--- | :--- | :--- | :--- |
| **1. Baseline** | Clean git working directory, aligned with target branch | `git status`, `git diff` | Uncommitted changes or dirty tree |
| **2. Tests** | Full test suite execution across all monorepo workspaces | `npm run test` (Vitest) | Any failing unit or integration test |
| **3. Types** | Strict TypeScript compilation across packages | `npm run typecheck` | Any type error |
| **4. Build** | Clean build of packages and CLI distribution | `npm run build` | Compilation failure |
| **5. Doctor** | Environment and dependency doctor checks pass | `npm run studio -- doctor` | Missing required tools (e.g. Node, FFmpeg) |
| **6. Security** | Release security audit (zero secret leaks, injection guards) | `release-security` skill | Leaked credentials or unsafe commands |
| **7. Provider** | Provider provenance verified as authentic `LIVE_EXTERNAL` | `live-provider-validation` skill | Mock or test double used for live pilot |
| **8. Media** | Real media files present with matching SHA-256 checksums | FFprobe + crypto digest | Missing files, zero bytes, hash mismatch |
| **9. QA** | Automated Visual QA and Continuity QA logs above threshold | QA report logs | Defect score exceeding allowable limit |
| **10. Human** | Non-simulated human approval challenge signed | Signed approval token | Faked, simulated, or missing approval |
| **11. Master** | `MASTER_PRODUCTION_VERIFIED` derived by verifier | `production-trust-evidence` skill | Any unverified or tampered evidence |
| **12. Manifest**| Complete `acceptance-manifest.json` sealed | Schema validation | Malformed or incomplete manifest |

## Agent Operating Discipline

1. **Acknowledge Real vs Rehearsal**:
   - Passing tests in CI or local rehearsal proves code health, NOT production completion.
   - Never report that a production run succeeded when it ran against offline test doubles.
2. **Explicit Blockers on Operator / Provider**:
   - If waiting for an operator in Google Flow: state `NEEDS_USER_ACTION` with precise instructions.
   - If waiting for Gemini quota or service: state `WAITING_FOR_PROVIDER` with retry estimates.
3. **Fail-Closed Determination**:
   - If even one gate fails or is unverifiable, the release status is **NOT READY**.
   - Output an itemized checklist indicating which gates passed and which failed.

## Verification Workflow

```
[Trigger Release Audit]
          │
          ▼
[1. Baseline & Hygiene] ──────── (Dirty Tree / Divergent) ─► REJECT: DIRTY_WORKSPACE
          │ (Pass)
          ▼
[2. Typecheck, Test, Build] ──── (Failure) ───────────────► REJECT: CODE_DEFECT
          │ (Pass)
          ▼
[3. Release Security Audit] ──── (Secrets / Injections) ──► REJECT: SECURITY_VIOLATION
          │ (Pass)
          ▼
[4. Provider & Media Evidence] ─ (Offline Mock / Mismatch) ► REJECT: EVIDENCE_INVALID
          │ (Pass)
          ▼
[5. Human Approval Verification] (Missing / Faked) ──────► REJECT: APPROVAL_MISSING
          │ (Pass)
          ▼
[Derive RELEASE_READY Status]
```

## Do / Do Not Rules

- **DO** present the full twelve-point checklist to the operator when evaluating release status.
- **DO** distinguish clearly between `OFFLINE_REHEARSAL_VERIFIED` and `MASTER_PRODUCTION_VERIFIED`.
- **DO** verify that git working directory is clean and in sync with remote before release.
- **DO NOT** declare a release ready based solely on passing unit tests.
- **DO NOT** simulate human approval challenges to unblock pipeline execution.
- **DO NOT** bypass security audit or evidence verification.

## Architecture References
- `packages/core/src/production-verifier/` (`ProductionVerifier`, `AcceptanceBundle`)
- `packages/cli/src/` (CLI release commands and doctor checks)
- `AGENTS.md` (Tenet 3: Candidate != Canon, Tenet 6: Checkpoint-Driven, Tenet 7: 100% Testable Locally)
