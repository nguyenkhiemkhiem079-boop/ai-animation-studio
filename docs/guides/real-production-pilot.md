# Operator Guide — Real Production Pilot (1-Shot)

## Overview

This guide provides the complete, step-by-step procedure for a human operator to execute and verify a genuine **1-Shot Production Pilot** in AI Animation Studio using:
- **One Gemini API Key** (`GEMINI_API_KEY`)
- **Google Flow** web workspace ([https://labs.google/flow](https://labs.google/flow))
- **AI Animation Studio CLI**

---

## 🏛️ Core Production Tenets & Trust Boundaries

### 1. Single Gemini Architecture
Exactly **one** Gemini API key is used across all studio operations:
```bash
GEMINI_API_KEY="AIzaSy..."
```
Do **not** configure backup keys, secondary keys, or rotation pools. Model roles (`FAST`, `REASONING`, `STRUCTURED`, `QA`, `VISION_QA`) configure model tiers (e.g. `gemini-3.5-flash`), not multiple providers.

### 2. Operator Challenge Trust Boundary
Studio's `HUMAN` approval record represents completion of the operator challenge ceremony (`APPROVE <nonce>`).
> [!NOTE]
> **Trust Boundary Notice**: The operator challenge is an application-level confirmation boundary protecting against accidental approval, stale approval, wrong shot, wrong project, wrong run, wrong asset, changed media, replaced QA, and replay. It is not cryptographic proof of physical human presence; code with unrestricted access to the local Studio process and storage is outside this trust boundary.

### 3. Production Truth
Never allow offline test doubles, mocks, simulated Flow media (`SIMULATED_FLOW`), or unverified external media to satisfy `MASTER_PRODUCTION_VERIFIED`. Until a genuine human operator run completes with verified live provider evidence, repository status truthfully remains:
```text
MASTER PRODUCTION: NOT VERIFIED (OFFLINE_REHEARSAL_VERIFIED)
```

---

## 📋 Step-by-Step Pilot Execution Procedure

| Step | Action | Boundary | Description |
| :--- | :--- | :--- | :--- |
| **1** | Configure API Key | `[SYSTEM]` | Set `GEMINI_API_KEY` in environment or `.env` |
| **2** | Enable Live Execution | `[HUMAN ACTION]` | Set `RUN_LIVE_PROVIDER_TESTS=true` for pilot run |
| **3** | Initialize 1-Shot Pilot | `[SYSTEM]` + `[LOCAL]` | Run `studio production pilot <storyFile>` |
| **4** | Inspect Flow Handoff | `[HUMAN ACTION]` | Open `.studio/production/<proj>/<run>/handoff/<shot>/` |
| **5** | Generate Clip in Flow | `[GOOGLE FLOW]` + `[HUMAN ACTION]` | Paste prompt, upload references, generate in Flow |
| **6** | Download Media | `[HUMAN ACTION]` | Download rendered MP4 as `SHOT_01_FLOW_REAL.mp4` |
| **7** | Import Media | `[HUMAN ACTION]` + `[LOCAL]` | Run `studio production import` with `--source google-flow --real-external` |
| **8** | Multimodal Visual QA | `[PROVIDER]` | Multimodal Gemini Vision evaluates 8 dimensions |
| **9** | Review QA & Candidate | `[HUMAN ACTION]` | Inspect visual QA scores and defects |
| **10** | Operator Approval Ceremony | `[HUMAN ACTION]` | Execute `studio production approve <runId> <shotId> --human` and confirm nonce |
| **11** | Timeline Assembly & Master | `[SYSTEM]` + `[LOCAL]` | Run `studio production resume <runId>` |
| **12** | Audit Acceptance Bundle | `[HUMAN ACTION]` | Inspect `.studio/production/<proj>/<run>/acceptance/` |

---

### Step 1: Configure Unified Gemini API Key `[SYSTEM]`
Ensure your Google AI Studio API key is exported:
```bash
export GEMINI_API_KEY="AIzaSyYourKeyHere"
```
Or place it in your local `.env` file (which is git-ignored).

### Step 2: Opt into Live Execution `[HUMAN ACTION]`
To prevent accidental quota consumption during automated tests, live calls are gated behind:
```bash
export RUN_LIVE_PROVIDER_TESTS="true"
```

### Step 3: Initialize 1-Shot Pilot `[SYSTEM]` `[LOCAL]`
Run the pilot command with your story script:
```bash
studio production pilot ./my_story.txt --project pilot_prod_01 --series pilot_series
```
The studio will:
1. Ingest the story losslessly
2. Analyze beats and candidates
3. Select exactly **ONE canonical shot** (`SHOT_01`)
4. Resolve character and location references
5. Generate the Google Flow Operator Handoff Package
6. Safely stop at `NEEDS_USER_ACTION`

### Step 4: Inspect Generated Flow Handoff Package `[HUMAN ACTION]`
Navigate to:
```text
.studio/production/pilot_prod_01/<runId>/handoff/SHOT_01/
```
The directory contains:
- `operator-instructions.md`: Step-by-step guidance
- `flow-prompt.txt`: Ready-to-paste prompt
- `shot-contract.json`: Authoritative shot specifications
- `references.json`: Resolved character and location reference descriptors
- `character-reference/`: Reference turnaround images
- `location-reference/`: Reference environment plates
- `start-frame/`: Start keyframe if continuity requires it
- `continuity-context.json`: Framing and continuity parameters
- `handoff-manifest.json`: Checksum-verified package manifest

### Step 5: Generate in Google Flow `[GOOGLE FLOW]` `[HUMAN ACTION]`
1. Open [https://labs.google/flow](https://labs.google/flow) in your web browser.
2. Select **Video Generation** mode.
3. Set the aspect ratio (`16:9`) and duration (`4.0s`).
4. Copy the entire contents of `flow-prompt.txt` into the Flow prompt box.
5. In the Reference Assets drawer, upload the files from `character-reference/` and `location-reference/`.
6. Click **Generate** and review the rendered result.

### Step 6: Download Clip `[HUMAN ACTION]`
Download the finished video to your workstation. Recommended filename:
```text
SHOT_01_FLOW_REAL.mp4
```

### Step 7: Import Media with Explicit Provenance `[HUMAN ACTION]` `[LOCAL]`
Import the downloaded video file into Studio:
```bash
studio production import <runId> SHOT_01 /path/to/SHOT_01_FLOW_REAL.mp4 --source google-flow --real-external
```
Studio will:
- Verify physical file existence and readable container
- Validate playable video stream via FFprobe
- Compute SHA-256 hash
- Extract dimensions, duration, fps, codecs, and size
- Invalidate any previous approvals or challenges for that shot
- Trigger Multimodal Visual QA

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

### Step 9: Review Status `[HUMAN ACTION]`
Inspect the 11-step production matrix:
```bash
studio production status <runId>
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
Perform operator challenge ceremony to review and approve candidate for shot "SHOT_01".

RECOMMENDED COMMAND:
studio production approve run_pilot_12345 SHOT_01 --human
==============================================================
```

### Step 10: Operator Approval Ceremony `[HUMAN ACTION]`
Run the interactive approval command in an active terminal:
```bash
studio production approve <runId> SHOT_01 --human
```
Studio issues an approval challenge bound to the exact candidate asset ID, media SHA-256, and QA report ID:
```text
--- Candidate Review: Shot "SHOT_01" ---
Shot ID            : SHOT_01
Candidate Asset ID : ASSET_IMPORT_SHOT_01_1720000000
Media SHA-256      : a8b4c2d1e...
QA Report ID       : vis_qa_SHOT_01_1720000000
QA status          : PASS
Provider trust     : LIVE_EXTERNAL
Challenge ID       : chal_e4f8a1...
Challenge Nonce    : 7A3F9B2C4D1E

Type "APPROVE 7A3F9B2C4D1E" to confirm human approval:
```
Type `APPROVE <nonce>` and press Enter. The challenge is consumed (single-use) and recorded as `approvalType: 'HUMAN'`.

### Step 11: Timeline Assembly & Master Render `[SYSTEM]` `[LOCAL]`
Resume the production run:
```bash
studio production resume <runId>
```
Studio will:
1. Assemble the sequence timeline strictly from approved Canon media
2. Mix master audio stems
3. Run Continuity QA
4. Render master MP4 deliverable
5. Compile Preliminary Master Evidence
6. Build Durable Acceptance Bundle
7. Validate Acceptance Manifest Integrity
8. Grant `MASTER_PRODUCTION_VERIFIED`

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
studio production status <runId>
```
Once all gates pass, `MASTER_PRODUCTION_VERIFIED` is achieved!
