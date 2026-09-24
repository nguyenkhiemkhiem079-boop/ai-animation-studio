---
name: production-trust-evidence
version: 1.0.0
category: production
description: "Guards the production truth model, verifies physical media and cryptographic provenance, and enforces fail-closed derivation of MASTER_PRODUCTION_VERIFIED."
dependencies:
  - architecture-review
  - live-provider-validation
applicablePhases:
  - "Phase 20"
  - "Phase 21"
  - "Phase 22"
  - "Phase 23"
  - "Phase 24"
  - "Live Production"
---

# Production Trust & Evidence Skill

## Purpose
The `production-trust-evidence` skill protects the studio's production truth model. It guarantees that release claims, acceptance bundles, and canon promotions are backed by unforgeable physical evidence, valid cryptographic bindings (SHA-256), and authentic operator signatures.

This skill is one of the most strictly enforced operational disciplines in the repository: **it operates strictly fail-closed**.

## The Six Foundational Truth Distinctions

```
┌─────────────────────────────────┬─────────────────────────────────┐
│ Simulation / Test Level         │ Reality / Production Level      │
├─────────────────────────────────┼─────────────────────────────────┤
│ Candidate                       │ Canon                           │
│ QA PASS                         │ HUMAN APPROVAL                  │
│ OFFLINE_TEST_DOUBLE             │ LIVE_EXTERNAL                   │
│ SIMULATED_FLOW                  │ GOOGLE_FLOW_REAL                │
│ AUTOMATED_TEST                  │ HUMAN                           │
│ OFFLINE_REHEARSAL_VERIFIED      │ MASTER_PRODUCTION_VERIFIED      │
└─────────────────────────────────┴─────────────────────────────────┘
```

1. **Candidate != Canon**: Generative outputs and AI extractions are candidates only. Promotion to canon requires passing formal verification gates or human sign-off.
2. **QA PASS != HUMAN APPROVAL**: Automated QA (Visual QA, Continuity QA) provides algorithmic confidence, but cannot substitute for required human operator sign-off.
3. **OFFLINE_TEST_DOUBLE != LIVE_EXTERNAL**: Offline mocks and fixtures verify code pathways; only live external API calls against genuine provider endpoints establish live provider proof.
4. **SIMULATED_FLOW != GOOGLE_FLOW_REAL**: Mock video imports and simulated render pipelines cannot claim real Google Flow operator provenance.
5. **AUTOMATED_TEST != HUMAN**: Automated test suites assert contracts; human approval requires an authenticated, non-simulated actor response.
6. **OFFLINE_REHEARSAL_VERIFIED != MASTER_PRODUCTION_VERIFIED**: Passing all tests offline confirms readiness for production, but never constitutes master production verification.

## Master Production Verification Invariant

> **EXPLICIT INVARIANT**:
> `MASTER_PRODUCTION_VERIFIED` cannot be manually configured, forced, or mocked.
> It can ONLY be **DERIVED** by the `ProductionVerifier` engine when all physical media files, provider provenance records, QA reports, and human approval challenges exist on disk, match their SHA-256 digest bindings, and exhibit zero contradictions.

### Fail-Closed Principle
If any of the following conditions occur, verification status defaults to **UNVERIFIED**:
- **Missing Evidence**: Required video, audio, or manifest files do not exist on disk.
- **Contradictory Evidence**: Provider provenance says `OFFLINE_TEST_DOUBLE` but release claims `LIVE_PILOT`.
- **Tampered Evidence**: Computed SHA-256 checksum does not match manifest digest.
- **Stale Evidence**: Media timestamps or pipeline run IDs precede the latest source commit or script update.

## Evidence Hierarchy & Manifest Inspection

When auditing a production release or checkpoint, verify the following evidence chain:

1. **Production-Run Evidence**:
   - Run identifier, git commit SHA, timestamp, seed parameters.
2. **Provider Evidence**:
   - Invocation logs with genuine `LIVE_EXTERNAL` callType, model identity, token count, latency.
3. **Media Evidence**:
   - Physical video/audio files present in `artifacts/` or designated output paths.
   - Verified via FFprobe (codec, container, frame rate, duration, resolution).
   - Cryptographic SHA-256 checksum recorded in manifest.
4. **QA Evidence**:
   - Structured Visual QA and Continuity QA logs with defect scores below rejection threshold.
5. **Human Approval Evidence**:
   - Signed approval challenge response with human reviewer identity and timestamp.
6. **Acceptance Manifest**:
   - Machine-readable manifest (`acceptance-manifest.json` / `acceptance-bundle.json`) linking all of the above.

## Verification Workflow

```
[Inspect Acceptance Request]
            │
            ▼
[Check Physical Media On Disk] ─── (Missing / 0 bytes) ──► FAIL-CLOSED: UNVERIFIED
            │ (Files Exist)
            ▼
[Compute SHA-256 Checksums] ────── (Hash Mismatch) ─────► FAIL-CLOSED: TAMPERED
            │ (Hashes Match)
            ▼
[Inspect Provider Provenance] ──── (Mock / Double) ─────► FAIL-CLOSED: OFFLINE_ONLY
            │ (LIVE_EXTERNAL Verified)
            ▼
[Check Human Approvals] ────────── (Missing / Faked) ───► FAIL-CLOSED: PENDING_APPROVAL
            │ (Approved by Human)
            ▼
[Derive MASTER_PRODUCTION_VERIFIED]
```

## Do / Do Not Rules

- **DO** verify actual file presence and recalculate SHA-256 checksums before affirming production status.
- **DO** fail-closed whenever evidence is ambiguous, incomplete, or corrupted.
- **DO** report exact missing evidence elements (e.g. "Shot 02 video missing SHA-256 match", "Human approval missing for Scene 1").
- **DO NOT** edit, mock, or hardcode verification states in JSON artifacts or codebase.
- **DO NOT** promote Candidates to Canon without satisfying candidate promotion invariants.
- **DO NOT** treat passing unit tests or rehearsal scripts as master production verification.

## Architecture References
- `packages/core/src/production-verifier/` (`ProductionVerifier`, `AcceptanceBundle`, `AcceptanceManifest`)
- `packages/core/src/domain/` (`CanonState`, `ProvenanceType`, `VerificationStatus`)
- `AGENTS.md` (Tenet 3: Candidate != Canon, Tenet 6: Checkpoint-Driven)
