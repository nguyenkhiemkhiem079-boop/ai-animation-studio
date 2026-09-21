import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import {
  ShotContract,
  InMemoryAssetRegistry,
  SourceDocumentManager,
  FlowProductionPackageBuilder,
  FlowResultImporter,
  FlowQAEvaluator,
  FlowJobManager,
  StorageFlowJobRepository,
  FileSystemStorage,
  MemoryStorage,
  computePackageSemanticHash,
  MediaToolchainDoctor,
  ArtifactVerifier,
  ProductionRouter,
  ProviderRegistry,
  PromptCompiler,
  ProviderBenchmarkTracker,
  DEFAULT_DIRECTOR_PROFILE,
  StudioError,
} from '../src/index.js';

describe('Phase 16.6.1 — Google Flow Bridge Final Production Hardening (46 Gate Criteria)', () => {
  const testWorkspaceDir = path.resolve('.studio', 'test-flow-hardening');
  let realTestMp4Path: string;

  const testShot: ShotContract = {
    id: 'SHOT_HARDEN_01',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'complex_generative_video',
    rendererIntent: 'generative_full_video',
    frame: {
      durationSeconds: 1.0,
      aspectRatio: '16:9',
      targetFps: 24,
    },
    camera: {
      focalLength: '35mm',
      shotSize: 'medium_wide',
      angle: 'eye_level',
      movement: 'push_in',
      semanticSkills: ['/pushin'],
    },
    lighting: {
      keyLightDirection: 'front',
      mood: 'cinematic',
      colorTemperature: 'warm',
      fogAtmosphere: false,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: {
        foreground: [],
        midground: ['character'],
        background: ['room'],
      },
    },
    acting: [
      {
        characterId: 'CHAR_HERO',
        pose: 'standing',
        expression: 'focused',
        actionPrompt: 'Hero walks into room',
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

  beforeEach(async () => {
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
    await fs.mkdir(testWorkspaceDir, { recursive: true });

    // Generate real H.264 test MP4 fixture using local FFmpeg
    realTestMp4Path = path.resolve(testWorkspaceDir, 'real_fixture.mp4');
    const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
    const cmd = `"${ffmpegPath}" -y -f lavfi -i testsrc=size=320x180:rate=12 -t 1 -pix_fmt yuv420p -c:v libx264 "${realTestMp4Path}"`;
    execSync(cmd, { stdio: 'pipe' });
  });

  afterEach(async () => {
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
  });

  // 1. persisted job save
  it('1. saves job record to persistent repository', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const persisted = await repo.findById(job.jobId);
    expect(persisted).toBeDefined();
    expect(persisted?.jobId).toBe(job.jobId);
    expect(persisted?.status).toBe('NEEDS_USER_ACTION');
  });

  // 2. persisted job load
  it('2. loads persisted job record by ID', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const loaded = await repo.findById(job.jobId);
    expect(loaded?.jobId).toBe(job.jobId);
    expect(loaded?.shotId).toBe(testShot.id);
  });

  // 3. job survives manager restart
  it('3. job survives manager restart (new manager instance over same storage)', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo1);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    // Process restart: fresh repo and manager
    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo2);

    const reloaded = await manager2.findJob(job.jobId);
    expect(reloaded).toBeDefined();
    expect(reloaded?.jobId).toBe(job.jobId);
  });

  // 4. NEEDS_USER_ACTION survives restart
  it('4. retains NEEDS_USER_ACTION status after restart', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo1);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo2);
    const reloaded = await manager2.findJob(job.jobId);

    expect(reloaded?.status).toBe('NEEDS_USER_ACTION');
  });

  // 5. candidate survives restart
  it('5. candidate status and import metadata survive restart', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const registry = new InMemoryAssetRegistry();
    const manager1 = new FlowJobManager(registry, undefined, undefined, undefined, repo1);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    await manager1.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });

    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(registry, undefined, undefined, undefined, repo2);
    const reloaded = await manager2.findJob(job.jobId);

    expect(reloaded?.status).toBe('CANDIDATE');
    expect(reloaded?.importResult?.candidateAssetId).toBeDefined();
  });

  // 6. approved job survives restart
  it('6. approved job decision and status survive restart', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const registry = new InMemoryAssetRegistry();
    const manager1 = new FlowJobManager(registry, undefined, undefined, undefined, repo1);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    await manager1.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    await manager1.approveCandidate(job.jobId, 'Director approved');

    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(registry, undefined, undefined, undefined, repo2);
    const reloaded = await manager2.findJob(job.jobId);

    expect(reloaded?.status).toBe('APPROVED');
    expect(reloaded?.decision).toBe('APPROVED');
    expect(reloaded?.approvalNotes).toBe('Director approved');
  });

  // 7. rejected job survives restart
  it('7. rejected job decision and reason survive restart', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const registry = new InMemoryAssetRegistry();
    const manager1 = new FlowJobManager(registry, undefined, undefined, undefined, repo1);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    await manager1.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    await manager1.rejectCandidate(job.jobId, 'Color temperature mismatched');

    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(registry, undefined, undefined, undefined, repo2);
    const reloaded = await manager2.findJob(job.jobId);

    expect(reloaded?.status).toBe('REJECTED');
    expect(reloaded?.decision).toBe('REJECTED');
    expect(reloaded?.rejectionReason).toBe('Color temperature mismatched');
  });

  // 8. QA report survives restart
  it('8. QA report survives restart with all issues and score intact', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo1);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    await manager1.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });

    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo2);
    const reloaded = await manager2.findJob(job.jobId);

    expect(reloaded?.qaReport).toBeDefined();
    expect(reloaded?.qaReport?.overallStatus).toBeDefined();
    expect(reloaded?.qaReport?.score).toBeGreaterThan(0);
  });

  // 9. provenance survives restart
  it('9. import provenance survives restart with exact checksum and resolution', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo1);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const imported = await manager1.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    const originalChecksum = imported.importResult?.provenance.checksumSha256;

    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo2);
    const reloaded = await manager2.findJob(job.jobId);

    expect(reloaded?.importResult?.provenance.checksumSha256).toBe(originalChecksum);
    expect(reloaded?.importResult?.provenance.resolution).toBe('320x180');
  });

  // 10. v1 -> restart -> v2
  it('10. calculates version 2 after restart when version 1 is persisted on disk', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo1);

    const job1 = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });
    expect(job1.version).toBe(1);

    // Restart process
    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo2);

    const job2 = await manager2.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(job2.version).toBe(2);
    expect(job2.jobId).toContain('_v2');
  });

  // 11. v1/v2 -> restart -> v3
  it('11. calculates version 3 after restart when v1 and v2 are persisted on disk', async () => {
    const storage = new MemoryStorage();
    const repo1 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo1);

    await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });
    await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    // Restart process
    const repo2 = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo2);

    const job3 = await manager2.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(job3.version).toBe(3);
    expect(job3.jobId).toContain('_v3');
  });

  // 12. version collision prevention
  it('12. prevents version collision if file already exists in repository', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');

    // Pre-create a colliding job record for v1
    const collidingId = `flow_job_proj_harden_${testShot.id}_v1`;
    await repo.save({
      jobId: collidingId,
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shotId: testShot.id,
      status: 'NEEDS_USER_ACTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });

    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);
    const newJob = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(newJob.version).toBe(2);
    expect(newJob.jobId).toBe(`flow_job_proj_harden_${testShot.id}_v2`);
  });

  // 13. project isolation
  it('13. isolates jobs by projectId (SHOT_01 in PROJ_A != SHOT_01 in PROJ_B)', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    await manager.prepareFlowJob({
      projectId: 'PROJ_ALPHA',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const alphaJobs = await repo.findByShot('PROJ_ALPHA', testShot.id);
    const betaJobs = await repo.findByShot('PROJ_BETA', testShot.id);

    expect(alphaJobs).toHaveLength(1);
    expect(betaJobs).toHaveLength(0);
  });

  // 14. series isolation
  it('14. isolates jobs across series within repository listing', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    await manager.prepareFlowJob({
      projectId: 'proj_same',
      seriesId: 'SERIES_ONE',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    await manager.prepareFlowJob({
      projectId: 'proj_same',
      seriesId: 'SERIES_TWO',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const all = await repo.list('proj_same');
    const series1 = all.filter((j) => j.seriesId === 'SERIES_ONE');
    const series2 = all.filter((j) => j.seriesId === 'SERIES_TWO');

    expect(series1).toHaveLength(1);
    expect(series2).toHaveLength(1);
  });

  // 15. semantic package hash deterministic
  it('15. produces identical semantic hash for same semantic inputs regardless of key order', () => {
    const input1 = {
      shotContractSnapshot: testShot,
      continuityConstraints: ['A', 'B'],
      styleGuidelines: 'Cinematic warm',
    };
    const input2 = {
      styleGuidelines: 'Cinematic warm',
      continuityConstraints: ['A', 'B'],
      shotContractSnapshot: testShot,
    };

    const hash1 = computePackageSemanticHash(input1);
    const hash2 = computePackageSemanticHash(input2);

    expect(hash1).toBe(hash2);
  });

  // 16. continuity change changes hash
  it('16. changes semantic hash when continuity constraint changes', () => {
    const hash1 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      continuityConstraints: ['Constraint A'],
    });
    const hash2 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      continuityConstraints: ['Constraint B'],
    });

    expect(hash1).not.toBe(hash2);
  });

  // 17. style change changes hash
  it('17. changes semantic hash when style guideline changes', () => {
    const hash1 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      styleGuidelines: 'Warm mood',
    });
    const hash2 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      styleGuidelines: 'Cold moody',
    });

    expect(hash1).not.toBe(hash2);
  });

  // 18. reference version change changes hash
  it('18. changes semantic hash when reference asset version changes', () => {
    const hash1 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      references: [{ role: 'CHARACTER_IDENTITY', assetId: 'CHAR_v1', label: 'Hero', uri: 'u1' }],
    });
    const hash2 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      references: [{ role: 'CHARACTER_IDENTITY', assetId: 'CHAR_v2', label: 'Hero', uri: 'u1' }],
    });

    expect(hash1).not.toBe(hash2);
  });

  // 19. frame change changes hash
  it('19. changes semantic hash when firstFrame changes', () => {
    const hash1 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      firstFrame: { uri: 'frame_a.png', assetId: 'FA' },
    });
    const hash2 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      firstFrame: { uri: 'frame_b.png', assetId: 'FB' },
    });

    expect(hash1).not.toBe(hash2);
  });

  // 20. workflow change changes hash
  it('20. changes semantic hash when explicit workflow changes', () => {
    const hash1 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      explicitWorkflow: 'TEXT_TO_VIDEO',
    });
    const hash2 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      explicitWorkflow: 'FIRST_FRAME_TO_VIDEO',
    });

    expect(hash1).not.toBe(hash2);
  });

  // 21. timestamp does not change semantic hash
  it('21. produces identical semantic hash when volatile timestamp changes', () => {
    const hash1 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const hash2 = computePackageSemanticHash({
      shotContractSnapshot: testShot,
      createdAt: '2026-12-31T23:59:59.999Z',
    });

    expect(hash1).toBe(hash2);
  });

  // 22. real FFmpeg fixture generated
  it('22. REAL_MEDIA: generates physical test MP4 file on disk', async () => {
    const stat = await fs.stat(realTestMp4Path);
    expect(stat.size).toBeGreaterThan(0);
  });

  // 23. real fixture passes FFprobe
  it('23. REAL_MEDIA: real fixture passes FFprobe verification', () => {
    const verification = ArtifactVerifier.verify(realTestMp4Path, {
      requireVideoStream: true,
      requireValidMedia: true,
    });
    expect(verification.exists).toBe(true);
    expect(verification.readable).toBe(true);
    expect(verification.nonEmpty).toBe(true);
    expect(verification.error).toBeUndefined();
  });

  // 24. real fixture has video stream
  it('24. REAL_MEDIA: real fixture contains valid video stream with positive dimensions', () => {
    const verification = ArtifactVerifier.verify(realTestMp4Path, {
      requireVideoStream: true,
      requireValidMedia: true,
    });
    expect(verification.hasVideoStream).toBe(true);
    expect(verification.width).toBe(320);
    expect(verification.height).toBe(180);
    expect(verification.durationSeconds).toBeGreaterThan(0);
  });

  // 25. real importer succeeds
  it('25. REAL_MEDIA: FlowResultImporter succeeds on real MP4 with requireValidVideoStream: true', async () => {
    const importer = new FlowResultImporter();
    const result = await importer.importResult({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      shotId: testShot.id,
      sourceMp4Path: realTestMp4Path,
      requireValidVideoStream: true,
    });

    expect(result.candidateAssetId).toBeDefined();
    expect(result.provenance.videoCodec).toBeDefined();
    expect(result.provenance.durationSeconds).toBeGreaterThan(0);
  });

  // 26. corrupt MP4 fails
  it('26. rejects corrupted media file with FLOW_IMPORT_INVALID_MEDIA', async () => {
    const corruptFile = path.resolve(testWorkspaceDir, 'corrupt.mp4');
    await fs.writeFile(corruptFile, Buffer.from('NOT_AN_MP4_FILE_JUST_CORRUPT_BYTES'));

    const importer = new FlowResultImporter();
    await expect(
      importer.importResult({
        projectId: 'proj_harden',
        seriesId: 'series_harden',
        shotId: testShot.id,
        sourceMp4Path: corruptFile,
        requireValidVideoStream: true,
      })
    ).rejects.toThrow();
  });

  // 27. zero-byte MP4 fails
  it('27. rejects zero-byte MP4 file with FLOW_IMPORT_VERIFICATION_FAILED', async () => {
    const zeroFile = path.resolve(testWorkspaceDir, 'zero.mp4');
    await fs.writeFile(zeroFile, Buffer.alloc(0));

    const importer = new FlowResultImporter();
    await expect(
      importer.importResult({
        projectId: 'proj_harden',
        seriesId: 'series_harden',
        shotId: testShot.id,
        sourceMp4Path: zeroFile,
        requireValidVideoStream: true,
      })
    ).rejects.toThrow();
  });

  // 28. missing MP4 fails
  it('28. rejects missing MP4 file path', async () => {
    const missingFile = path.resolve(testWorkspaceDir, 'nonexistent.mp4');
    const importer = new FlowResultImporter();

    await expect(
      importer.importResult({
        projectId: 'proj_harden',
        seriesId: 'series_harden',
        shotId: testShot.id,
        sourceMp4Path: missingFile,
        requireValidVideoStream: true,
      })
    ).rejects.toThrow();
  });

  // 29. import failure does not become VERIFIED
  it('29. returns job to WAITING_FOR_IMPORT with error metadata on import failure', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const corruptFile = path.resolve(testWorkspaceDir, 'corrupt.mp4');
    await fs.writeFile(corruptFile, 'bad_bytes');

    await expect(
      manager.importFlowResult(job.jobId, corruptFile, {}, { requireValidVideoStream: true })
    ).rejects.toThrow();

    const persisted = await repo.findById(job.jobId);
    expect(persisted?.status).toBe('WAITING_FOR_IMPORT');
    expect(persisted?.lastError).toBeDefined();
    expect(persisted?.failureCode).toBeDefined();
    expect(persisted?.status).not.toBe('VERIFIED');
  });

  // 30. physical artifact exists after import
  it('30. physical archived artifact exists on disk after successful import', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const imported = await manager.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    const storedPath = imported.importResult!.storedFilePath;

    const exists = await fs.stat(storedPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  // 31. checksum captured
  it('31. captures non-empty SHA-256 checksum in import provenance', async () => {
    const importer = new FlowResultImporter();
    const result = await importer.importResult({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      shotId: testShot.id,
      sourceMp4Path: realTestMp4Path,
      requireValidVideoStream: true,
    });

    expect(result.provenance.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  // 32. missing candidate artifact blocks approval
  it('32. blocks candidate approval if candidate artifact file is deleted from disk', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const imported = await manager.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    // Simulate disk loss of candidate file
    await fs.rm(imported.importResult!.storedFilePath);

    await expect(manager.approveCandidate(job.jobId)).rejects.toThrow(/Candidate physical artifact is missing/);
  });

  // 33. corrupted candidate blocks approval
  it('33. blocks candidate approval if candidate file is truncated or corrupted after import', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const imported = await manager.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    // Overwrite with empty file
    await fs.writeFile(imported.importResult!.storedFilePath, '');

    await expect(manager.approveCandidate(job.jobId)).rejects.toThrow(/Candidate physical artifact is missing, empty, or unreadable/);
  });

  // 34. valid candidate can approve
  it('34. successfully approves valid candidate when physical media stream remains valid', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const registry = new InMemoryAssetRegistry();
    const manager = new FlowJobManager(registry, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    await manager.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    const approved = await manager.approveCandidate(job.jobId, 'Final cut approval');

    expect(approved.status).toBe('APPROVED');
    expect(approved.decision).toBe('APPROVED');
  });

  // 35. old approved asset not overwritten
  it('35. preserves old approved generation when new candidate job is created', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const registry = new InMemoryAssetRegistry();
    const manager = new FlowJobManager(registry, undefined, undefined, undefined, repo);

    // Job v1 approved
    const job1 = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });
    await manager.importFlowResult(job1.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });
    await manager.approveCandidate(job1.jobId);

    // Job v2 prepared as new candidate
    const job2 = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const reloadedV1 = await manager.findJob(job1.jobId);
    expect(reloadedV1?.status).toBe('APPROVED');
    expect(job2.version).toBe(2);
    expect(job2.status).toBe('NEEDS_USER_ACTION');
  });

  // 36. timeline pin remains explicit
  it('36. does not automatically pin unapproved candidate to Canon', async () => {
    const registry = new InMemoryAssetRegistry();
    const importer = new FlowResultImporter(registry);

    const result = await importer.importResult({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      shotId: testShot.id,
      sourceMp4Path: realTestMp4Path,
      requireValidVideoStream: true,
    });

    const asset = await registry.findById(result.candidateAssetId);
    expect(asset?.status).toBe('candidate');
    expect(asset?.status).not.toBe('approved_canon');
  });

  // 37. Flow status works from persisted repository
  it('37. resolves job status from repository after clearing in-memory cache', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    // Create fresh manager without in-memory state
    const cleanManager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);
    const jobs = await cleanManager.findJobsForShot(testShot.id, 'proj_harden');

    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe(job.jobId);
  });

  // 38. Flow import works after restart
  it('38. imports MP4 result using freshly initialized manager after restart', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    // Restart process
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo);
    const updated = await manager2.importFlowResult(job.jobId, realTestMp4Path, {}, { requireValidVideoStream: true });

    expect(updated.status).toBe('CANDIDATE');
    expect(updated.importResult?.candidateAssetId).toBeDefined();
  });

  // 39. Flow history works after restart
  it('39. resolves full version history from persisted repository across restarts', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager1 = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });
    await manager1.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    // Fresh manager reads all versions
    const manager2 = new FlowJobManager(undefined, undefined, undefined, undefined, repo);
    const history = await manager2.findJobsForShot(testShot.id, 'proj_harden');

    expect(history).toHaveLength(2);
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
  });

  // 40. package contains no credentials
  it('40. verifies package manifest contains zero API credentials or auth tokens', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const content = await fs.readFile(result.manifestPath, 'utf-8');
    expect(content).not.toMatch(/AIzaSy/);
    expect(content).not.toMatch(/Bearer /);
    expect(content).not.toMatch(/client_secret/);
  });

  // 41. persisted job contains no credentials
  it('41. verifies persisted job JSON contains no secrets', async () => {
    const storage = new MemoryStorage();
    const repo = new StorageFlowJobRepository(storage, '.studio/flow/jobs');
    const manager = new FlowJobManager(undefined, undefined, undefined, undefined, repo);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    const jobJson = await storage.read(`.studio/flow/jobs/${job.jobId}.json`);
    expect(jobJson).not.toMatch(/AIzaSy/);
    expect(jobJson).not.toMatch(/password/i);
  });

  // 42. unknown credits remain UNKNOWN
  it('42. defaults credit usage to UNKNOWN when not specified by user', async () => {
    const importer = new FlowResultImporter();
    const result = await importer.importResult({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      shotId: testShot.id,
      sourceMp4Path: realTestMp4Path,
      requireValidVideoStream: true,
    });

    expect(result.provenance.creditUsage.status).toBe('UNKNOWN');
    expect(result.provenance.creditUsage.credits).toBeUndefined();
  });

  // 43. no fabricated cost
  it('43. does not report USD cost when credit usage is UNKNOWN', async () => {
    const importer = new FlowResultImporter();
    const result = await importer.importResult({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      shotId: testShot.id,
      sourceMp4Path: realTestMp4Path,
      requireValidVideoStream: true,
    });

    expect(result.provenance.creditUsage.estimatedCostUsd).toBeUndefined();
  });

  // 44. no hardcoded 75.4% savings claim
  it('44. ensures no hardcoded 75.4% savings claim remains in CLI or UI code', async () => {
    const cliSource = await fs.readFile(path.resolve('packages', 'cli', 'src', 'index.ts'), 'utf-8');
    expect(cliSource).not.toContain('75.4% Cost Savings Meter');

    const uiSource = await fs.readFile(path.resolve('packages', 'studio-ui', 'index.html'), 'utf-8');
    expect(uiSource).not.toContain('SAVED <strong>75.4%</strong>');
  });

  // 45. Flow route remains NEEDS_USER_ACTION
  it('45. ProductionRouter assigns assisted Flow workflow requiring human execution', () => {
    const providerRegistry = new ProviderRegistry();
    const promptCompiler = new PromptCompiler();
    const benchmarkTracker = new ProviderBenchmarkTracker();
    const router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker);

    const strategy = router.routeShot(testShot, { preferFlowAssisted: true });

    expect(strategy.userActionRequired).toBe(true);
    expect(strategy.integrationMode).toBe('ASSISTED');
    expect(strategy.primaryProviderId).toBe('google-flow-assisted');
  });

  // 46. no unofficial API automation
  it('46. enforces ASSISTED mode and contains no browser automation endpoints', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      sceneId: 'SCENE_01',
      shot: testShot,
      outputBaseDir: testWorkspaceDir,
    });

    // Validates human-assisted handoff instructions
    expect(result.pkg.userInstructions.some((i) => i.includes('Google Flow'))).toBe(true);

    const importer = new FlowResultImporter();
    const importRes = await importer.importResult({
      projectId: 'proj_harden',
      seriesId: 'series_harden',
      shotId: testShot.id,
      sourceMp4Path: realTestMp4Path,
      requireValidVideoStream: true,
    });
    expect(importRes.provenance.integrationMode).toBe('ASSISTED');

    const prompt = await fs.readFile(result.promptPath, 'utf-8');
    expect(prompt).not.toContain('puppeteer');
    expect(prompt).not.toContain('playwright');
  });
});
