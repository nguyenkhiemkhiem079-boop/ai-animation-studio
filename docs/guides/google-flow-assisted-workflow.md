# Google Flow Assisted Workflow Guide

This guide walks human animation creators through using Google Flow in `ASSISTED` mode with AI Animation Studio.

---

## The Philosophy: Assisted Creative Handoff

Google Flow provides powerful generative video rendering capabilities, but cannot serve as the canonical universe repository, story analyzer, or continuity authority. AI Animation Studio bridges the gap:

1. **Studio Plans & Packages**: Studio creates a complete, self-contained production package with semantic role-bound references and Flow-optimized prompts.
2. **Creator Renders Externally**: You open the Google Flow web workspace, upload the packaged references, paste the prompt, and generate the clip.
3. **Studio Verifies & Enrolls**: You import the downloaded MP4. Studio runs `ArtifactVerifier`, `FFprobe`, and Continuity QA, enrolling the clip as an unapproved candidate.
4. **Director Approves**: You review the candidate and approve it to pin it to the canonical production timeline.

---

## Step-by-Step Workflow

### Step 1: Check Flow Bridge Health

```bash
npm run studio -- flow doctor
```

Expected output:
- `Integration Mode: ASSISTED`
- `Official Automation API: NOT CONFIGURED / UNSUPPORTED`
- `Package Builder: AVAILABLE`
- `FFprobe: AVAILABLE ✅`

### Step 2: Prepare a Production Package for a Shot

```bash
npm run studio -- flow prepare SHOT_SC01_SH01 <projectId> <seriesId>
```

This creates a dedicated package directory:
```
.studio/flow/<projectId>/<shotId>/
├── flow-package.json     # Full machine manifest & reference bindings
├── prompt.txt            # Ready-to-paste Flow production prompt
├── README.txt            # 14-step human creation instructions
├── references/           # Approved character turnarounds, location plates, props
├── frames/               # Initial/closing keyframes if applicable
└── metadata/             # ShotContract snapshot & continuity constraints
```

Status is set to `NEEDS_USER_ACTION`.

### Step 3: Human Generation in Google Flow

1. Open **Google Flow** in your browser: [https://labs.google/flow](https://labs.google/flow)
2. Create or open the project.
3. Choose the **recommended workflow** indicated in `flow-package.json` (e.g., `INGREDIENTS_TO_VIDEO`, `FIRST_LAST_FRAME_TO_VIDEO`, etc.).
4. Upload references from `.studio/flow/<projectId>/<shotId>/references/`.
5. Assign each image its designated semantic role (`CHARACTER_IDENTITY`, `LOCATION`, `PROP`).
6. Copy the text from `prompt.txt` into the Flow prompt box.
7. Verify target duration and aspect ratio match the package specifications.
8. Click **Generate**.
9. Once satisfied, download the resulting **MP4** file.

### Step 4: Import Video into Studio

```bash
npm run studio -- flow import SHOT_SC01_SH01 "C:/path/to/downloaded-shot.mp4" <projectId>
```

What the Studio does during import:
- Confirms physical file existence and non-zero size.
- Runs `ArtifactVerifier` + `FFprobe` to inspect video stream codec, resolution, and duration.
- Calculates SHA-256 cryptographic checksum.
- Archives video into `.studio/assets/flow/<projectId>/<shotId>/<shotId>_FLOW_v1.mp4`.
- Produces immutable provenance with credit accounting.
- Registers video as `CANDIDATE` in `AssetRegistry`.
- Executes automated Continuity QA.

### Step 5: Audit QA & Approve into Canon

Check QA status:
```bash
npm run studio -- flow qa SHOT_SC01_SH01 <projectId>
```

To approve the candidate and pin it to the master production timeline:
```bash
npm run studio -- flow approve SHOT_SC01_SH01 <projectId>
```

To reject a flawed generation while preserving audit history:
```bash
npm run studio -- flow reject SHOT_SC01_SH01 "Identity drift in eye color" <projectId>
```

To view version history:
```bash
npm run studio -- flow history SHOT_SC01_SH01 <projectId>
```
