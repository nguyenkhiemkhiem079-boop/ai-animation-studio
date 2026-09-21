import { describe, it, expect } from 'vitest';
import {
  ProjectSchema,
  CharacterDNASchema,
  LocationDNASchema,
  ShotContractSchema,
  AssetDescriptorSchema,
  StoryAnalysisSchema,
} from '../src/index.js';

describe('Core Domain Schemas', () => {
  it('validates a valid Project schema', () => {
    const project = {
      id: 'proj_test_001',
      name: 'The Ancient Valley',
      seriesId: 'series_001',
      status: 'draft',
      config: {
        aspectRatio: '16:9',
        targetFps: 24,
        resolution: { width: 1920, height: 1080 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    };

    const parsed = ProjectSchema.parse(project);
    expect(parsed.id).toBe('proj_test_001');
    expect(parsed.config.targetFps).toBe(24);
  });

  it('validates CharacterDNA with versions and outfits', () => {
    const char = {
      id: 'CHAR_MINH_001',
      seriesId: 'series_001',
      name: 'Minh',
      description: 'A 28-year-old investigative journalist.',
      visualAnchorPrompt: 'Vietnamese male in late 20s, disheveled hair, dark tired eyes, wearing a vintage trench coat',
      traits: ['curious', 'skeptical', 'protective'],
      voiceTimbre: 'warm baritone with slight rasp',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          summary: 'Original introduction look in episode 1',
          canonicalAssetIds: ['asset_minh_sheet_v1'],
          createdAt: new Date().toISOString(),
        },
      ],
      outfits: [
        {
          id: 'outfit_raincoat',
          name: 'Raincoat Outfit',
          description: 'Dark olive waterproof coat with brass buttons',
          referenceAssetIds: [],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = CharacterDNASchema.parse(char);
    expect(parsed.id).toBe('CHAR_MINH_001');
    expect(parsed.outfits[0].id).toBe('outfit_raincoat');
  });

  it('validates ShotContract specification', () => {
    const shot = {
      id: 'SHOT_SC01_SH01',
      sceneId: 'SCENE_001',
      shotNumber: 1,
      purpose: 'establishing',
      complexity: 'simple_transform',
      rendererIntent: 'deterministic_hyperframes',
      frame: {
        durationSeconds: 4.5,
        aspectRatio: '16:9',
        targetFps: 24,
      },
      camera: {
        focalLength: '35mm',
        shotSize: 'wide',
        angle: 'eye_level',
        movement: 'push_in',
        semanticSkills: ['push_in'],
      },
      lighting: {
        keyLightDirection: 'left',
        mood: 'somber',
        colorTemperature: 'cool',
        fogAtmosphere: true,
      },
      acting: [
        {
          characterId: 'CHAR_MINH_001',
          pose: 'standing_cautious',
          expression: 'terrified',
        },
      ],
      audioCue: {
        sfx: ['distant_thunder.mp3', 'heavy_rain.mp3'],
      },
      requiredAssetIds: ['asset_backdrop_house'],
      dependsOnShotIds: [],
      provenance: {
        sourceBeatId: 'BEAT_001',
        decidedAt: new Date().toISOString(),
      },
    };

    const parsed = ShotContractSchema.parse(shot);
    expect(parsed.id).toBe('SHOT_SC01_SH01');
    expect(parsed.rendererIntent).toBe('deterministic_hyperframes');
  });

  it('rejects invalid ShotContract missing required fields', () => {
    const invalidShot = {
      id: 'SHOT_FAIL',
      // missing sceneId, purpose, etc.
    };
    expect(() => ShotContractSchema.parse(invalidShot)).toThrow();
  });
});
