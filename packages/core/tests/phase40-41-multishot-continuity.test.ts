import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { SequentialMultiShotEngine } from '../src/production/sequential-multi-shot-engine.js';
import { ShotContract } from '../src/domain/director.js';
import { CharacterDNA, LocationDNA } from '../src/domain/universe.js';
import { ArtifactVerifier } from '../src/media/artifact-verifier.js';
import { getDeterministicMp4Buffer } from '../src/media/test-media-helper.js';

describe('Phase 40 & 41 — Real Multi-Shot Assembly and Universe Continuity', () => {
  let tempDir: string;
  let mp4Buffer: Buffer;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multishot-continuity-test-'));
    mp4Buffer = getDeterministicMp4Buffer();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestShot(id: string, shotNumber: number, characterId = 'CHAR_MINH', outfitId = 'outfit_pilot'): ShotContract {
    return {
      id,
      sceneId: 'SCENE_01',
      shotNumber,
      purpose: 'narrative',
      complexity: 'medium',
      rendererIntent: 'generative_full_video',
      frame: { durationSeconds: 1.0, aspectRatio: '16:9', targetFps: 24 },
      camera: { shotSize: 'medium', angle: 'eye_level', movement: 'static', focalLength: '35mm', semanticSkills: [] },
      lighting: { keyLightDirection: 'front', mood: 'dramatic', colorTemperature: 'neutral', fogAtmosphere: false },
      composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
      acting: [{
        characterId,
        outfitId,
        pose: 'standing_steady',
        expression: 'focused',
        gazeDirection: 'screen_left',
        actionPrompt: 'Checking cockpit readouts',
      }],
      transition: { type: 'cut', durationSeconds: 0 },
      requiredAssetIds: [],
      dependsOnShotIds: [],
      directorLocks: { locked: false, lockReason: '' },
    };
  }

  const canonicalChar: CharacterDNA = {
    id: 'CHAR_MINH',
    seriesId: 'series_cyber_2088',
    name: 'Captain Minh',
    aliases: ['Minh'],
    description: 'Lead navigator',
    visualAnchorPrompt: 'silver cybernetic eye, worn black flight jacket',
    traits: ['determined', 'calm'],
    currentVersion: 1,
    versions: [],
    outfits: [{
      id: 'outfit_pilot',
      name: 'Standard Flight Suit',
      description: 'Thermal pilot jumpsuit',
      referenceAssetIds: ['asset_outfit_pilot_ref'],
    }],
    canonicalSheetAssetId: 'asset_char_minh_sheet',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const canonicalLoc: LocationDNA = {
    id: 'LOC_BRIDGE',
    seriesId: 'series_cyber_2088',
    name: 'Command Bridge',
    aliases: ['Bridge'],
    description: 'Primary flight bridge',
    zones: [{
      id: 'zone_helm',
      name: 'Helm Station',
      description: 'Pilot console',
      keyProps: ['console_screen'],
    }],
    atmospherePrompt: 'cyan volumetric cockpit holograms, low neon hum',
    lightingPresets: {},
    canonicalAssetIds: ['asset_loc_bridge_canon'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('Phase 40: Multi-Shot Master Assembly', () => {
    it('physically concatenates 3 shots into verified final-master.mp4 with combined duration', async () => {
      const engine = new SequentialMultiShotEngine();
      const shots = [
        createTestShot('SHOT_01', 1),
        createTestShot('SHOT_02', 2),
        createTestShot('SHOT_03', 3),
      ];

      const result = await engine.executeSequence({
        runId: 'run_assembly_01',
        projectId: 'proj_assembly',
        seriesId: 'series_cyber_2088',
        sceneId: 'SCENE_01',
        shots,
        characterDna: [canonicalChar],
        locationDna: canonicalLoc,
        outputDir: tempDir,
        videoGenerator: async (shot) => {
          const shotDir = path.join(tempDir, shot.id);
          fs.mkdirSync(shotDir, { recursive: true });
          const videoPath = path.join(shotDir, 'clip.mp4');
          fs.writeFileSync(videoPath, mp4Buffer);
          const sha256 = crypto.createHash('sha256').update(mp4Buffer).digest('hex');
          return { videoPath, sha256 };
        },
      });

      expect(result.masterAssembled).toBe(true);
      expect(result.masterVideoPath).toBeDefined();
      expect(fs.existsSync(result.masterVideoPath!)).toBe(true);

      // Verify physical stream with ArtifactVerifier
      const verif = ArtifactVerifier.verifyVideo(result.masterVideoPath!);
      expect(verif.exists).toBe(true);
      expect(verif.hasVideoStream).toBe(true);
      expect(verif.durationSeconds).toBeGreaterThanOrEqual(2.5); // ~3 seconds (3 x 1.0s shots)
      expect(verif.width).toBe(320);
      expect(verif.height).toBe(180);
      expect(result.masterSha256).toBeDefined();
      expect(result.shots.length).toBe(3);
    });

    it('fails closed if any required shot video file is missing before assembly', async () => {
      const engine = new SequentialMultiShotEngine();
      const shots = [
        createTestShot('SHOT_01', 1),
        createTestShot('SHOT_02', 2),
        createTestShot('SHOT_03', 3),
      ];

      await expect(
        engine.executeSequence({
          runId: 'run_assembly_fail',
          projectId: 'proj_assembly',
          seriesId: 'series_cyber_2088',
          sceneId: 'SCENE_01',
          shots,
          characterDna: [canonicalChar],
          locationDna: canonicalLoc,
          outputDir: tempDir,
          videoGenerator: async (shot) => {
            const shotDir = path.join(tempDir, shot.id);
            fs.mkdirSync(shotDir, { recursive: true });
            const videoPath = path.join(shotDir, 'clip.mp4');
            fs.writeFileSync(videoPath, mp4Buffer);
            const sha256 = crypto.createHash('sha256').update(mp4Buffer).digest('hex');

            // Adversarially delete Shot 2 clip during Shot 3 execution
            if (shot.id === 'SHOT_03') {
              const shot2Clip = path.join(tempDir, 'SHOT_02', 'clip.mp4');
              if (fs.existsSync(shot2Clip)) {
                fs.unlinkSync(shot2Clip);
              }
            }
            return { videoPath, sha256 };
          },
        })
      ).rejects.toThrow(/\[MASTER_ASSEMBLY_FAILED\]/);
    });
  });

  describe('Phase 41: Character and Location Universe Continuity', () => {
    it('materially enriches shot contract with CharacterDNA visual anchors and canonical assets', async () => {
      const engine = new SequentialMultiShotEngine();
      const shots = [createTestShot('SHOT_01', 1)];
      let executedContract: ShotContract | undefined;

      await engine.executeSequence({
        runId: 'run_char_dna_01',
        projectId: 'proj_continuity',
        seriesId: 'series_cyber_2088',
        sceneId: 'SCENE_01',
        shots,
        characterDna: [canonicalChar],
        locationDna: canonicalLoc,
        outputDir: tempDir,
        videoGenerator: async (shot) => {
          executedContract = shot;
          const shotDir = path.join(tempDir, shot.id);
          fs.mkdirSync(shotDir, { recursive: true });
          const videoPath = path.join(shotDir, 'clip.mp4');
          fs.writeFileSync(videoPath, mp4Buffer);
          const sha256 = crypto.createHash('sha256').update(mp4Buffer).digest('hex');
          return { videoPath, sha256 };
        },
      });

      expect(executedContract).toBeDefined();
      expect(executedContract!.requiredAssetIds).toContain('asset_char_minh_sheet');
      expect(executedContract!.requiredAssetIds).toContain('asset_outfit_pilot_ref');
      expect(executedContract!.requiredAssetIds).toContain('asset_loc_bridge_canon');
      expect(executedContract!.environmentLocationId).toBe('LOC_BRIDGE');
      expect(executedContract!.acting[0].actionPrompt).toContain('Captain Minh');
      expect(executedContract!.acting[0].actionPrompt).toContain('silver cybernetic eye');
      expect(executedContract!.acting[0].actionPrompt).toContain('cyan volumetric cockpit holograms');
    });

    it('rejects cross-series Character contamination adversarial test', async () => {
      const engine = new SequentialMultiShotEngine();
      const foreignChar: CharacterDNA = {
        ...canonicalChar,
        seriesId: 'series_fantasy_medieval_99', // Foreign series!
      };

      const shots = [createTestShot('SHOT_01', 1)];

      await expect(
        engine.executeSequence({
          runId: 'run_contamination_char',
          projectId: 'proj_continuity',
          seriesId: 'series_cyber_2088',
          sceneId: 'SCENE_01',
          shots,
          characterDna: [foreignChar],
          outputDir: tempDir,
          videoGenerator: async () => ({ videoPath: '', sha256: '' }),
        })
      ).rejects.toThrow(/\[CROSS_SERIES_CONTAMINATION\]/);
    });

    it('rejects cross-series Location contamination adversarial test', async () => {
      const engine = new SequentialMultiShotEngine();
      const foreignLoc: LocationDNA = {
        ...canonicalLoc,
        seriesId: 'series_fantasy_medieval_99', // Foreign series!
      };

      const shots = [createTestShot('SHOT_01', 1)];

      await expect(
        engine.executeSequence({
          runId: 'run_contamination_loc',
          projectId: 'proj_continuity',
          seriesId: 'series_cyber_2088',
          sceneId: 'SCENE_01',
          shots,
          characterDna: [canonicalChar],
          locationDna: foreignLoc,
          outputDir: tempDir,
          videoGenerator: async () => ({ videoPath: '', sha256: '' }),
        })
      ).rejects.toThrow(/\[CROSS_SERIES_CONTAMINATION\]/);
    });

    it('rejects unknown character referenced in shot contract', async () => {
      const engine = new SequentialMultiShotEngine();
      const shots = [createTestShot('SHOT_01', 1, 'CHAR_GHOST_UNREGISTERED')];

      await expect(
        engine.executeSequence({
          runId: 'run_unknown_char',
          projectId: 'proj_continuity',
          seriesId: 'series_cyber_2088',
          sceneId: 'SCENE_01',
          shots,
          characterDna: [canonicalChar],
          outputDir: tempDir,
          videoGenerator: async () => ({ videoPath: '', sha256: '' }),
        })
      ).rejects.toThrow(/\[CHARACTER_NOT_FOUND\]/);
    });

    it('detects deliberate wardrobe continuity violation across consecutive shots', async () => {
      const engine = new SequentialMultiShotEngine();
      const charWithTwoOutfits: CharacterDNA = {
        ...canonicalChar,
        outfits: [
          { id: 'outfit_pilot', name: 'Pilot Suit', description: 'Flight suit', referenceAssetIds: [] },
          { id: 'outfit_evening', name: 'Evening Gown', description: 'Gown', referenceAssetIds: [] },
        ],
      };

      const shots = [
        createTestShot('SHOT_01', 1, 'CHAR_MINH', 'outfit_pilot'),
        // Abrupt wardrobe jump from pilot suit to evening gown in same scene without transition!
        createTestShot('SHOT_02', 2, 'CHAR_MINH', 'outfit_evening'),
      ];

      const result = await engine.executeSequence({
        runId: 'run_wardrobe_fail',
        projectId: 'proj_continuity',
        seriesId: 'series_cyber_2088',
        sceneId: 'SCENE_01',
        shots,
        characterDna: [charWithTwoOutfits],
        locationDna: canonicalLoc,
        outputDir: tempDir,
        videoGenerator: async (shot) => {
          const shotDir = path.join(tempDir, shot.id);
          fs.mkdirSync(shotDir, { recursive: true });
          const videoPath = path.join(shotDir, 'clip.mp4');
          fs.writeFileSync(videoPath, mp4Buffer);
          const sha256 = crypto.createHash('sha256').update(mp4Buffer).digest('hex');
          return { videoPath, sha256 };
        },
      });

      // Continuity QA should flag the critical wardrobe mismatch
      expect(result.continuityAllPassed).toBe(false);
      expect(result.shots[1].passedContinuity).toBe(false);
      expect(result.shots[1].continuityScore).toBeLessThan(100);
    });
  });
});
