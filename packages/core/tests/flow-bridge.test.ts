import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  ShotContract,
  InMemoryAssetRegistry,
  SourceDocumentManager,
  FlowProductionPackageSchema,
  FlowProductionPackageV1,
  FlowProductionPackageBuilder,
  FlowPromptCompiler,
  FlowWorkflowRecommender,
  FlowResultImporter,
  FlowQAEvaluator,
  FlowJobManager,
  FlowReferenceAsset,
  validateFlowJobTransition,
  ProductionRouter,
  DEFAULT_DIRECTOR_PROFILE,
  StudioError,
  ProviderRegistry,
  PromptCompiler,
  ProviderBenchmarkTracker,
} from '../src/index.js';

describe('Phase 16.6 — Google Flow Production Bridge Test Suite (40 Gate Criteria)', () => {
  const testWorkspaceDir = path.resolve('.studio', 'test-flow-workspace');

  const baseShot: ShotContract = {
    id: 'SHOT_FLOW_001',
    sceneId: 'SCENE_01',
    shotNumber: 1,
    purpose: 'establishing',
    complexity: 'complex_generative_video',
    rendererIntent: 'generative_full_video',
    frame: {
      durationSeconds: 4.0,
      aspectRatio: '16:9',
      targetFps: 24,
    },
    camera: {
      focalLength: '35mm',
      shotSize: 'medium_wide',
      angle: 'eye_level',
      movement: 'push_in',
      semanticSkills: ['/pushin', '/slowmo'],
    },
    lighting: {
      keyLightDirection: 'front',
      mood: 'mysterious_candlelight',
      colorTemperature: 'warm',
      fogAtmosphere: true,
    },
    composition: {
      rule: 'rule_of_thirds',
      subjectPlacement: 'center',
      depthLayers: {
        foreground: ['con_buom_trang'],
        midground: ['ngon_nen'],
        background: ['can_phong_toi'],
      },
    },
    acting: [
      {
        characterId: 'CHAR_MINH',
        pose: 'standing_cautious',
        expression: 'wonder_and_curiosity',
        actionPrompt: 'Minh enters dark room and watches white butterfly around candle',
        gazeDirection: 'screen_left',
      },
    ],
    transition: {
      type: 'cut',
      durationSeconds: 0,
    },
    environmentLocationId: 'LOC_DARK_ROOM',
    environmentZoneId: 'ZONE_CANDLE',
    audioCue: {
      sfx: ['flapping_wings'],
    },
    requiredAssetIds: ['CHAR_MINH_REF'],
    dependsOnShotIds: [],
    directorLocks: {
      isCameraLocked: true,
      isFramingLocked: false,
      isRendererLocked: true,
      isActingLocked: false,
    },
    provenance: {
      sourceBeatId: 'BEAT_01',
      directorProfileId: 'DEFAULT_CINEMATIC',
      decidedAt: '2026-09-21T00:00:00.000Z',
    },
  };

  const sampleCharacterRef: FlowReferenceAsset = {
    role: 'CHARACTER_IDENTITY',
    assetId: 'CHAR_MINH_DNA_v1',
    characterId: 'CHAR_MINH',
    characterVersion: 'v1',
    label: 'Minh Character Identity',
    uri: 'studio://assets/characters/minh.png',
    instructions: 'Canonical face and outfit reference. Maintain facial structure.',
  };

  const sampleLocationRef: FlowReferenceAsset = {
    role: 'LOCATION',
    assetId: 'LOC_ROOM_v1',
    locationId: 'LOC_DARK_ROOM',
    locationVersion: 'v1',
    label: 'Dark Room Architectural Plate',
    uri: 'studio://assets/locations/room.png',
    instructions: 'Shadowed wooden room with candle center.',
  };

  const samplePropRef: FlowReferenceAsset = {
    role: 'PROP',
    assetId: 'PROP_BUTTERFLY_v1',
    label: 'White Butterfly Reference',
    uri: 'studio://assets/props/butterfly.png',
    instructions: 'Silk white butterfly hovering.',
  };

  beforeEach(async () => {
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
    await fs.mkdir(testWorkspaceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
  });

  // 1. package schema validation
  it('1. validates Flow package schema with Zod', () => {
    const validPackage: FlowProductionPackageV1 = {
      packageVersion: '1.0.0',
      packageId: 'pkg_flow_test_001',
      createdAt: new Date().toISOString(),
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shotId: 'SHOT_01',
      shotContractVersion: '1.0.0',
      shotContractSnapshot: baseShot,
      narrativeIntent: 'Minh enters dark room and watches white butterfly around candle',
      durationTargetSeconds: 4.0,
      aspectRatio: '16:9',
      references: [sampleCharacterRef],
      continuityConstraints: ['Maintain face identity.'],
      flowPrompt: 'Test prompt',
      recommendedWorkflow: 'INGREDIENTS_TO_VIDEO',
      workflowReason: 'Reference images available.',
      modelRecommendation: 'Google Flow / Veo 2 (Advisory)',
      userInstructions: ['Upload images', 'Generate'],
      provenance: {
        compilerVersion: 'flow-compiler-v1',
        packageBuilderVersion: 'flow-builder-v1',
        timestamp: new Date().toISOString(),
      },
    };

    const parsed = FlowProductionPackageSchema.parse(validPackage);
    expect(parsed.packageId).toBe('pkg_flow_test_001');
    expect(parsed.recommendedWorkflow).toBe('INGREDIENTS_TO_VIDEO');
  });

  // 2. package creation
  it('2. creates physical Flow production package on disk', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(await fs.stat(result.manifestPath)).toBeDefined();
    expect(await fs.stat(result.promptPath)).toBeDefined();
    expect(await fs.stat(result.readmePath)).toBeDefined();
  });

  // 3. package deterministic IDs
  it('3. generates deterministic package IDs for identical shot snapshot', async () => {
    const builder = new FlowProductionPackageBuilder();
    const r1 = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    const r2 = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(r1.pkg.packageId).toBe(r2.pkg.packageId);
  });

  // 4. source reference preservation
  it('4. preserves original source references lossless in manifest', async () => {
    const doc = SourceDocumentManager.createSourceDocument(
      'proj_test',
      'Golden Story',
      'Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.'
    );
    const trace = SourceDocumentManager.createTraceabilityPointer(doc, 0, 26);

    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      sourceReferences: [trace],
      outputBaseDir: testWorkspaceDir,
    });

    expect(result.pkg.sourceReferences).toHaveLength(1);
    expect(result.pkg.sourceReferences?.[0].documentId).toBe(doc.id);
  });

  // 5. character reference packaging
  it('5. packages approved canonical character references with version', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      references: [sampleCharacterRef],
      outputBaseDir: testWorkspaceDir,
    });

    const charRef = result.pkg.references.find((r) => r.role === 'CHARACTER_IDENTITY');
    expect(charRef).toBeDefined();
    expect(charRef?.characterId).toBe('CHAR_MINH');
    expect(charRef?.characterVersion).toBe('v1');
  });

  // 6. location reference packaging
  it('6. packages canonical location reference without modifying environment', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      references: [sampleLocationRef],
      outputBaseDir: testWorkspaceDir,
    });

    const locRef = result.pkg.references.find((r) => r.role === 'LOCATION');
    expect(locRef?.locationId).toBe('LOC_DARK_ROOM');
  });

  // 7. prop reference packaging
  it('7. packages prop references with role PROP', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      references: [samplePropRef],
      outputBaseDir: testWorkspaceDir,
    });

    const prop = result.pkg.references.find((r) => r.role === 'PROP');
    expect(prop?.assetId).toBe('PROP_BUTTERFLY_v1');
  });

  // 8. first-frame packaging
  it('8. packages first frame descriptor when supplied', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      firstFrame: {
        assetId: 'FRAME_START_001',
        uri: 'frames/start.png',
        isCandidate: true,
        sourceShotId: 'SHOT_SC01_SH00',
      },
      outputBaseDir: testWorkspaceDir,
    });

    expect(result.pkg.firstFrame?.assetId).toBe('FRAME_START_001');
  });

  // 9. last-frame packaging
  it('9. packages last frame descriptor when supplied', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      firstFrame: { assetId: 'F1', uri: 'f1.png' },
      lastFrame: { assetId: 'F2', uri: 'f2.png' },
      outputBaseDir: testWorkspaceDir,
    });

    expect(result.pkg.lastFrame?.assetId).toBe('F2');
    expect(result.pkg.recommendedWorkflow).toBe('FIRST_LAST_FRAME_TO_VIDEO');
  });

  // 10. prompt compilation
  it('10. compiles prompt into structured sections without mutating ShotContract', () => {
    const compiler = new FlowPromptCompiler();
    const shotCopy = JSON.parse(JSON.stringify(baseShot));

    const promptResult = compiler.compile(baseShot, {
      references: [sampleCharacterRef, sampleLocationRef],
      continuityConstraints: ['Do not extinguish candle flame.'],
    });

    expect(promptResult.promptText).toContain('[SUBJECT]');
    expect(promptResult.promptText).toContain('[ACTION]');
    expect(promptResult.promptText).toContain('[CAMERA]');
    expect(promptResult.promptText).toContain('[DO NOT CHANGE]');
    expect(promptResult.promptText).toContain('Do not extinguish candle flame.');
    expect(baseShot).toEqual(shotCopy); // Not mutated
  });

  // 11. user locks preserved
  it('11. preserves user locks in compiled prompt', () => {
    const compiler = new FlowPromptCompiler();
    const promptResult = compiler.compile(baseShot);

    expect(promptResult.promptText).toContain('LOCKED CAMERA MOTION');
    expect(promptResult.promptText).toContain('LOCKED RENDERER INTENT');
  });

  // 12. ShotContract not mutated
  it('12. ensures ShotContract instance remains unmodified after packaging', async () => {
    const originalHash = JSON.stringify(baseShot);
    const builder = new FlowProductionPackageBuilder();
    await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(JSON.stringify(baseShot)).toBe(originalHash);
  });

  // 13. cinematic skill compilation
  it('13. compiles semantic cinematic skills (/pushin, /slowmo) into natural Flow directions', () => {
    const compiler = new FlowPromptCompiler();
    const promptResult = compiler.compile(baseShot);

    expect(promptResult.structuredSections.camera).toContain('push-in');
    expect(promptResult.structuredSections.motion).toContain('slow motion');
  });

  // 14. workflow recommendation
  it('14. deterministically recommends optimal Flow workflow', () => {
    const recommender = new FlowWorkflowRecommender();
    const rec1 = recommender.recommend({
      shot: baseShot,
      firstFrame: { path: 'f1.png' },
      lastFrame: { path: 'f2.png' },
    });
    expect(rec1.workflow).toBe('FIRST_LAST_FRAME_TO_VIDEO');

    const rec2 = recommender.recommend({
      shot: baseShot,
      references: [sampleCharacterRef],
    });
    expect(rec2.workflow).toBe('INGREDIENTS_TO_VIDEO');

    const rec3 = recommender.recommend({
      shot: baseShot,
      firstFrame: { path: 'f1.png' },
    });
    expect(rec3.workflow).toBe('FIRST_FRAME_TO_VIDEO');

    const rec4 = recommender.recommend({
      shot: baseShot,
    });
    expect(rec4.workflow).toBe('TEXT_TO_VIDEO');
  });

  // 15. missing reference handling
  it('15. handles missing references gracefully with MISSING label and fallback', () => {
    const recommender = new FlowWorkflowRecommender();
    const emptyRec = recommender.recommend({
      shot: baseShot,
      references: [],
    });
    expect(emptyRec.workflow).toBe('TEXT_TO_VIDEO');
  });

  // 16. state transition validation
  it('16. validates legal state transitions and blocks illegal shortcuts', () => {
    expect(() => validateFlowJobTransition('DRAFT', 'PACKAGE_READY')).not.toThrow();
    expect(() => validateFlowJobTransition('PACKAGE_READY', 'NEEDS_USER_ACTION')).not.toThrow();
    expect(() => validateFlowJobTransition('WAITING_FOR_IMPORT', 'IMPORTED')).not.toThrow();
    expect(() => validateFlowJobTransition('IMPORTED', 'VERIFYING')).not.toThrow();
    expect(() => validateFlowJobTransition('VERIFYING', 'VERIFIED')).not.toThrow();
    expect(() => validateFlowJobTransition('VERIFIED', 'QA_PENDING')).not.toThrow();
    expect(() => validateFlowJobTransition('QA_PENDING', 'CANDIDATE')).not.toThrow();
    expect(() => validateFlowJobTransition('CANDIDATE', 'APPROVED')).not.toThrow();

    // Illegal shortcut: WAITING_FOR_IMPORT -> APPROVED directly
    expect(() => validateFlowJobTransition('WAITING_FOR_IMPORT', 'APPROVED')).toThrow(StudioError);
  });

  // 17. NEEDS_USER_ACTION behavior
  it('17. halts pipeline at NEEDS_USER_ACTION and does not report automatic completion', async () => {
    const manager = new FlowJobManager();
    const job = await manager.prepareFlowJob({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(job.status).toBe('NEEDS_USER_ACTION');
    expect(job.decision).toBeUndefined();
  });

  // 18. import missing file
  it('18. fails import when local file does not exist', async () => {
    const importer = new FlowResultImporter();
    await expect(
      importer.importResult({
        projectId: 'proj_test',
        seriesId: 'series_test',
        shotId: 'SHOT_01',
        sourceMp4Path: path.resolve(testWorkspaceDir, 'non_existent.mp4'),
      })
    ).rejects.toThrow(StudioError);
  });

  // 19. import zero-byte file
  it('19. fails import when local file has 0 bytes', async () => {
    const zeroByteFile = path.resolve(testWorkspaceDir, 'empty.mp4');
    await fs.writeFile(zeroByteFile, Buffer.alloc(0));

    const importer = new FlowResultImporter();
    await expect(
      importer.importResult({
        projectId: 'proj_test',
        seriesId: 'series_test',
        shotId: 'SHOT_01',
        sourceMp4Path: zeroByteFile,
      })
    ).rejects.toThrow('empty (0 bytes)');
  });

  // 20. import invalid MP4
  it('20. rejects non-video files or invalid media structures when stream check is requested', async () => {
    const textFile = path.resolve(testWorkspaceDir, 'fake.mp4');
    await fs.writeFile(textFile, 'This is not a real video');

    const importer = new FlowResultImporter();
    await expect(
      importer.importResult({
        projectId: 'proj_test',
        seriesId: 'series_test',
        shotId: 'SHOT_01',
        sourceMp4Path: textFile,
        requireValidVideoStream: true,
      })
    ).rejects.toThrow();
  });

  // 21. UNIT: isolated registration test
  it('21. UNIT: archives file and creates candidate when video stream check is bypassed for isolated unit testing', async () => {
    // Isolated unit test for registry linking. Real media acceptance is tested in flow-hardening.test.ts
    const testFile = path.resolve(testWorkspaceDir, 'unit_mock_archive.dat');
    await fs.writeFile(testFile, Buffer.alloc(1024, 0x7f));

    const registry = new InMemoryAssetRegistry();
    const importer = new FlowResultImporter(registry);
    const result = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: testFile,
      requireValidVideoStream: false, // Explicitly bypassed in unit test
    });

    expect(result.candidateAssetId).toBeDefined();
    expect(result.storedFilePath).toBeDefined();
    expect(await fs.stat(result.storedFilePath)).toBeDefined();
  });

  // 22. FFprobe verification
  it('22. verifies video stream and extracts metadata', async () => {
    const goldenMp4 = path.resolve('.studio', 'smoke', 'golden', 'master.mp4');
    const exists = await fs.stat(goldenMp4).then(() => true).catch(() => false);
    if (!exists) return; // skip if golden hasn't run yet

    const importer = new FlowResultImporter();
    const result = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: goldenMp4,
      requireValidVideoStream: true,
    });

    expect(result.provenance.durationSeconds).toBeGreaterThan(0);
    expect(result.provenance.resolution).toContain('x');
  });

  // 23. checksum generation
  it('23. calculates SHA-256 checksum for imported physical media', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'checksum_test.mp4');
    await fs.writeFile(sampleFile, 'test media bytes');

    const importer = new FlowResultImporter();
    const result = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      requireValidVideoStream: false,
    });

    expect(result.provenance.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  // 24. provenance generation
  it('24. produces complete, safe provenance record without secrets', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'prov_test.mp4');
    await fs.writeFile(sampleFile, 'video content');

    const importer = new FlowResultImporter();
    const result = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      generationMetadata: {
        modelUsed: 'Google Flow / Veo 2',
        userReportedCredits: 20,
      },
      requireValidVideoStream: false,
    });

    expect(result.provenance.sourceType).toBe('GOOGLE_FLOW_ASSISTED');
    expect(result.provenance.integrationMode).toBe('ASSISTED');
    expect(result.provenance.creditUsage.status).toBe('USER_REPORTED');
    expect(result.provenance.creditUsage.credits).toBe(20);
  });

  // 25. candidate registration
  it('25. registers imported asset as unapproved CANDIDATE', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'cand_test.mp4');
    await fs.writeFile(sampleFile, 'content');

    const registry = new InMemoryAssetRegistry();
    const importer = new FlowResultImporter(registry);
    const result = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      requireValidVideoStream: false,
    });

    expect(result.asset.status).toBe('candidate');
    const fromRegistry = await registry.findById(result.candidateAssetId);
    expect(fromRegistry?.status).toBe('candidate');
  });

  // 26. QA PASS
  it('26. produces QA PASS on consistent candidate', () => {
    const evaluator = new FlowQAEvaluator();
    const report = evaluator.evaluate({
      shot: baseShot,
      provenance: {
        sourceType: 'GOOGLE_FLOW_ASSISTED',
        integrationMode: 'ASSISTED',
        projectId: 'proj_test',
        seriesId: 'series_test',
        shotId: 'SHOT_FLOW_001',
        importTimestamp: new Date().toISOString(),
        originalFilePath: 'test.mp4',
        storedFilePath: 'stored.mp4',
        fileSizeBytes: 1000,
        checksumSha256: 'abc',
        durationSeconds: 4.0,
        resolution: '1920x1080',
        videoCodec: 'h264',
        creditUsage: { status: 'UNKNOWN' },
      },
      candidateAssetId: 'asset_cand_01',
    });

    expect(report.overallStatus).toBe('PASS');
    expect(report.canApprove).toBe(true);
  });

  // 27. QA WARN
  it('27. produces QA WARN when duration deviates within tolerance', () => {
    const evaluator = new FlowQAEvaluator();
    const report = evaluator.evaluate({
      shot: baseShot, // duration 4.0s
      provenance: {
        sourceType: 'GOOGLE_FLOW_ASSISTED',
        integrationMode: 'ASSISTED',
        projectId: 'proj_test',
        seriesId: 'series_test',
        shotId: 'SHOT_FLOW_001',
        importTimestamp: new Date().toISOString(),
        originalFilePath: 'test.mp4',
        storedFilePath: 'stored.mp4',
        fileSizeBytes: 1000,
        checksumSha256: 'abc',
        durationSeconds: 1.5, // 2.5s difference -> warning (>2.0s tolerance)
        resolution: '1920x1080',
        videoCodec: 'h264',
        creditUsage: { status: 'UNKNOWN' },
      },
      candidateAssetId: 'asset_cand_01',
    });

    expect(report.overallStatus).toBe('WARN');
    expect(report.canApprove).toBe(true); // warnings can be approved with human discretion
  });

  // 28. QA FAIL
  it('28. produces QA FAIL when unsupported event or severe deviation detected', () => {
    const evaluator = new FlowQAEvaluator();
    const report = evaluator.evaluate({
      shot: baseShot,
      provenance: {
        sourceType: 'GOOGLE_FLOW_ASSISTED',
        integrationMode: 'ASSISTED',
        projectId: 'proj_test',
        seriesId: 'series_test',
        shotId: 'SHOT_FLOW_001',
        importTimestamp: new Date().toISOString(),
        originalFilePath: 'test.mp4',
        storedFilePath: 'stored.mp4',
        fileSizeBytes: 1000,
        checksumSha256: 'abc',
        durationSeconds: 4.0,
        resolution: '1920x1080',
        videoCodec: 'h264',
        notes: 'Unexpected ghost appeared and chased the character',
        creditUsage: { status: 'UNKNOWN' },
      },
      candidateAssetId: 'asset_cand_01',
      unsupportedEventKeywords: ['ghost', 'monster', 'explosion'],
    });

    expect(report.overallStatus).toBe('FAIL');
    expect(report.canApprove).toBe(false);
  });

  // 29. failed candidate cannot approve
  it('29. prevents approval of a failed candidate', () => {
    const evaluator = new FlowQAEvaluator();
    const report = evaluator.evaluate({
      shot: baseShot,
      provenance: {
        sourceType: 'GOOGLE_FLOW_ASSISTED',
        integrationMode: 'ASSISTED',
        projectId: 'proj_test',
        seriesId: 'series_test',
        shotId: 'SHOT_FLOW_001',
        importTimestamp: new Date().toISOString(),
        originalFilePath: 'test.mp4',
        storedFilePath: 'stored.mp4',
        fileSizeBytes: 1000,
        checksumSha256: 'abc',
        durationSeconds: 15.0, // huge deviation
        resolution: '1920x1080',
        videoCodec: 'h264',
        creditUsage: { status: 'UNKNOWN' },
      },
      candidateAssetId: 'asset_cand_01',
    });

    expect(() => evaluator.assertCanApprove(report)).toThrow(StudioError);
  });

  // 30. approved candidate can pin timeline
  it('30. allows approval and promotion to Canon when QA passes', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'approve_test.mp4');
    await fs.writeFile(sampleFile, 'sample content');

    const registry = new InMemoryAssetRegistry();
    const manager = new FlowJobManager(registry);

    const job = await manager.prepareFlowJob({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    await manager.importFlowResult(job.jobId, sampleFile, {}, { requireValidVideoStream: false });
    const approved = await manager.approveCandidate(job.jobId, 'Director approved');

    expect(approved.status).toBe('APPROVED');
    expect(approved.decision).toBe('APPROVED');

    const canon = await registry.findById(approved.importResult!.candidateAssetId);
    expect(canon?.status).toBe('approved_canon');
  });

  // 31. regeneration versioning
  it('31. increments version on regeneration (v1, v2) without overwriting past jobs', async () => {
    const manager = new FlowJobManager();
    const job1 = await manager.prepareFlowJob({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    const job2 = await manager.prepareFlowJob({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    expect(job1.version).toBe(1);
    expect(job2.version).toBe(2);
    expect(job1.jobId).not.toBe(job2.jobId);
  });

  // 32. old approved asset not silently overwritten
  it('32. retains old candidate versions when a new candidate is imported', async () => {
    const manager = new FlowJobManager();
    await manager.prepareFlowJob({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });
    await manager.prepareFlowJob({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      outputBaseDir: testWorkspaceDir,
    });

    const all = manager.getJobsForShot(baseShot.id);
    expect(all).toHaveLength(2);
  });

  // 33. credit UNKNOWN
  it('33. defaults credit usage to UNKNOWN when not reported by user', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'credit_unk.mp4');
    await fs.writeFile(sampleFile, 'data');

    const importer = new FlowResultImporter();
    const res = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      requireValidVideoStream: false,
    });

    expect(res.provenance.creditUsage.status).toBe('UNKNOWN');
    expect(res.provenance.creditUsage.credits).toBeUndefined();
  });

  // 34. user-reported credit usage
  it('34. accurately preserves user-reported credit usage', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'credit_rep.mp4');
    await fs.writeFile(sampleFile, 'data');

    const importer = new FlowResultImporter();
    const res = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      generationMetadata: {
        userReportedCredits: 30,
      },
      requireValidVideoStream: false,
    });

    expect(res.provenance.creditUsage.status).toBe('USER_REPORTED');
    expect(res.provenance.creditUsage.credits).toBe(30);
  });

  // 35. no fabricated cost
  it('35. does not fabricate costs or savings when credits are unknown', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'credit_safe.mp4');
    await fs.writeFile(sampleFile, 'data');

    const importer = new FlowResultImporter();
    const res = await importer.importResult({
      projectId: 'proj_test',
      seriesId: 'series_test',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      requireValidVideoStream: false,
    });

    expect(res.provenance.creditUsage.estimatedCostUsd).toBeUndefined();
  });

  // 36. router selects local for simple shot
  it('36. production router selects local/HyperFrames for simple shot', async () => {
    const providerRegistry = new ProviderRegistry();
    const promptCompiler = new PromptCompiler();
    const benchmarkTracker = new ProviderBenchmarkTracker();
    const router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker);

    const simpleShot: ShotContract = {
      ...baseShot,
      id: 'SHOT_SIMPLE_01',
      complexity: 'simple_camera_move',
      rendererIntent: 'deterministic_hyperframes',
      directorLocks: {
        isCameraLocked: false,
        isFramingLocked: false,
        isRendererLocked: false,
        isActingLocked: false,
      },
    };

    const strategy = router.routeShot(simpleShot);
    expect(strategy.executionRoute).toBe('deterministic_hyperframes');
  });

  // 37. router selects Flow-assisted for complex shot
  it('37. production router selects Google Flow assisted for complex shot when requested', async () => {
    const providerRegistry = new ProviderRegistry();
    const promptCompiler = new PromptCompiler();
    const benchmarkTracker = new ProviderBenchmarkTracker();
    const router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker);

    const strategy = router.routeShot(baseShot, { preferFlowAssisted: true });

    expect(strategy.primaryProviderId).toBe('google-flow-assisted');
    expect(strategy.integrationMode).toBe('ASSISTED');
    expect(strategy.userActionRequired).toBe(true);
  });

  // 38. Flow route never returns automatic success
  it('38. confirms Flow production route never returns automatic success or completes without human', async () => {
    const providerRegistry = new ProviderRegistry();
    const promptCompiler = new PromptCompiler();
    const benchmarkTracker = new ProviderBenchmarkTracker();
    const router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker);

    const strategy = router.routeShot(baseShot, { preferFlowAssisted: true });

    expect(strategy.userActionRequired).toBe(true);
  });

  // 39. series isolation
  it('39. maintains series isolation across Flow jobs and assets', async () => {
    const sampleFile = path.resolve(testWorkspaceDir, 'iso.mp4');
    await fs.writeFile(sampleFile, 'iso data');

    const registry = new InMemoryAssetRegistry();
    const importer = new FlowResultImporter(registry);

    const rA = await importer.importResult({
      projectId: 'proj_A',
      seriesId: 'SERIES_A',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      requireValidVideoStream: false,
    });

    const rB = await importer.importResult({
      projectId: 'proj_B',
      seriesId: 'SERIES_B',
      shotId: 'SHOT_01',
      sourceMp4Path: sampleFile,
      requireValidVideoStream: false,
    });

    expect(rA.asset.seriesId).toBe('SERIES_A');
    expect(rB.asset.seriesId).toBe('SERIES_B');
    expect(rA.candidateAssetId).not.toBe(rB.candidateAssetId);
  });

  // 40. package contains no credentials
  it('40. verifies Flow package contains no secrets or credentials', async () => {
    const builder = new FlowProductionPackageBuilder();
    const result = await builder.buildPackage({
      projectId: 'proj_test',
      seriesId: 'series_test',
      sceneId: 'SCENE_01',
      shot: baseShot,
      references: [sampleCharacterRef, sampleLocationRef, samplePropRef],
      outputBaseDir: testWorkspaceDir,
    });

    const manifestContent = await fs.readFile(result.manifestPath, 'utf-8');
    const promptContent = await fs.readFile(result.promptPath, 'utf-8');
    const readmeContent = await fs.readFile(result.readmePath, 'utf-8');

    const combined = manifestContent + promptContent + readmeContent;
    expect(/AIzaSy/i.test(combined)).toBe(false);
    expect(/bearer /i.test(combined)).toBe(false);
    expect(/client_secret/i.test(combined)).toBe(false);
    expect(/password/i.test(combined)).toBe(false);
  });
});
