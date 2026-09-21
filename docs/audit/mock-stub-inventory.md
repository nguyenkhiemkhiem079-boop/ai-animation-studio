# Phase 16 — Mock & Stub Inventory

This inventory catalogs all occurrences of mocks, stubs, simulated latencies, fake media URIs, and canned health checks across the codebase.

---

## 1. Fake Media URIs & Simulated Paths

| File | Line | Fake Pattern / URI Emitted | Problem |
| :--- | :--- | :--- | :--- |
| `packages/core/src/export/video-renderer.ts` | 20, 26, 33 | `uri: ${outputDir}/${filename}` (e.g. `seq_..._master.mp4`)<br>`sizeBytes: sequence.totalDuration * 2_500_000` | Simulates file existence and byte size without running FFmpeg or creating the file. |
| `packages/core/src/video-providers/mock-video-provider.ts` | 82, 84 | `videoUri: .studio/videos/${projectId}/${shotId}_gen.mp4`<br>`terminalFrameUri: .studio/videos/${projectId}/${shotId}_terminal.png` | Canned URI path returned without creating file. |
| `packages/core/src/video-providers/veo-adapter.ts` | 123, 124 | `videoUri: .studio/videos/${projectId}/${shotId}_veo.mp4`<br>`terminalFrameUri: .studio/videos/${projectId}/${shotId}_veo_terminal.png` | Fallback simulated URI if no external executor provided. |
| `packages/core/src/video-providers/seedance-adapter.ts` | 104, 105 | `videoUri: .studio/videos/${projectId}/${shotId}_seedance.mp4`<br>`terminalFrameUri: .studio/videos/${projectId}/${shotId}_seedance_terminal.png` | Fallback simulated URI if no external executor provided. |
| `packages/core/src/video-providers/comfyui-adapter.ts` | 118, 119 | `videoUri: .studio/videos/${projectId}/${shotId}_comfy.mp4`<br>`terminalFrameUri: .studio/videos/${projectId}/${shotId}_comfy_terminal.png` | Fallback simulated URI if no ComfyUI client provided. |
| `packages/core/src/audio/mock-audio-provider.ts` | 64, 82, 100 | `audioUri: .studio/audio/dialogue/${shotId}_${charId}.wav`<br>`audioUri: .studio/audio/music/${sceneId}_score.mp3`<br>`audioUri: .studio/audio/sfx/${shotId}_${cueName}.wav` | Canned audio paths without writing audio bytes. |
| `packages/core/src/audio/elevenlabs-adapter.ts` | 83 | `audioUri: .studio/audio/dialogue/${task.shotId}_${voiceId}.wav` | Fallback simulated audio path when executor is missing. |
| `packages/core/src/audio/musicgen-adapter.ts` | 78 | `audioUri: .studio/audio/music/${sceneId}_theme.mp3` | Fallback simulated music path when executor is missing. |
| `packages/core/src/audio/foley-adapter.ts` | 74 | `audioUri: .studio/audio/sfx/${shotId}_${cueName}.wav` | Fallback simulated SFX path when executor is missing. |
| `packages/core/src/character/character-asset-factory.ts` | 42, 76, 110, 144 | `storageUri: assets/characters/${character.id}/turnaround_${view}.png`<br>`sizeBytes: 1024 * 1024` | Registers asset metadata in registry with fake size, without generating an image file. |
| `packages/core/src/world/world-studio.ts` | 137 | `storageUri: .studio/assets/backdrops/...`<br>`sizeBytes: 2048 * 1024` | Registers backdrop metadata without creating image. |

---

## 2. Canned Health Checks (`return true`)

The following providers implement `healthCheck()` by unconditionally returning `true` without verifying credentials, connectivity, or tool availability:

1. `packages/core/src/hyperframes/hyperframes-adapter.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true;
   }
   ```
   *Should verify:* Headless browser availability and local composition compiler readiness.

2. `packages/core/src/video-providers/mock-video-provider.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true;
   }
   ```
   *Should report:* `TEST_ONLY`.

3. `packages/core/src/video-providers/veo-adapter.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true; // does not check apiKey or endpoint
   }
   ```
   *Should report:* `NOT_CONFIGURED` if `apiKey` is absent, or ping endpoint if present.

4. `packages/core/src/video-providers/seedance-adapter.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true;
   }
   ```
   *Should report:* `NOT_CONFIGURED` if credentials absent.

5. `packages/core/src/video-providers/comfyui-adapter.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true;
   }
   ```
   *Should report:* Actually ping ComfyUI server at `http://127.0.0.1:8188/system_stats`.

6. `packages/core/src/audio/elevenlabs-adapter.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true;
   }
   ```
   *Should report:* `NOT_CONFIGURED` if `apiKey` absent.

7. `packages/core/src/audio/musicgen-adapter.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true;
   }
   ```

8. `packages/core/src/audio/foley-adapter.ts`:
   ```ts
   public async healthCheck(): Promise<boolean> {
     return true;
   }
   ```

---

## 3. Disconnected / Synthetic Fallbacks

1. **`packages/core/src/production/job-orchestrator.ts` (lines 102-113)**:
   ```ts
   if (!this.providerRegistry.has(providerId)) {
     const isLocal = providerId.includes('local');
     if (isLocal) {
       return {
         ...
         status: 'completed',
         outputAssetId: `ASSET_LOCAL_ANIM_${job.shotId}`,
         actualCostUsd: 0.0,
         durationMs: 15,
       };
     }
     return undefined;
   }
   ```
   *Issue:* Silently returns success without running any provider if `providerId` contains `'local'`.

2. **`packages/core/src/production/render-cache.ts`**:
   Checks in-memory map without checking if the cached output file actually exists on disk. If a user deletes `.studio/videos/...`, the cache would falsely return a hit for a missing file.

---

## 4. Policy for Mock Elimination in Phase 16

1. **Mocks are preserved for unit tests & CI**, but MUST be isolated under `executionMode === 'MOCK'`.
2. In `executionMode === 'PRODUCTION'`, selecting a mock provider will immediately throw `ProductionSafetyError`.
3. In `executionMode === 'LOCAL'`, all produced media files (HyperFrames shot video, tone audio stems, master audio mix, master video) MUST be verified physically on disk using `fs.existsSync`, `sizeBytes > 0`, and `ffprobe`.
4. Fallback from a failed production provider to a mock provider is STRICTLY PROHIBITED.
