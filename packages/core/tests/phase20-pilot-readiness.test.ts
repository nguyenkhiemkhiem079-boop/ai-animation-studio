import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  assertSafeIdentifier,
  assertPathContained,
  ProductionSafetyError,
  ValidationError,
  ProductionPilotReadinessValidator,
  ProductionOrchestrator,
  FileSystemStorage,
  FileSystemAssetRegistry,
  ArtifactVerifier,
  FrameExtractor,
} from '../src/index.js';

describe('Phase 20 — Real Pilot Contract & Security Hardening Test Suite', () => {
  const testRoot = path.resolve('.studio', 'tests_phase20_security');
  const storage = new FileSystemStorage(testRoot);
  const assetRegistry = new FileSystemAssetRegistry(storage);

  beforeEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('Path Traversal & Identifier Security', () => {
    it('1. accepts valid filesystem identifiers', () => {
      expect(assertSafeIdentifier('proj_123', 'projectId')).toBe('proj_123');
      expect(assertSafeIdentifier('run-456-abc', 'runId')).toBe('run-456-abc');
      expect(assertSafeIdentifier('SHOT_01', 'shotId')).toBe('SHOT_01');
      expect(assertSafeIdentifier('series.neo.tokyo', 'seriesId')).toBe('series.neo.tokyo');
    });

    it('2. rejects path traversal vectors with .. and separators', () => {
      expect(() => assertSafeIdentifier('../etc/passwd', 'projectId')).toThrow(ProductionSafetyError);
      expect(() => assertSafeIdentifier('..\\windows\\system32', 'projectId')).toThrow(ProductionSafetyError);
      expect(() => assertSafeIdentifier('..', 'runId')).toThrow(ProductionSafetyError);
      expect(() => assertSafeIdentifier('/root/secret', 'shotId')).toThrow(ProductionSafetyError);
      expect(() => assertSafeIdentifier('C:\\Windows', 'projectId')).toThrow(ProductionSafetyError);
      expect(() => assertSafeIdentifier('D:/data', 'projectId')).toThrow(ProductionSafetyError);
    });

    it('3. rejects null bytes, control characters, and leading dots', () => {
      expect(() => assertSafeIdentifier('run\0poison', 'runId')).toThrow(ProductionSafetyError);
      expect(() => assertSafeIdentifier('.hidden', 'projectId')).toThrow(ProductionSafetyError);
      expect(() => assertSafeIdentifier('   ', 'projectId')).toThrow(ValidationError);
      expect(() => assertSafeIdentifier('', 'projectId')).toThrow(ValidationError);
    });

    it('4. prevents path traversal in ProductionOrchestrator.createRun', async () => {
      const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
      await expect(
        orchestrator.createRun({
          projectId: '../../evil_proj',
          seriesId: 'series_01',
          rawScript: 'A valid story script with enough text to process.',
        })
      ).rejects.toThrow(ProductionSafetyError);

      await expect(
        orchestrator.createRun({
          projectId: 'proj_safe',
          seriesId: '../escape_series',
          rawScript: 'A valid story script with enough text to process.',
        })
      ).rejects.toThrow(ProductionSafetyError);
    });

    it('5. enforces assertPathContained boundaries', () => {
      const base = 'C:/studio/production/proj1';
      expect(() => assertPathContained('C:/studio/production/proj1/run1', base)).not.toThrow();
      expect(() => assertPathContained('C:/studio/production/proj2/run1', base)).toThrow(ProductionSafetyError);
    });
  });

  describe('Story Input Hardening & Lossless Ingestion', () => {
    it('6. rejects empty and whitespace-only story files', async () => {
      const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
      await expect(
        orchestrator.createRun({
          projectId: 'proj_test_empty',
          seriesId: 'series_01',
          rawScript: '',
        })
      ).rejects.toThrow(ProductionSafetyError);

      await expect(
        orchestrator.createRun({
          projectId: 'proj_test_spaces',
          seriesId: 'series_01',
          rawScript: '   \n\t  \r\n   ',
        })
      ).rejects.toThrow(ProductionSafetyError);
    });

    it('7. cleanly strips UTF-8 BOM without altering story content', async () => {
      const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
      const scriptWithBOM = '\uFEFFSCENE 1 - EXT. CYBER CITY - NIGHT\nHero stands on the rooftop.';
      const run = await orchestrator.createRun({
        projectId: 'proj_bom_test',
        seriesId: 'series_01',
        rawScript: scriptWithBOM,
      });

      const savedScript = await storage.read(`.studio/production/proj_bom_test/${run.runId}/source_story.txt`);
      expect(savedScript.startsWith('\uFEFF')).toBe(false);
      expect(savedScript).toBe('SCENE 1 - EXT. CYBER CITY - NIGHT\nHero stands on the rooftop.');
    });

    it('8. preserves Vietnamese UTF-8 characters and mixed line endings losslessly', async () => {
      const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
      const vietnameseStory =
        'CẢNH 1 - ĐƯỜNG PHỐ SÀI GÒN - ĐÊM MƯA\r\n' +
        'Ánh đèn neon phản chiếu trên mặt đường ướt sũng.\n' +
        'Minh bước ra từ con hẻm nhỏ, mắt nhìn về phía chân trời rực sáng.';

      const run = await orchestrator.createRun({
        projectId: 'proj_vn_test',
        seriesId: 'series_01',
        rawScript: vietnameseStory,
      });

      const saved = await storage.read(`.studio/production/proj_vn_test/${run.runId}/source_story.txt`);
      expect(saved).toBe(vietnameseStory);
    });
  });

  describe('ProductionPilotReadinessValidator', () => {
    it('9. executes offline zero-network audit returning structured checks', async () => {
      const storyPath = path.join(testRoot, 'sample-story.txt');
      fs.writeFileSync(storyPath, 'SCENE 1 - INT. LAB - DAY\nDr. Thorne inspects the glowing crystal.\n', 'utf-8');

      const result = await ProductionPilotReadinessValidator.validate({
        storyFilePath: storyPath,
        allowLiveOptIn: false,
        storage,
      });

      expect(result).toHaveProperty('readyForOfflineRehearsal');
      expect(result).toHaveProperty('readyForLivePilot');
      expect(result).toHaveProperty('canDryRun');
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.diagnostics.nodeVersion).toBe(process.version);
      expect(result.diagnostics.liveAuthorizationStatus).toBe('DISABLED');

      const nodeCheck = result.checks.find((c) => c.id === 'node_runtime');
      expect(nodeCheck?.status).toBe('PASS');

      const storyCheck = result.checks.find((c) => c.id === 'story_script');
      expect(storyCheck?.status).toBe('PASS');
    });

    it('10. detects missing and empty story files as blockers', async () => {
      const missingResult = await ProductionPilotReadinessValidator.validate({
        storyFilePath: path.join(testRoot, 'non_existent_story.txt'),
        storage,
      });
      expect(missingResult.readyForOfflineRehearsal).toBe(false);
      expect(missingResult.blockers.some((b) => b.includes('not found'))).toBe(true);

      const emptyPath = path.join(testRoot, 'empty.txt');
      fs.writeFileSync(emptyPath, '', 'utf-8');
      const emptyResult = await ProductionPilotReadinessValidator.validate({
        storyFilePath: emptyPath,
        storage,
      });
      expect(emptyResult.readyForOfflineRehearsal).toBe(false);
      expect(emptyResult.blockers.some((b) => b.includes('empty'))).toBe(true);
    });
  });
});
