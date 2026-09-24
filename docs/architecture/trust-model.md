# AI Animation Studio — Trust Model & Security Architecture

> **Release Candidate Architecture Documentation**  
> Status: **AUTHORITATIVE**  
> Last Updated: September 2026

---

## 1. Overview & Trust Philosophy

The **AI Animation Studio** is built upon a fundamental architectural truth:

> **REALITY ALWAYS WINS OVER DEMO SUCCESS.**  
> Synthetic test evidence, mock providers, and automated test harnesses must never be conflated with genuine human-directed, live-provider production.

The studio operates on a **Single-Writer, Workstation-Bound, Operator-Assisted** model. This document details the security boundaries, provenance rules, cryptographic assertions, and real-world limitations of the release candidate.

---

## 2. Core Provenance & Classification Taxonomies

To prevent accidental or malicious misrepresentation of production readiness, the system strictly enforces the following permanent distinctions across all schemas, validators, and runtime engines:

| Category | Real Production Value | Offline / Rehearsal Value | Description |
| :--- | :--- | :--- | :--- |
| **Provider Trust** | `LIVE_EXTERNAL` | `OFFLINE_TEST_DOUBLE`, `MOCK` | Network calls to external AI APIs vs deterministic offline doubles. |
| **Media Source** | `GOOGLE_FLOW_REAL` | `SIMULATED_FLOW`, `IMPORTED` | Video rendered via genuine Google Flow vs local synthetic/rehearsal fixtures. |
| **Sign-Off Actor** | `HUMAN` | `AUTOMATED_TEST`, `SYSTEM` | Interactive TTY challenge completed by human operator vs automated CI harness. |
| **Deliverable Status** | `MASTER_PRODUCTION_VERIFIED` | `OFFLINE_REHEARSAL_VERIFIED` | Final gate passed with genuine live external evidence vs rehearsal execution. |

### Invariant Rules
1. `MASTER_PRODUCTION_VERIFIED` can **ONLY** be issued when:
   - Every required shot has `approvalType === 'HUMAN'`.
   - Every required shot has `generationSource === 'GOOGLE_FLOW_REAL'`.
   - Every required shot has `providerTrust === 'LIVE_EXTERNAL'`.
   - All physical media files on disk match their SHA-256 checksums recorded at time of approval.
2. In all other circumstances (including CI, local offline rehearsals, and simulated pilots), the maximum achievable verification status is **`OFFLINE_REHEARSAL_VERIFIED`**.
3. Schema migration and storage loaders must **NEVER** upgrade an unverified record to `HUMAN`, `GOOGLE_FLOW_REAL`, or `LIVE_EXTERNAL`.

---

## 3. Single Gemini Credential Architecture

The studio enforces a strict **Single Gemini Credential** policy:
- Exactly **ONE** Gemini credential environment variable is recognized: `GEMINI_API_KEY`.
- The following patterns are prohibited and rejected by architecture rules:
  - `GEMINI_API_KEY_2`, `SECONDARY_GEMINI_KEY`, `BACKUP_GEMINI_KEY`, `GEMINI_API_KEYS`.
  - Credential rotation pools, multi-account rotation, or automatic key failover.
- Role-based routing is centralized under `getCentralizedModelPolicy()`:
  - `FAST`: Low-latency tasks (e.g., shot assist).
  - `REASONING`: Complex director logic and script breakdown.
  - `STRUCTURED`: Zod-validated entity extraction.
  - `QA` / `VISION_QA`: Multimodal keyframe inspection.
- All roles route through the single authenticated `GEMINI_API_KEY`.

---

## 4. Workstation Trust & Security Boundaries

### 4.1. Local Filesystem Containment
- The system prevents path traversal attacks across all user-controlled identifiers (`projectId`, `runId`, `shotId`, `seriesId`, `assetId`).
- `assertSafeIdentifier(id, name)` strictly permits only `[a-zA-Z0-9_-]+` and rejects `../`, `..\`, absolute paths, and UNC network paths.
- `assertPathContained(root, target)` guarantees that runtime file access cannot escape the intended `.studio/` storage root.

### 4.2. Command Injection Prevention
- All external media tools (FFmpeg, FFprobe) are invoked using safe process argument arrays via `execFileSync(toolPath, argsArray, { stdio: 'pipe' })`.
- Shell interpolation (`exec('command "' + userInput + '"')`) is strictly prohibited across all media processing modules.

### 4.3. Operator Challenge Ceremony
- When promoting a candidate shot into approved Canon (`studio production approve <runId> <shotId> --human`), the orchestrator issues a single-use cryptographic challenge (`ProductionApprovalChallenge`).
- The challenge binds:
  - `runId` and `projectId`
  - `shotId` and `candidateAssetId`
  - `mediaSha256` (physical checksum of candidate media)
  - `qaReportId` (authoritative Visual QA evaluation)
  - Cryptographically random 16-character hex nonce
- The human operator must confirm the exact nonce in an interactive TTY terminal (`APPROVE <nonce>`).
- If the media file is altered on disk or re-imported, all existing challenges and approvals for that shot are instantly invalidated (`ProductionInvalidationEngine`).

### 4.4. Secret Redaction
- All CLI output, log traces, exported evidence bundles, and error records pass through `redactSecrets`.
- `redactSecrets` masks Google API keys (`AIzaSy...`), bearer tokens, and sensitive query parameters (`?key=...`) to ensure zero secret leakage in persisted artifacts.

---

## 5. Acceptance Bundles & Cryptographic Integrity

### Content Integrity vs Non-Repudiation
The **Production Acceptance Bundle** (`ProductionAcceptanceBundle`) packages durable run evidence into a verifiable directory:
- Computes SHA-256 hashes of every individual evidence artifact (`production-run.json`, `media-evidence.json`, `qa-evidence.json`, `approval-evidence.json`, `master-evidence.json`).
- Compiles `acceptance-manifest.json` with a self-integrity checksum (`manifestSha256`).
- Keys and array members are deterministically sorted to prevent noisy or flaky diffs across machines.

> **IMPORTANT**:  
> The acceptance bundle provides **content integrity and tamper detection** when the manifest is held authoritative. It does **not** provide asymmetric cryptographic non-repudiation (digital signatures with public key infrastructure). Any user with write access to the workstation filesystem could technically recalculate hashes; therefore, trust relies on the local operator's custody of the workstation.

---

## 6. Data Retention & Cleanup Guide

Production workflows generate media files, frames, and structured evidence. Use the following guidelines to manage disk storage safely:

### Safe to Delete Anytime (Regenerable Work)
- `.studio/cache/`: LLM prompt and response cache.
- `.studio/temp/`: Ephemeral render chunks and intermediate scratch files.
- `.studio/renders/`: Local preview videos (can be regenerated from timeline).
- `.studio/exports/`: HTML5 player exports, EDL, and OTIO files (can be re-exported from project timeline).
- `.studio/flow/packages/`: Assisted Flow packages (can be recompiled via `studio flow prepare`).

### Authoritative — DO NOT DELETE for Active or Audited Runs
- `.studio/production/<projectId>/<runId>/`:
  - `production-run.json`: Lifecycle state, revisions, and shot matrix.
  - `media-evidence.json`: FFprobe metadata and SHA-256 bindings.
  - `qa-evidence.json`: Visual QA scores, defect records, and mechanism.
  - `approval-evidence.json`: Human operator and automated approval evidence.
  - `approval-challenges.json`: Cryptographic challenge records.
  - `master-evidence.json`: Final master MP4 physical metadata and checksum.
  - `acceptance/`: Durable acceptance manifest and report.

To archive or export run evidence safely without secrets, run:
```bash
npx studio production export-evidence <runId> [destinationDir]
```

---

## 7. Real-World Limitations

1. **Google Flow is an Assisted Manual Workspace**: There is no public, programmatic, automated video generation API for Google Flow. The studio bridges Flow via assisted package export, manual web generation by the operator, and rigorous verification upon import.
2. **Quota & Rate Limits**: Gemini API quota behavior and rate limits are handled gracefully via `WAITING_FOR_PROVIDER` transitions, but actual account quota limits can only be observed against live Google endpoints.
3. **Aesthetic Human Direction**: Automated Visual QA evaluates physical integrity, aspect ratio, frame rates, and visual defects, but cannot replace genuine human creative and aesthetic direction.
4. **Single-Process Writer**: Concurrent writes to the exact same `runId` from multiple OS processes should be avoided; the studio implements optimistic revision checking (`expectedRevision`), failing closed if concurrent modifications occur.
