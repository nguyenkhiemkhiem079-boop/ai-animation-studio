# Production Pipeline Artifact Flow & Step Contracts

This document defines the strict, non-negotiable input/output artifact contract for all 11 steps of the AI Animation Studio master DAG pipeline.

```
SourceDocument (.txt / JSON)
       │
       ▼
 [1. Story Intelligence] ───► source_doc.json, story_analysis.json
       │
       ▼
 [2. Shot Planning]      ───► production_scenes.json, dependency_graphs.json
       │
       ▼
 [3. Character Assets]   ───► character_turnarounds/ (PNG), character_packets.json
       │
       ▼
 [4. World Environment]  ───► backdrops/ (PNG), scene_maps.json, env_packets.json
       │
       ▼
 [5. Production Routing] ───► production_plan.json, budget_status.json
       │
       ▼
 [6. HyperFrames Anim]   ───► compositions/ (HTML), frames/ (PNG sequence), renders/ (MP4)
       │
       ▼
 [7. Generative Video]   ───► renders/ (MP4), terminal_frames/ (PNG), continuation.json
       │
       ▼
 [8. Audio Production]   ───► audio/dialogue/ (WAV), audio/music/ (WAV), audio/sfx/ (WAV), master-audio.wav
       │
       ▼
 [9. Timeline Assembly]  ───► timeline_sequence.json, subtitles.srt, subtitles.vtt
       │
       ▼
 [10. Continuity QA]     ───► continuity_report.json, auto_repaired_sequence.json
       │
       ▼
 [11. Master Export]     ───► master.mp4, master_player.html, timeline.otio, timeline.edl
```

---

## Detailed Step Contracts

### Step 1: Story Intelligence (`story_intelligence`)
- **Inputs**: `rawScript` or `sourceText` string, `scriptTitle`, `seriesId`.
- **Outputs**: `sourceDocument`, `storyAnalysis`, `sceneCount`, `characterCandidateCount`.
- **Physical Artifacts**:
  - `.studio/projects/<projectId>/source_doc.json`
  - `.studio/projects/<projectId>/story_analysis.json`
- **Side Effects**: Reads or creates `Universe` in `storage`.
- **Failure Modes**: Missing/empty text, schema validation error in extracted beats.
- **Retry Policy**: 0 retries (deterministic).

### Step 2: Scene & Shot Planning (`shot_planning`)
- **Inputs**: `storyAnalysis`, optional `directorProfile`.
- **Outputs**: `productionScenes`, `dependencyGraphs`, `directorQAReports`, `totalPlannedShots`.
- **Physical Artifacts**:
  - `.studio/projects/<projectId>/production_scenes.json`
  - `.studio/projects/<projectId>/dependency_graphs.json`
- **Failure Modes**: Empty scene list, circular shot dependencies.
- **Retry Policy**: 0 retries (deterministic).

### Step 3: Character & Asset Resolution (`character_asset_resolution`)
- **Inputs**: `productionScenes`, `seriesId`.
- **Outputs**: `characterReferencePackets`, `characterResolutionSummary`.
- **Physical Artifacts**:
  - `.studio/assets/characters/<charId>/turnaround_<view>.png` (in LOCAL/PROD mode).
  - Registers `AssetDescriptor` with `artifactState === 'VERIFIED'`.
- **Failure Modes**: Missing character DNA, failed identity QA threshold.
- **Retry Policy**: 1 retry with regenerated seed.

### Step 4: World & Environment Resolution (`world_environment_resolution`)
- **Inputs**: `productionScenes`, `seriesId`.
- **Outputs**: `environmentReferencePackets`, `worldResolutionSummary`.
- **Physical Artifacts**:
  - `.studio/assets/environments/<locId>_<zoneId>_bg.png`
  - `.studio/projects/<projectId>/scene_maps.json`
- **Failure Modes**: Spatial anchor collision, layer depth inversion.
- **Retry Policy**: 0 retries.

### Step 5: Production Planning & Routing (`production_planning_router`)
- **Inputs**: `productionScenes`, budget configuration.
- **Outputs**: `productionPlan`, `budgetStatus`, `productionStepSummary`.
- **Physical Artifacts**:
  - `.studio/production/<projectId>_plan.json`
- **Failure Modes**: Budget exceeded with strict cap.
- **Retry Policy**: 0 retries.

### Step 6: Deterministic HyperFrames Execution (`hyperframes_deterministic_execution`)
- **Inputs**: `productionScenes`, `productionPlan`, `environmentReferencePackets`.
- **Outputs**: `renderedHyperFramesCompositions`, `hyperFramesExecutionSummary`.
- **Physical Artifacts**:
  - `.studio/compositions/<compositionId>.html`
  - `.studio/frames/<shotId>/frame_%04d.png` (captured via headless browser)
  - `.studio/renders/<shotId>.mp4` (encoded via FFmpeg)
- **Failure Modes**: Browser crash, timeout during frame capture, FFmpeg encode failure.
- **Retry Policy**: 1 retry.

### Step 7: Generative Video Production (`generative_video_step`)
- **Inputs**: `productionScenes`, `productionPlan`.
- **Outputs**: `generativeVideoOutputs`, `continuationPackets`, `generativeVideoStepSummary`.
- **Physical Artifacts**:
  - `.studio/videos/<projectId>/<shotId>_gen.mp4`
  - `.studio/videos/<projectId>/<shotId>_terminal.png`
- **Failure Modes**: Provider rate limit, timeout, safety filter trigger.
- **Retry Policy**: 2 retries, fallback provider.

### Step 8: Audio Production & Mix (`audio_production_step`)
- **Inputs**: `productionScenes`, voice profiles.
- **Outputs**: `audioMixContract`, `dialogueLines`, `musicTracks`, `sfxCues`, `actorVisemeMap`.
- **Physical Artifacts**:
  - `.studio/audio/dialogue/<shotId>_<charId>.wav`
  - `.studio/audio/music/<sceneId>_theme.wav`
  - `.studio/audio/sfx/<shotId>_<sfx>.wav`
  - `.studio/audio/<projectId>/master-audio.wav` (mixed with ducking via FFmpeg)
- **Failure Modes**: Missing audio toolchain, audio clipping/corruption.
- **Retry Policy**: 1 retry.

### Step 9: Timeline Assembly (`timeline_editing_step`)
- **Inputs**: `productionScenes`, video outputs, `audioMixContract`.
- **Outputs**: `timelineSequence`, `srtContent`, `vttContent`.
- **Physical Artifacts**:
  - `.studio/timelines/<sequenceId>.json`
  - `.studio/subtitles/<sequenceId>.srt`
  - `.studio/subtitles/<sequenceId>.vtt`
- **Failure Modes**: Video/audio track duration mismatch > 2.0s.
- **Retry Policy**: 0 retries.

### Step 10: Continuity QA & Auto-Repair (`continuity_qa_step`)
- **Inputs**: `timelineSequence`, `shotContracts`.
- **Outputs**: `report`, `summary`, updated `timelineSequence`.
- **Physical Artifacts**:
  - `.studio/qa/<reportId>.json`
  - `.studio/timelines/<sequenceId>_repaired.json`
- **Failure Modes**: Critical unrepairable continuity defect.
- **Retry Policy**: 0 retries.

### Step 11: Master Export & Packaging (`master_export_step`)
- **Inputs**: `timelineSequence`.
- **Outputs**: `manifest`, `summary`.
- **Physical Artifacts**:
  - `.studio/exports/<projectId>/master.mp4` (verified via FFprobe: H.264, AAC, yuv420p)
  - `.studio/exports/<projectId>/master_player.html`
  - `.studio/exports/<projectId>.otio`
  - `.studio/exports/<projectId>.edl`
  - `.studio/exports/<projectId>_render_manifest.json`
- **Failure Modes**: FFmpeg render crash, FFprobe verification failure.
- **Retry Policy**: 1 retry.
