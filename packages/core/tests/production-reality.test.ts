import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  MediaToolchainDoctor,
  ArtifactVerifier,
  LocalAudioGenerator,
  RealAudioMixer,
  HyperFramesVideoBridge,
  VideoRenderer,
  InMemoryAssetRegistry,
  ProductionRouter,
  RenderCache,
  StudioExecutionMode,
  ProductionSafetyError,
  ProviderRegistry,
  MockProvider,
  PromptCompiler,
  ProviderBenchmarkTracker,
} from '../src/index.js';
import { TimelineSequence } from '../src/domain/timeline.js';

describe('Phase 16 — Production Reality & Mock Elimination', () => {
  const testOutputDir = path.join('.studio', 'test-reality');

  beforeAll(() => {
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  describe('1. MediaToolchainDoctor', () => {
    it('diagnoses system media toolchain (ffmpeg, ffprobe, headless browser)', () => {
      const status = MediaToolchainDoctor.diagnose(true);
      expect(status.ffmpeg.available).toBe(true);
      expect(status.ffmpeg.path).toBeDefined();
      expect(status.ffprobe.available).toBe(true);
      expect(status.ffprobe.path).toBeDefined();
      expect(status.browser.available).toBe(true);
      expect(status.allReady).toBe(true);
    });
  });

  describe('2. ArtifactVerifier', () => {
    it('rejects non-existent files', () => {
      const result = ArtifactVerifier.verify(path.join(testOutputDir, 'non_existent.mp4'));
      expect(result.exists).toBe(false);
      expect(result.nonEmpty).toBe(false);
      expect(result.error).toContain('File does not exist');
    });

    it('rejects zero-byte files', () => {
      const zeroByteFile = path.join(testOutputDir, 'zero_byte.mp4');
      fs.writeFileSync(zeroByteFile, Buffer.alloc(0));

      const result = ArtifactVerifier.verify(zeroByteFile);
      expect(result.exists).toBe(true);
      expect(result.nonEmpty).toBe(false);
      expect(result.sizeBytes).toBe(0);
      expect(result.error).toContain('0 bytes');
    });

    it('verifies non-empty files with sha256 checksum', () => {
      const sampleFile = path.join(testOutputDir, 'sample_text.txt');
      fs.writeFileSync(sampleFile, 'Real production payload test 12345', 'utf-8');

      const result = ArtifactVerifier.verify(sampleFile);
      expect(result.exists).toBe(true);
      expect(result.nonEmpty).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.checksumSha256).toBeDefined();
      expect(result.checksumSha256?.length).toBe(64);
    });
  });

  describe('3. LocalAudioGenerator & RealAudioMixer', () => {
    it('generates real WAV audio files with measurable duration and audio stream', async () => {
      const wavPath = path.join(testOutputDir, 'dialogue_sample.wav');
      const res = await LocalAudioGenerator.generate({
        outputPath: wavPath,
        durationSeconds: 1.5,
        type: 'dialogue',
        frequency: 240,
      });

      expect(res.provenance).toBe('LOCAL_TEST_AUDIO');
      expect(res.verification.exists).toBe(true);
      expect(res.verification.nonEmpty).toBe(true);
      expect(res.verification.hasAudioStream).toBe(true);
      expect(res.verification.durationSeconds).toBeGreaterThan(1.0);
    });

    it('mixes multiple real audio stems into a master audio track', async () => {
      const stem1 = path.join(testOutputDir, 'stem_music.wav');
      const stem2 = path.join(testOutputDir, 'stem_sfx.wav');

      await LocalAudioGenerator.generate({
        outputPath: stem1,
        durationSeconds: 2.0,
        type: 'music',
      });
      await LocalAudioGenerator.generate({
        outputPath: stem2,
        durationSeconds: 1.0,
        type: 'sfx',
      });

      const mixResult = await RealAudioMixer.mix({
        projectId: 'test_reality_proj',
        outputDir: testOutputDir,
        totalDurationSeconds: 2.0,
        stems: [
          { filePath: stem1, startTimeSeconds: 0, volume: 0.8, stemType: 'music' },
          { filePath: stem2, startTimeSeconds: 0.5, volume: 1.0, stemType: 'sfx' },
        ],
      });

      expect(mixResult.verification.exists).toBe(true);
      expect(mixResult.verification.nonEmpty).toBe(true);
      expect(mixResult.verification.hasAudioStream).toBe(true);
      expect(mixResult.stemCount).toBe(2);
      expect(mixResult.totalDurationSeconds).toBeGreaterThanOrEqual(2.0);
    });
  });

  describe('4. HyperFramesVideoBridge (Deterministic Headless Rendering)', () => {
    it('renders a HyperFrames composition into a real MP4 video file with H.264 video stream', async () => {
      const shotMp4 = path.join(testOutputDir, 'hyperframes_shot.mp4');

      const composition = {
        compositionId: 'comp_test_reality_01',
        sceneId: 'SCENE_01',
        shotId: 'SHOT_01',
        title: 'Candle Light and Butterfly Test',
        width: 640,
        height: 360,
        fps: 24,
        durationSeconds: 1.0,
        html: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; background: #0b0f19; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 640px; height: 360px; font-family: sans-serif; }
    .candle { width: 30px; height: 100px; background: #fef08a; border-radius: 6px; position: absolute; bottom: 80px; }
    .flame { width: 24px; height: 36px; background: radial-gradient(circle, #f97316 20%, #ef4444 80%); border-radius: 50% 50% 20% 20%; position: absolute; bottom: 185px; }
    .title { color: #f8fafc; font-size: 18px; font-weight: bold; position: absolute; top: 30px; }
  </style>
</head>
<body>
  <div class="title">AI Animation Studio — Real Video Verification</div>
  <div class="candle"></div>
  <div class="flame"></div>
</body>
</html>`,
      };

      const result = await HyperFramesVideoBridge.renderToMp4(composition, shotMp4, {
        fps: 24,
        width: 640,
        height: 360,
      });

      expect(result.verification.exists).toBe(true);
      expect(result.verification.nonEmpty).toBe(true);
      expect(result.verification.hasVideoStream).toBe(true);
      expect(result.verification.videoCodec).toBe('h264');
      expect(result.verification.width).toBe(640);
      expect(result.verification.height).toBe(360);
      expect(result.frameCount).toBeGreaterThanOrEqual(24);
      expect(fs.existsSync(shotMp4)).toBe(true);
      expect(fs.statSync(shotMp4).size).toBeGreaterThan(1000);
    }, 30000);
  });

  describe('5. VideoRenderer (Master Export & Muxing)', () => {
    it('stitches multiple real video clips with mixed audio into a verified master MP4', async () => {
      const shot1Mp4 = path.join(testOutputDir, 'hyperframes_shot.mp4');
      const masterAudio = path.join(testOutputDir, 'master-audio.wav');
      const finalMasterMp4 = path.join(testOutputDir, 'final_master.mp4');

      const sequence: TimelineSequence = {
        sequenceId: 'seq_reality_test',
        projectId: 'proj_reality_test',
        fps: 24,
        resolution: { width: 640, height: 360 },
        totalDuration: 1.0,
        tracks: [
          {
            trackId: 'V1',
            trackType: 'video',
            name: 'Master Video',
            clips: [
              {
                clipId: 'clip_shot_1',
                sourceAssetId: shot1Mp4,
                trackId: 'V1',
                startTime: 0,
                duration: 1.0,
                inPoint: 0,
                outPoint: 1.0,
                speed: 1.0,
                volume: 1.0,
                blendMode: 'normal',
                opacity: 1.0,
                scale: { x: 1, y: 1 },
                position: { x: 0, y: 0 },
              },
            ],
            isMuted: false,
            isLocked: false,
            height: 50,
          },
        ],
        transitions: [],
        markers: [],
      };

      const result = await VideoRenderer.render({
        sequence,
        outputPath: finalMasterMp4,
        masterAudioPath: masterAudio,
        includeAudio: true,
      });

      expect(result.verification.exists).toBe(true);
      expect(result.verification.nonEmpty).toBe(true);
      expect(result.verification.hasVideoStream).toBe(true);
      expect(result.verification.hasAudioStream).toBe(true);
      expect(result.verification.videoCodec).toBe('h264');
      expect(result.manifest.format).toBe('mp4');
      expect(result.manifest.outputFiles[0].sizeBytes).toBeGreaterThan(1000);
      expect(fs.existsSync(finalMasterMp4)).toBe(true);
    });
  });

  describe('6. AssetRegistry & Physical Verification', () => {
    it('verifies physical asset files and detects missing artifacts', async () => {
      const registry = new InMemoryAssetRegistry();

      const validFile = path.join(testOutputDir, 'sample_text.txt');
      const asset = await registry.register({
        id: 'ASSET_PHYSICAL_01',
        seriesId: 'series_reality',
        type: 'export_manifest',
        name: 'Sample Manifest',
        contentHash: 'hash_real_123',
        storageUri: validFile,
        mimeType: 'text/plain',
        sizeBytes: 30,
        version: 1,
        tags: ['test'],
        metadata: {},
      });

      const verification = await registry.verifyPhysicalArtifact(asset.id);
      expect(verification.exists).toBe(true);
      expect(verification.nonEmpty).toBe(true);

      const updated = await registry.findById(asset.id);
      expect(updated?.artifactState).toBe('VERIFIED');
    });

    it('marks non-existent files as MISSING', async () => {
      const registry = new InMemoryAssetRegistry();

      const missingAsset = await registry.register({
        id: 'ASSET_MISSING_01',
        seriesId: 'series_reality',
        type: 'video_clip',
        name: 'Fake Video',
        contentHash: 'hash_fake_000',
        storageUri: '.studio/videos/does_not_exist.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
        version: 1,
        tags: ['test'],
        metadata: {},
      });

      const verification = await registry.verifyPhysicalArtifact(missingAsset.id);
      expect(verification.exists).toBe(false);

      const updated = await registry.findById(missingAsset.id);
      expect(updated?.artifactState).toBe('MISSING');
    });
  });

  describe('7. RenderCache Staleness & Physical Verification', () => {
    it('detects when cached physical file is deleted and invalidates cache', () => {
      const cache = new RenderCache();
      const tempMedia = path.join(testOutputDir, 'temp_cache_media.mp4');
      fs.writeFileSync(tempMedia, 'fake video stream data');

      cache.set('shot_cache_key_1', {
        assetId: 'ASSET_CACHE_1',
        storageUri: tempMedia,
        costUsd: 0.1,
        renderTimeMs: 50,
      });

      // 1. Initial hit when file exists
      const hit = cache.get('shot_cache_key_1');
      expect(hit).toBeDefined();

      // 2. Delete file physically
      fs.unlinkSync(tempMedia);

      // 3. Cache get must return undefined (cache stale)
      const staleCheck = cache.get('shot_cache_key_1');
      expect(staleCheck).toBeUndefined();
    });
  });

  describe('8. Production Router Execution Mode Safety Guards', () => {
    it('prohibits mock providers when running in PRODUCTION mode', () => {
      const registry = new ProviderRegistry();
      const mockVideo = new MockProvider({
        id: 'mock-video-provider',
        name: 'Mock Video Provider',
        version: '1.0.0',
        capabilities: ['video_gen'],
      });
      registry.register(mockVideo);

      const router = new ProductionRouter(
        registry,
        new PromptCompiler(),
        new ProviderBenchmarkTracker()
      );

      const shot = {
        id: 'SHOT_DANGEROUS',
        sceneId: 'SCENE_01',
        shotNumber: 1,
        purpose: 'establishing' as const,
        complexity: 'complex_generative_video' as const,
        frame: { durationSeconds: 3.0, targetFps: 24, aspectRatio: '16:9' as const },
        camera: { focalLength: '24mm', shotSize: 'wide' as const, angle: 'eye_level' as const, movement: 'orbit' as const, semanticSkills: [] },
        lighting: { keyLightDirection: 'left', mood: 'dark', colorTemperature: 'cool', fogAtmosphere: false },
        composition: { rule: 'rule_of_thirds' as const, subjectPlacement: 'center' as const, depthLayers: { foreground: [], midground: [], background: [] } },
        acting: [],
        transition: { type: 'cut' as const, durationSeconds: 0 },
        audioCue: { sfx: [] },
        requiredAssetIds: [],
        dependsOnShotIds: [],
        directorLocks: { isFramingLocked: false, isLightingLocked: false, isRendererLocked: false },
      };

      expect(() => {
        router.routeShot(shot, {
          forceGenerative: true,
          executionMode: 'PRODUCTION',
        });
      }).toThrow(ProductionSafetyError);
    });

    it('permits deterministic engine in LOCAL mode', () => {
      const registry = new ProviderRegistry();
      const router = new ProductionRouter(
        registry,
        new PromptCompiler(),
        new ProviderBenchmarkTracker()
      );

      const shot = {
        id: 'SHOT_SAFE',
        sceneId: 'SCENE_01',
        shotNumber: 1,
        purpose: 'establishing' as const,
        complexity: 'simple_transform' as const,
        rendererIntent: 'deterministic_hyperframes' as const,
        frame: { durationSeconds: 2.0, targetFps: 24, aspectRatio: '16:9' as const },
        camera: { focalLength: '24mm', shotSize: 'wide' as const, angle: 'eye_level' as const, movement: 'static' as const, semanticSkills: [] },
        lighting: { keyLightDirection: 'front', mood: 'neutral', colorTemperature: 'warm', fogAtmosphere: false },
        composition: { rule: 'rule_of_thirds' as const, subjectPlacement: 'center' as const, depthLayers: { foreground: [], midground: [], background: [] } },
        acting: [],
        transition: { type: 'cut' as const, durationSeconds: 0 },
        audioCue: { sfx: [] },
        requiredAssetIds: [],
        dependsOnShotIds: [],
        directorLocks: { isFramingLocked: false, isLightingLocked: false, isRendererLocked: true },
      };

      const decision = router.routeShot(shot, {
        executionMode: 'LOCAL',
      });
      expect(decision.primaryProviderId).toBe('hyperframes-local');
      expect(decision.isDeterministic).toBe(true);
    });
  });
});
