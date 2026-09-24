# Genuine Live Pilot & Master Production Runbook

**Version**: 1.0.0  
**Status**: Authoritative Operator Guide  
**Target Engine**: AI Animation Studio (Phase 24)

---

## 1. Prerequisites

Before initiating a genuine production pilot, ensure the following tools are installed and accessible in the system `PATH`:

- **Node.js**: Version `>= 20.0.0` (LTS 20.x or 22.x recommended).
- **FFmpeg**: Executable installed and discoverable (`ffmpeg -version`).
- **FFprobe**: Executable installed and discoverable (`ffprobe -version`).
- **Disk Storage**: Write access in the current repository workspace (`.studio/` directory).

Verify your basic environment using:
```bash
node -v
ffmpeg -version
ffprobe -version
```

---

## 2. Gemini Configuration (Single Key Architecture)

The system adheres strictly to a **Single Gemini Credential Architecture**:
- Authenticates exclusively using the standard `GEMINI_API_KEY` environment variable.
- Key rotation, secondary keys (`GEMINI_API_KEY_2`), and credential pools are **strictly forbidden**.
- The key is used across all model roles (`FAST`, `STRUCTURED`, `REASONING`, `QA`, `VISION_QA`).
- The default active production model is `gemini-3.6-flash`.

### Setting the Key

**Windows (PowerShell)**:
```powershell
$env:GEMINI_API_KEY = "your_real_gemini_api_key_here"
```

**Linux / macOS (Bash / Zsh)**:
```bash
export GEMINI_API_KEY="your_real_gemini_api_key_here"
```

*(Note: API keys are masked as `AQ.A...hIjw` in all logs, status screens, and evidence bundles. Plaintext keys are never persisted.)*

---

## 3. System Doctor & Diagnostics

Execute the system diagnostics audit before starting any run:

```bash
npm run studio -- doctor
```

For checking live provider connectivity and model roles:
```bash
npm run studio -- gemini doctor --live
```

The Doctor verifies:
- `REQUIRED`: Node.js version, workspace storage write permissions, FFmpeg, FFprobe.
- `LIVE-ONLY`: Masked Gemini API key configuration and live ping response latency.

---

## 4. Preflight & Dry Run

Run preflight audit on the canonical pilot story without mutating any production disk state:

```bash
npm run studio -- production pilot-preflight examples/stories/pilot-01.txt
```

Verify dry-run simulation:
```bash
npm run studio -- production pilot examples/stories/pilot-01.txt --dry-run
```

Expected output:
```text
VERDICT: READY FOR LIVE HUMAN PILOT 🚀
Next step: run 'studio production pilot "examples/stories/pilot-01.txt" --live'
```

---

## 5. Start Live Pilot

Initialize a genuine live pilot run:

```bash
npm run studio -- production pilot examples/stories/pilot-01.txt --live
```

What happens automatically:
1. A unique `ProductionRun` entity is created (e.g. `run_1790216644143_3iode` in `proj_pilot_...`).
2. Script breakdown and shot planning are executed using live Gemini (`gemini-3.6-flash`).
3. Shot contract is generated and locked.
4. Google Flow handoff bundle is prepared.
5. Execution safely pauses at the **Google Flow Human Trust Boundary** with status `NEEDS_USER_ACTION`.

---

## 6. Flow Handoff Package

The system generates a deterministic operator package at:
```text
.studio/production/<projectId>/<runId>/handoff/<shotId>/
```

Contents of the handoff directory:
- `flow-prompt.txt`: Sanitized cinematic generation prompt.
- `operator-instructions.md`: Step-by-step guidance for Google Flow.
- `shot-contract.json`: Machine-readable shot timing, camera instruction, and continuity anchors.
- `handoff-manifest.json`: Cryptographic integrity manifest for the handoff assets.

---

## 7. Google Flow Generation (Assisted Human Boundary)

**Rule: Never automate or fake Google Flow video generation.**

1. Open [Google Flow Workspace](https://labs.google/flow) in your web browser.
2. Paste the prompt from `flow-prompt.txt`.
3. Configure camera movement, duration (e.g. 3.0s), and aspect ratio (`16:9`) as described in `operator-instructions.md`.
4. Generate the video and review the candidate output.
5. Download the final rendered video MP4 to your workstation (e.g. `C:\Downloads\flow_shot_01.mp4`).

---

## 8. Media Import & Verification

Import the downloaded video file into the production pipeline:

```bash
npm run studio -- production import <runId> <shotId> "<path_to_downloaded_mp4>" --source google-flow --real-external
```

The system will:
- Check file existence and non-zero size.
- Execute FFprobe stream analysis (dimensions, duration, fps, codec).
- Compute SHA-256 cryptographic digest.
- Verify zero test/smoke fixture leakage.
- Record `ProductionMediaEvidence` with `generationSource: GOOGLE_FLOW_REAL` and `providerTrust: LIVE_EXTERNAL`.
- Invalidate any stale prior approvals or QA records.

---

## 9. Live Multimodal Visual QA

When imported, the pipeline triggers live multimodal QA using Gemini Vision:

```bash
npm run studio -- production resume <runId>
```

QA evaluates:
- Character identity preservation.
- Spatial continuity and environment consistency.
- Visual defect rate and artifacting.
- Temporal motion coherence.
- Prompt compliance.

Inspect QA results:
```bash
npm run studio -- production status <runId>
```

---

## 10. Retake Loop (If QA Fails)

If the candidate video fails QA criteria (`criticalDefects > 0` or `retakesRecommended > 0`):
1. The pipeline halts Canon approval and prepares surgical retake instructions.
2. A new handoff package is emitted with defect remediation prompts.
3. Operator generates an updated clip in Google Flow.
4. Operator re-imports the updated file. Prior stale QA and challenges are automatically invalidated.
5. Multimodal QA re-runs on the fresh media.

---

## 11. Human Approval Ceremony

**Rule: A test process, CI runner, or AI agent must NEVER emit `approvalType=HUMAN`. Only an interactive operator challenge ceremony can approve Canon.**

1. Issue operator challenge and initiate ceremony:
   ```bash
   npm run studio -- production approve <runId> <shotId> --human
   ```
2. The CLI prompts the operator to inspect the video SHA-256 and confirm candidate acceptance.
3. Upon human confirmation, the challenge nonce is consumed, and `approvalType: HUMAN` is sealed in `approvalEvidence`.

---

## 12. Master Video Rendering

Once all required shots are approved into Canon, render the final deliverable:

```bash
npm run studio -- production resume <runId>
```

The rendering engine:
1. Assembles timeline from canonical media files only.
2. Executes deterministic multi-track mix and conform via FFmpeg.
3. Renders `master.mp4`.
4. Executes FFprobe verification on `master.mp4` and computes SHA-256 checksum.

---

## 13. Production Verification & Release Gate

Audit the completed run against all release invariants:

```bash
npm run studio -- production release-gate <runId>
```

Or for machine-readable JSON output:
```bash
npm run studio -- production release-gate <runId> --json
```

The release gate verifies:
- `allShotsAuthoritativeMedia`: Every shot has recorded media.
- `allMediaPhysicallyExists`: Media files physically exist on disk and are non-empty.
- `zeroTestOrSmokeLeakage`: Zero fixture or test path contamination.
- `allShotsRealFlowGenerated`: `generationSource === GOOGLE_FLOW_REAL`.
- `allShotsHumanApproved`: `approvalType === HUMAN` with valid consumed challenge ceremony.
- `masterMediaPhysicallyVerified`: Master video exists, is non-zero, and matches recorded SHA-256.
- `acceptanceBundleValid`: Manifest self-integrity and checksums match on disk.
- `productionInvariantsValid`: Invariant checks pass.

Only when **every** condition holds true does the gate derive:
```text
Status: MASTER_PRODUCTION_VERIFIED ✅
```

---

## 14. Acceptance Evidence Export

Export the complete sanitized acceptance bundle for audit and archiving:

```bash
npm run studio -- production export-evidence <runId> [destination_dir]
```

The exported bundle contains:
- `production-acceptance.json`: Metadata summary.
- `provider-evidence.json`: Sanitized LLM call metrics and hashes.
- `media-evidence.json`: FFprobe metadata and SHA-256 hashes.
- `qa-evidence.json`: Multimodal QA scores and coverage records.
- `approval-evidence.json`: Human approval and challenge records.
- `master-evidence.json`: Final master video metrics.
- `acceptance-manifest.json`: Manifest with self-integrity SHA-256.

All secrets (`AIzaSy...`, bearer tokens) are scrubbed automatically.

---

## 15. Troubleshooting & FAQ

| Symptom | Cause | Remediation |
|---|---|---|
| `WAITING_FOR_PROVIDER` | `GEMINI_API_KEY` missing or rate limited (HTTP 429). | Check quota window; set valid `GEMINI_API_KEY`. Resume with `studio production resume <runId>`. |
| `NEEDS_USER_ACTION` | Waiting for external Flow generation or human approval. | Check `studio production status <runId>` and follow the exact printed command. |
| `BLOCKED_ENVIRONMENT` | Missing FFmpeg, FFprobe, or Node < 20. | Install required binaries and ensure they are on system `PATH`. |
| `SHA-256 mismatch` | Media file edited or re-rendered after import. | Re-import video file using `studio production import ...`. Stale QA/approval will be reset. |
| `Leaked test fixture` | Media imported from `fixtures/` or `.studio/smoke/`. | Import only genuine external video downloaded to operator media directory. |
