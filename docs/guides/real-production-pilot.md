# Operator Guide — Real Production Pilot (1-Shot)

## Overview

This guide provides the complete, step-by-step procedure for a human operator to execute and verify the first genuine **1-Shot Production Pilot** in AI Animation Studio using:
- **One Unified Gemini API Key** (`GEMINI_API_KEY`)
- **Google Flow** web workspace ([https://labs.google/flow](https://labs.google/flow))
- **AI Animation Studio CLI** on Windows or Linux

---

## 🏛️ Core Production Tenets & Trust Boundaries

### 1. Single Gemini Architecture
Exactly **one** Gemini API key is used across all studio operations:
```bash
GEMINI_API_KEY="AIzaSy..."
```
> [!IMPORTANT]
> Never configure backup keys, secondary keys, key rotation pools, or dual-Gemini architectures.
> Roles (`FAST`, `REASONING`, `STRUCTURED`, `QA`, `VISION_QA`) configure model tiers (e.g. `gemini-3.5-flash`), not separate provider credentials.

### 2. Operator Challenge Confirmation Boundary
Studio's `HUMAN` approval record represents completion of the operator challenge ceremony (`APPROVE <nonce>`).
> [!NOTE]
> **Trust Boundary Notice**: The operator challenge is an application-level confirmation boundary protecting against accidental approval, stale approval, wrong shot, wrong project, wrong run, wrong asset, changed media, replaced QA, and replay. It is not cryptographic proof of physical human presence; code with unrestricted access to the local Studio process and storage is outside this trust boundary.

### 3. Production Truth
Never allow offline test doubles, mocks, simulated Flow media (`SIMULATED_FLOW`), or unverified external media to satisfy `MASTER_PRODUCTION_VERIFIED`. Until a genuine human operator run completes with verified live provider evidence, repository status truthfully remains:
```text
MASTER PRODUCTION: NOT VERIFIED (OFFLINE_REHEARSAL_VERIFIED)
```

---

## 📜 Canonical Pilot Screenplay (`pilot-story.txt`)

Save the following canonical ultra-short story to `pilot-story.txt`:

```text
Minh nhìn thấy một con bướm trắng phát sáng bay quanh ngọn nến trong căn phòng tối tĩnh lặng.
```

This ensures exactly **ONE** shot contract (`requiredShotCount = 1`) is planned and routed to Google Flow.

---

## 📋 Step-by-Step Pilot Execution Procedure

| Step | Action | Boundary | Description |
| :--- | :--- | :--- | :--- |
| **0** | Pre-Flight Readiness Check | `[LOCAL]` | Run `studio production pilot-preflight` (checks Node, FFmpeg, storage, keys) |
| **1** | Configure API Key | `[SYSTEM]` | Set `GEMINI_API_KEY` in environment or `.env` |
| **2** | Enable Live Execution | `[HUMAN ACTION]` | Set `RUN_LIVE_PROVIDER_TESTS=true` or pass `--live` |
| **3** | Initialize 1-Shot Pilot | `[SYSTEM]` + `[LOCAL]` | Run `studio production pilot .\pilot-story.txt --live` |
| **4** | Inspect Flow Handoff | `[HUMAN ACTION]` | Open `.studio/production/<proj>/<run>/handoff/<shot>/` |
| **5** | Generate Clip in Flow | `[GOOGLE FLOW]` + `[HUMAN ACTION]` | Paste prompt, upload references, generate in Flow |
| **6** | Download Media | `[HUMAN ACTION]` | Download rendered MP4 as `SHOT_SCENE_01_SH01_FLOW_REAL.mp4` |
| **7** | Import Media | `[HUMAN ACTION]` + `[LOCAL]` | Run `studio production import` with `--source google-flow --real-external` |
| **8** | Multimodal Visual QA | `[PROVIDER]` | Multimodal Gemini Vision evaluates 8 dimensions |
| **9** | Review QA & Status Matrix | `[HUMAN ACTION]` | Inspect visual QA scores and 11-step production matrix |
| **10** | Operator Approval Ceremony | `[HUMAN ACTION]` | Execute `studio production approve <runId> <shotId> --human` and confirm nonce |
| **11** | Timeline Assembly & Master | `[SYSTEM]` + `[LOCAL]` | Run `studio production resume <runId>` |
| **12** | Audit Acceptance Bundle | `[HUMAN ACTION]` | Inspect `.studio/production/<proj>/<run>/acceptance/` |

---

### Step 0: Pre-Flight Readiness Check `[LOCAL]`

Before spending time or configuring live credentials, verify workstation readiness completely offline:

**PowerShell (Windows):**
```powershell
npm.cmd run studio production pilot-preflight .\pilot-story.txt
```

**Bash (Linux/macOS):**
```bash
npm run studio production pilot-preflight ./pilot-story.txt
```

This performs **zero** network calls and checks:
- Node.js runtime version (>= 20.0.0)
- FFmpeg and FFprobe executable paths and stream probing capabilities
- Story script presence and non-emptiness
- Gemini credential status (masked safely: `AIza...1234`, never full key)
- Live network call authorization policy
- Centralized model tier mapping
- Storage write permissions in `.studio/`


---

### Step 1: Configure Unified Gemini API Key `[SYSTEM]`

**PowerShell (Windows):**
```powershell
$env:GEMINI_API_KEY = "AIzaSyYourActualApiKeyHere"
```

**Bash (Linux/macOS):**
```bash
export GEMINI_API_KEY="AIzaSyYourActualApiKeyHere"
```

---

### Step 2: Opt into Live Execution `[HUMAN ACTION]`

To prevent accidental quota consumption during automated tests, live calls are gated behind:

**PowerShell (Windows):**
```powershell
$env:RUN_LIVE_PROVIDER_TESTS = "true"
```

**Bash (Linux/macOS):**
```bash
export RUN_LIVE_PROVIDER_TESTS="true"
```

---

### Step 3: Initialize 1-Shot Pilot `[SYSTEM]` `[LOCAL]`

**PowerShell (Windows):**
```powershell
npm.cmd run studio production pilot .\pilot-story.txt --project pilot_prod_01 --series pilot_series
```

**Bash (Linux/macOS):**
```bash
npm run studio production pilot ./pilot-story.txt --project pilot_prod_01 --series pilot_series
```

Studio will:
1. Ingest the story losslessly.
2. Analyze narrative beats and extract candidates.
3. Plan exactly **ONE canonical shot** (`SHOT_SCENE_01_SH01`).
4. Generate the Google Flow Operator Handoff Package.
5. Safely stop at `NEEDS_USER_ACTION`.

---

### Step 4: Inspect Generated Flow Handoff Package `[HUMAN ACTION]`

Navigate to:
```text
.studio/production/pilot_prod_01/<runId>/handoff/SHOT_SCENE_01_SH01/
```
The package contains:
- `operator-instructions.md`: Step-by-step operator directions
- `flow-prompt.txt`: Ready-to-paste generative video prompt
- `shot-contract.json`: Authoritative shot specifications (focal length, framing, lighting)
- `references.json`: Resolved character and location reference descriptors
- `continuity-context.json`: Framing and continuity parameters
- `handoff-manifest.json`: SHA-256 checksum-verified package manifest

---

### Step 5: Generate in Google Flow `[GOOGLE FLOW]` `[HUMAN ACTION]`

1. Open [https://labs.google/flow](https://labs.google/flow) in your browser.
2. Select **Video Generation** mode.
3. Set aspect ratio (`16:9`) and duration (`4.0s`).
4. Copy the entire contents of `flow-prompt.txt` into the Flow prompt field.
5. In the Reference Assets drawer, attach any generated turnaround references if present.
6. Click **Generate** and review the rendered result.

---

### Step 6: Download Clip `[HUMAN ACTION]`

Download the finished MP4 video to your workstation:
```text
C:\Users\<username>\Downloads\SHOT_SCENE_01_SH01_FLOW_REAL.mp4
```

---

### Step 7: Import Media with Explicit Provenance `[HUMAN ACTION]` `[LOCAL]`

Import the downloaded video file into Studio:

**PowerShell (Windows):**
```powershell
npm.cmd run studio production import <runId> SHOT_SCENE_01_SH01 "C:\Users\<username>\Downloads\SHOT_SCENE_01_SH01_FLOW_REAL.mp4" --source google-flow --real-external
```

**Bash (Linux/macOS):**
```bash
npm run studio production import <runId> SHOT_SCENE_01_SH01 "/path/to/SHOT_SCENE_01_SH01_FLOW_REAL.mp4" --source google-flow --real-external
```

Studio will:
- Validate physical file existence and readability.
- Validate playable video stream via FFprobe (codec, resolution, fps, duration).
- Compute and persist SHA-256 hash.
- Invalidate any previous approvals or challenges for that shot.
- Trigger Multimodal Visual QA.

---

### Step 8: Multimodal Visual QA `[PROVIDER]`

Multimodal Gemini Vision evaluates the imported media across all 8 dimensions:
1. **Artifact Integrity**: Stream readability and container conformance
2. **Character Identity Consistency**: Visual fidelity to canonical turnaround
3. **Spatial & Environment Consistency**: Perspective and lighting adherence
4. **Semantic Action Compliance**: Execution of prompt instructions
5. **Temporal Artifact Detection**: Frame-to-frame stability and morphing checks
6. **Visual Defects**: Anatomy, face, hand, and edge defects
7. **Composition & Framing**: Rule of thirds, focal length, shot size
8. **Continuity Context**: Lighting and screen direction continuity

*Quota Protection*: If Gemini quota is exceeded (HTTP 429), Studio safely transitions to `WAITING_FOR_PROVIDER` without falling back to mock. All imported media evidence remains strictly preserved.

---

### Step 9: Review Status Matrix `[HUMAN ACTION]`

Inspect the 11-step production matrix:

```bash
npm run studio production status <runId>
```

Output:
```text
==============================================================
REAL PRODUCTION PILOT
==============================================================

Run                  : run_pilot_12345
Project              : pilot_prod_01
Series               : pilot_series
Required Shots       : 1

[1] STORY            : READY
[2] SHOT CONTRACT    : READY
[3] FLOW HANDOFF     : READY
[4] REAL MEDIA       : VERIFIED
[5] LIVE VISUAL QA   : VERIFIED (Overall: PASS, Defects: 0)
[6] HUMAN REVIEW     : PENDING REVIEW
[7] CANON APPROVAL   : PENDING
[8] TIMELINE         : PENDING
[9] CONTINUITY       : PENDING
[10] MASTER          : PENDING
[11] ACCEPTANCE      : PENDING

NEXT ACTION:
Perform operator challenge ceremony to review and approve candidate for shot "SHOT_SCENE_01_SH01".

RECOMMENDED COMMAND:
studio production approve run_pilot_12345 SHOT_SCENE_01_SH01 --human
==============================================================
```

---

### Step 10: Operator Approval Ceremony `[HUMAN ACTION]`

Run the interactive approval command:

```bash
npm run studio production approve <runId> SHOT_SCENE_01_SH01 --human
```

Studio issues an approval challenge bound to the exact candidate asset ID, media SHA-256, and QA report ID:
```text
--- Candidate Review: Shot "SHOT_SCENE_01_SH01" ---
Shot ID            : SHOT_SCENE_01_SH01
Candidate Asset ID : ASSET_IMPORT_SHOT_SCENE_01_SH01_1720000000
Media SHA-256      : a8b4c2d1e...
QA Report ID       : vis_qa_SHOT_SCENE_01_SH01_1720000000
QA status          : PASS
Provider trust     : LIVE_EXTERNAL
Challenge ID       : chal_e4f8a1...
Challenge Nonce    : 7A3F9B2C4D1E

Type "APPROVE 7A3F9B2C4D1E" to confirm human approval:
```
Type `APPROVE <nonce>` and press Enter. The challenge is consumed (single-use) and recorded as `approvalType: 'HUMAN'`.

---

### Step 11: Timeline Assembly & Master Render `[SYSTEM]` `[LOCAL]`

Resume the production run:

```bash
npm run studio production resume <runId>
```

Studio will:
1. Assemble the sequence timeline strictly from approved Canon media.
2. Mix master audio stems.
3. Run Continuity QA.
4. Render master MP4 deliverable.
5. Compile Preliminary Master Evidence.
6. Build Durable Acceptance Bundle.
7. Validate Acceptance Manifest Integrity.
8. Grant `MASTER_PRODUCTION_VERIFIED` upon full criteria satisfaction.

---

### Step 12: Audit Acceptance Bundle `[HUMAN ACTION]`

Inspect the final acceptance package:
```text
.studio/production/pilot_prod_01/<runId>/acceptance/
├── production-acceptance.json
├── provider-evidence.json
├── media-evidence.json
├── qa-evidence.json
├── approval-evidence.json
├── approval-challenges.json
├── continuity-evidence.json
├── master-evidence.json
└── acceptance-manifest.json
```

Verify the final status:
```bash
npm run studio production status <runId>
```

---

## 🧪 Autonomous Offline Rehearsal Smoke

Before running the live human pilot, you can verify the entire 11-step sequence offline with zero live provider calls:

```powershell
npm.cmd run smoke:pilot-rehearsal
```

Output:
- Tags: `OFFLINE_REHEARSAL | SIMULATED_FLOW | AUTOMATED_TEST`
- Status: `OFFLINE_REHEARSAL_VERIFIED`
- All state invariants satisfied
- Zero Gemini quota consumed
- Zero browser automation

---

## 🛠️ Operator Troubleshooting & Recovery Guide

### 1. Gemini Quota Exceeded (`WAITING_FOR_PROVIDER`)
- **Symptom**: Step 8 transitions run to `WAITING_FOR_PROVIDER` with message `Gemini API quota exceeded (QUOTA_EXCEEDED)`.
- **Truth Invariant**: Studio NEVER falls back to mock providers during a production run. All imported media, evidence, and checkpoints remain 100% preserved.
- **Recovery**: Wait for quota reset window or update `GEMINI_API_KEY`. Once available, resume execution idempotently:
  ```powershell
  npm.cmd run studio production resume <runId> --live
  ```

### 2. Flow File Missing or Corrupted
- **Symptom**: Import fails with `[MEDIA_INVALID]` or `[MEDIA_NOT_FOUND]`.
- **Recovery**: Verify the downloaded file is a valid MP4 with a playable video stream using FFprobe:
  ```powershell
  npm.cmd run studio doctor
  ```
  Ensure the path is properly quoted in PowerShell if it contains spaces:
  ```powershell
  npm.cmd run studio production import <runId> SHOT_SCENE_01_SH01 "C:\AI Projects\Pilot Run\clip.mp4" --source google-flow --real-external
  ```

### 3. Visual QA Defect Detected / Retake Required
- **Symptom**: Step 8 QA scores indicate defects or recommendations: `[RETAKE_RECOMMENDED]`.
- **Recovery**: Inspect the visual QA defects report:
  ```powershell
  npm.cmd run studio qa visual <projectId> SHOT_SCENE_01_SH01
  ```
  Generate a new take in Google Flow adjusting prompt or camera parameters, then re-import with the same command. Studio automatically invalidates previous QA and approval records via `ProductionInvalidationEngine`.

### 4. Approval Challenge Expired (TTL default 15 min)
- **Symptom**: Operator tries to approve but receives `[APPROVAL_CHALLENGE_EXPIRED]`.
- **Recovery**: Simply re-run the approve command. Studio automatically generates a fresh random challenge with a new 15-minute TTL:
  ```powershell
  npm.cmd run studio production approve <runId> SHOT_SCENE_01_SH01 --human
  ```

### 5. Process Interruption or Terminal Crash
- **Symptom**: System was rebooted, terminal was closed, or process was terminated abruptly.
- **Recovery**: Check current state using the read-only status command:
  ```powershell
  npm.cmd run studio production status <runId>
  ```
  Studio stores all state durably in `.studio/production/<projectId>/<runId>/`. Simply resume from where you left off:
  ```powershell
  npm.cmd run studio production resume <runId>
  ```

### 6. Windows PowerShell Quoting & Execution Policy
- If PowerShell blocks scripts (`ExecutionPolicy Restricted`), always invoke using `npm.cmd`:
  ```powershell
  npm.cmd run studio ...
  ```
- Always wrap paths with double quotes when spaces or special characters exist:
  ```powershell
  npm.cmd run studio production import <runId> <shotId> "C:\Users\John Doe\Downloads\video.mp4" --source google-flow --real-external
  ```

