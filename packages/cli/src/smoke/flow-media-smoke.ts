/**
 * Google Flow Real Media Production Smoke Test
 * Tests the Studio-side Flow import, FFprobe verification, QA, and persistence
 * using a real locally generated MP4 video fixture.
 *
 * PIPELINE:
 * FFmpeg -> real MP4 -> FlowResultImporter -> FFprobe -> ArtifactVerifier
 *   -> candidate -> QA -> persistence -> restart reload -> approval
 *
 * NOTE: Google Flow is not called directly (Assisted Mode). This validates
 * the complete Studio media ingestion and artifact verification contract.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import {
  ShotContract,
  FlowJobManager,
  StorageFlowJobRepository,
  FileSystemStorage,
  FileSystemAssetRegistry,
  MediaToolchainDoctor,
  ArtifactVerifier,
} from '@ai-studio/core';

export async function runFlowMediaSmoke(): Promise<void> {
  console.log('🎬 Running Google Flow Real Media Import Smoke Test...');

  const baseDir = path.resolve('.studio', 'smoke', 'flow-media');
  await fs.rm(baseDir, { recursive: true, force: true });
  await fs.mkdir(baseDir, { recursive: true });

  // 1. Verify FFmpeg availability
  const diag = MediaToolchainDoctor.diagnose();
  if (!diag.ffmpeg.available || !diag.ffprobe.available) {
    throw new Error('Flow media smoke requires local FFmpeg and FFprobe toolchain.');
  }

  const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
  const testMp4Path = path.resolve(baseDir, 'flow_test_generated.mp4');

  // 2. Generate deterministic real MP4 fixture: 320x180, 12fps, 1 second, H.264, yuv420p
  console.log(`- Generating real H.264 test MP4 fixture at: ${testMp4Path}...`);
  const ffmpegCmd = `"${ffmpegPath}" -y -f lavfi -i testsrc=size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${testMp4Path}"`;
  execSync(ffmpegCmd, { stdio: 'pipe' });

  // 3. Verify generated test MP4 via FFprobe
  const initialVerify = ArtifactVerifier.verify(testMp4Path, {
    requireVideoStream: true,
    requireValidMedia: true,
  });

  if (!initialVerify.exists || !initialVerify.hasVideoStream) {
    throw new Error(`Failed to generate valid test MP4: ${initialVerify.error || 'No video stream'}`);
  }
  console.log(`- Real MP4 Fixture Verified: ${initialVerify.width}x${initialVerify.height}, duration=${initialVerify.durationSeconds}s, codec=${initialVerify.videoCodec}`);

  // 4. Initialize storage and persistent FlowJobManager
  const storage = new FileSystemStorage('.');
  const smokeJobsPath = path.join(baseDir, 'jobs');
  const smokeManifestPath = path.join(baseDir, 'asset_manifest.json');
  const repo = new StorageFlowJobRepository(storage, smokeJobsPath);
  const assetRegistry = new FileSystemAssetRegistry(storage, smokeManifestPath);
  const manager = new FlowJobManager(assetRegistry, undefined, undefined, undefined, repo);

  const testShot: ShotContract = {
    id: 'SHOT_FLOW_MEDIA_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'action',
    complexity: 'complex_generative_video',
    rendererIntent: 'generative_full_video',
    frame: {
      durationSeconds: 1.0,
      aspectRatio: '16:9',
      targetFps: 24,
    },
    camera: {
      focalLength: '35mm',
      shotSize: 'medium',
      angle: 'eye_level',
      movement: 'static',
      semanticSkills: [],
    },
    lighting: {
      keyLightDirection: 'front',
      mood: 'cinematic',
      colorTemperature: 'neutral',
      fogAtmosphere: false,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: { foreground: [], midground: ['subject'], background: [] },
    },
    acting: [
      {
        characterId: 'CHAR_ACTOR',
        pose: 'standing',
        expression: 'neutral',
        gazeDirection: 'screen_left',
        actionPrompt: 'Actor walks across frame',
      },
    ],
    transition: { type: 'cut', durationSeconds: 0 },
    audioCue: { sfx: [] },
    requiredAssetIds: [],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: false,
      isFramingLocked: false,
      isRendererLocked: false,
      isActingLocked: false,
    },
    provenance: {
      sourceBeatId: 'BEAT_01',
      directorProfileId: 'DEFAULT_CINEMATIC',
      decidedAt: new Date().toISOString(),
    },
  };

  // 5. Prepare job
  const job = await manager.prepareFlowJob({
    projectId: 'proj_smoke_media',
    seriesId: 'series_smoke_media',
    sceneId: 'SCENE_01',
    shot: testShot,
    outputBaseDir: baseDir,
  });

  console.log(`- Flow Job Prepared: ${job.jobId} (v${job.version}) | Status: ${job.status}`);

  // 6. Import real media with strict requireValidVideoStream = true
  const importedJob = await manager.importFlowResult(
    job.jobId,
    testMp4Path,
    {
      modelUsed: 'Veo-2-Assisted',
      userReportedCredits: 10,
      notes: 'Local FFmpeg verification harness',
    },
    { requireValidVideoStream: true }
  );

  console.log(`- Import Completed: Candidate Asset ID=${importedJob.importResult?.candidateAssetId}`);
  console.log(`- Status after Import & QA: ${importedJob.status} (QA Score: ${importedJob.qaReport?.score}%)`);

  if (importedJob.status !== 'CANDIDATE') {
    throw new Error(`Expected CANDIDATE status, got "${importedJob.status}"`);
  }

  // 7. Approve candidate (verifies physical artifact re-check)
  const approvedJob = await manager.approveCandidate(job.jobId, 'Approved via Media Smoke Harness');
  console.log(`- Candidate Approved: Status=${approvedJob.status}, Decision=${approvedJob.decision}`);

  // 8. Process Restart Recovery: Instantiate a NEW manager and repository
  const freshRepo = new StorageFlowJobRepository(storage, smokeJobsPath);
  const restartManager = new FlowJobManager(assetRegistry, undefined, undefined, undefined, freshRepo);
  const reloadedJob = await restartManager.findJob(job.jobId);

  if (!reloadedJob) {
    throw new Error(`Failed to reload approved job "${job.jobId}" from disk.`);
  }

  if (reloadedJob.status !== 'APPROVED') {
    throw new Error(`Expected APPROVED status after restart, got "${reloadedJob.status}".`);
  }

  if (!reloadedJob.importResult?.storedFilePath) {
    throw new Error('Reloaded job missing stored file path.');
  }

  console.log('✅ Google Flow Real Media Acceptance Smoke Succeeded!');
  console.log('- Pipeline: FFmpeg -> Real MP4 -> Importer -> FFprobe -> Candidate -> QA -> Approval -> Restart Recovery');
  console.log('- Media Verification: REAL MEDIA VERIFIED ✅');
}
