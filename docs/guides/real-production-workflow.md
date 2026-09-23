# Real Production Workflow Guide

## Overview

This guide walks through executing a real animation production run with AI Animation Studio using Phase 18 architecture. It covers run creation, deterministic rendering, Google Flow assisted human handoff, media import, visual QA review, human approval gates, and final master delivery.

---

## 1. Creating a Production Run

To initiate a production run from a source script:

```bash
studio production create story.txt --project proj_my_film --series series_season_1
```

This validates the environment, creates `.studio/production/proj_my_film/<runId>/production-run.json`, and records the initial state as `CREATED`.

To begin execution:

```bash
studio production run <runId>
```

---

## 2. Inspecting Production Status & Evidence

At any point, inspect the current stage, completed shots, and next required actions:

```bash
studio production status <runId>
```

Output format:
```
============================================================
🎬 PRODUCTION RUN STATUS
============================================================
Run ID          : run_1790133023847
Project ID      : proj_my_film
Status          : NEEDS_USER_ACTION
Current Stage   : generating_shot (SHOT_SCENE_01_SH02)
Completed Shots : SHOT_SCENE_01_SH01
Pending Shots   : SHOT_SCENE_01_SH03
Blocked Shots   : SHOT_SCENE_01_SH02

NEXT ACTION     : Generate clip in Google Flow using package at "...", then import MP4.
RESUME COMMAND  : studio production import run_1790133023847 SHOT_SCENE_01_SH02 <path_to_downloaded_mp4>
============================================================
```

To audit durable evidence files:

```bash
studio production evidence <runId>
```

---

## 3. Google Flow Assisted Handoff & Media Import

When the production router selects Google Flow for complex generative shots, the studio automatically:
1. Compiles the prompt, canonical turnaround references, and framing locks into `.studio/flow/<projectId>/<shotId>/`.
2. Sets run status to `NEEDS_USER_ACTION`.
3. Stops safely without attempting private API automation or session scraping.

### Step-by-Step User Action:
1. Open Google Flow and create a video using the compiled package references.
2. Download the rendered MP4 file to your local computer (e.g. `C:\Downloads\shot_02.mp4`).
3. Import the downloaded video into the studio run:
   ```bash
   studio production import <runId> SHOT_SCENE_01_SH02 C:\Downloads\shot_02.mp4
   ```
4. The studio verifies the physical video file, extracts SHA-256 and FFprobe metadata, runs Visual Semantic QA, and moves the shot to `APPROVAL_REQUIRED`.

---

## 4. Director Human Approval Gate

Candidates **never** become timeline canon automatically. Even if Visual QA passes with 100%, human sign-off is required:

### To Approve:
```bash
studio production approve <runId> SHOT_SCENE_01_SH02 --reviewer "Lead Director" --notes "Cinematography approved"
```
The candidate asset is promoted to Canon (`CANON_SHOT_SCENE_01_SH02`).

### To Reject (Triggering Retake):
```bash
studio production reject <runId> SHOT_SCENE_01_SH02 --reason "Screen direction inverted; camera must pan right"
```

---

## 5. Resuming Execution & Final Master Delivery

Once a shot is approved or provider quota is restored:

```bash
studio production resume <runId>
```

The pipeline automatically:
1. Resumes from the blocked stage.
2. Skips already completed and approved shots.
3. Once all shots are approved, assembles the multi-track timeline (Video V1, Stems A1-A3).
4. Evaluates continuity QA and renders the master deliverable.
5. Audits the final master against the **13-Point Production Gate**.
6. Emits `MASTER_PRODUCTION_VERIFIED`.

To independently audit the final deliverable at any time:

```bash
studio production verify <runId>
```
