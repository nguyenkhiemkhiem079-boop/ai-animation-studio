import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { FileSystemStorage } from '../src/storage/index.js';
import { EvidenceStore } from '../src/production-evidence/evidence-store.js';
import {
  ProductionRun,
  ProductionRunSchema,
  migrateProductionRun,
} from '../src/domain/production-run.js';
import { ProductionAcceptanceBundle } from '../src/production-verifier/acceptance-bundle.js';
import { ProductionSafetyError } from '../src/domain/execution-mode.js';

describe('Phase 20 — Acceptance Schema Versioning & Storage Migration', () => {
  const testDir = path.resolve('.studio/temp_schema_tests');
  let storage: FileSystemStorage;
  let evidenceStore: EvidenceStore;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new FileSystemStorage(testDir);
    evidenceStore = new EvidenceStore(storage);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('20.10 & 20.11: Manifest Reproducibility & Schema Versioning', () => {
    it('produces deterministic manifests with sorted shot IDs and model IDs', async () => {
      const mockRun: ProductionRun = {
        schemaVersion: 1,
        revision: 1,
        runId: 'run_repro_test',
        projectId: 'proj_repro',
        seriesId: 'series_repro',
        status: 'COMPLETED',
        mode: 'LOCAL',
        pilotMode: true,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:10:00.000Z',
        currentStage: 'COMPLETED',
        completedShotIds: ['SHOT_03', 'SHOT_01', 'SHOT_02'],
        pendingShotIds: [],
        blockedShotIds: [],
        providerJobs: {},
        mediaEvidence: {},
        qaEvidence: {},
        approvalEvidence: {},
        approvalChallenges: {},
        resumeMetadata: { canResume: false },
      };

      const masterEv = {
        manifestId: 'manifest_01',
        sequenceId: 'seq_01',
        masterVideoPath: 'renders/master.mp4',
        masterSha256: 'a'.repeat(64),
        sizeBytes: 1048576,
        durationSeconds: 12.5,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        fps: 24,
        verifiedAt: '2026-09-24T00:09:00.000Z',
        verificationStatus: 'OFFLINE_REHEARSAL_VERIFIED' as const,
        checksSummary: { mediaIntegrity: true },
      };

      // Unsorted shot IDs input: SHOT_03, SHOT_01, SHOT_02
      const build1 = await ProductionAcceptanceBundle.build({
        projectId: 'proj_repro',
        runId: 'run_repro_test',
        storage,
        run: mockRun,
        masterEvidence: masterEv,
        requiredShotIds: ['SHOT_03', 'SHOT_01', 'SHOT_02'],
        providerModelIds: ['gemini-pro', 'gemini-flash'],
      });

      expect(build1.metadata.requiredShotIds).toEqual(['SHOT_01', 'SHOT_02', 'SHOT_03']);
      expect(build1.metadata.providerModelIds).toEqual(['gemini-flash', 'gemini-pro']);
      expect(build1.manifest.manifestSha256).toBeDefined();

      // Second build with different input ordering: SHOT_02, SHOT_03, SHOT_01
      const build2 = await ProductionAcceptanceBundle.build({
        projectId: 'proj_repro',
        runId: 'run_repro_test',
        storage,
        run: mockRun,
        masterEvidence: masterEv,
        requiredShotIds: ['SHOT_02', 'SHOT_03', 'SHOT_01'],
        providerModelIds: ['gemini-flash', 'gemini-pro'],
      });

      // Output shot ordering and file listings must be deterministically identical
      expect(build2.metadata.requiredShotIds).toEqual(['SHOT_01', 'SHOT_02', 'SHOT_03']);
      expect(Object.keys(build2.manifest.files)).toEqual(Object.keys(build1.manifest.files));
      expect(build2.manifest.files['provider-evidence.json'].sha256).toBe(
        build1.manifest.files['provider-evidence.json'].sha256
      );
      expect(build2.manifest.files['master-evidence.json'].sha256).toBe(
        build1.manifest.files['master-evidence.json'].sha256
      );
    });

    it('verifies explicit schemaVersion and revision markers on ProductionRun', () => {
      const run = ProductionRunSchema.parse({
        runId: 'run_schema_test',
        projectId: 'proj_schema',
        seriesId: 'series_schema',
      });

      expect(run.schemaVersion).toBe(1);
      expect(run.revision).toBe(1);
      expect(run.pilotMode).toBe(false);
    });
  });

  describe('20.12 & 20.13: Storage Backward Compatibility & Migration Safety', () => {
    it('safely migrates a legacy Phase 18 run without newest fields', () => {
      const legacyRaw = {
        runId: 'run_legacy_01',
        projectId: 'proj_legacy',
        seriesId: 'series_legacy',
        status: 'READY',
        mode: 'PRODUCTION',
        currentStage: 'init',
        // Deliberately omit schemaVersion, revision, pilotMode, approvalChallenges, resumeMetadata
      };

      const migrated = migrateProductionRun(legacyRaw);
      expect(migrated.schemaVersion).toBe(1);
      expect(migrated.revision).toBe(1);
      expect(migrated.pilotMode).toBe(false);
      expect(migrated.approvalChallenges).toEqual({});
      expect(migrated.resumeMetadata.canResume).toBe(true);
    });

    it('NEVER defaults missing approvalType to HUMAN during migration', () => {
      const legacyApprovalRaw = {
        runId: 'run_legacy_app',
        projectId: 'proj_legacy',
        seriesId: 'series_legacy',
        approvalEvidence: {
          SHOT_01: {
            shotId: 'SHOT_01',
            candidateAssetId: 'asset_c1',
            status: 'APPROVED',
            decidedBy: 'Operator',
            decidedAt: '2026-09-24T00:00:00.000Z',
            // approvalType is missing!
          },
        },
      };

      const migrated = migrateProductionRun(legacyApprovalRaw);
      expect(migrated.approvalEvidence['SHOT_01'].approvalType).toBe('AUTOMATED_TEST');
      expect(migrated.approvalEvidence['SHOT_01'].approvalType).not.toBe('HUMAN');
    });

    it('NEVER defaults missing generationSource to GOOGLE_FLOW_REAL during migration', () => {
      const legacyMediaRaw = {
        runId: 'run_legacy_med',
        projectId: 'proj_legacy',
        seriesId: 'series_legacy',
        mediaEvidence: {
          SHOT_01: {
            shotId: 'SHOT_01',
            assetId: 'asset_01',
            physicalPath: 'path/to/video.mp4',
            sha256: 'b'.repeat(64),
            sizeBytes: 5000,
            container: 'mp4',
            videoCodec: 'h264',
            width: 1920,
            height: 1080,
            durationSeconds: 5.0,
            verificationTimestamp: '2026-09-24T00:00:00.000Z',
            provenance: 'legacy import',
            // generationSource is missing!
          },
        },
      };

      const migrated = migrateProductionRun(legacyMediaRaw);
      expect(migrated.mediaEvidence['SHOT_01'].generationSource).toBe('SIMULATED_FLOW');
      expect(migrated.mediaEvidence['SHOT_01'].generationSource).not.toBe('GOOGLE_FLOW_REAL');
    });

    it('rejects invalid or non-object input cleanly with ProductionSafetyError', () => {
      expect(() => migrateProductionRun(null)).toThrow(ProductionSafetyError);
      expect(() => migrateProductionRun('not-an-object')).toThrow(ProductionSafetyError);
    });

    it('loads legacy persisted run from disk applying migration transparently', async () => {
      const legacyOnDisk = {
        runId: 'run_disk_compat',
        projectId: 'proj_compat',
        seriesId: 'series_compat',
        status: 'READY',
      };

      const dir = evidenceStore.getProductionDir('proj_compat', 'run_disk_compat');
      await storage.writeJson(`${dir}/production-run.json`, legacyOnDisk);

      const loaded = await evidenceStore.loadProductionRun('proj_compat', 'run_disk_compat');
      expect(loaded).not.toBeNull();
      expect(loaded?.schemaVersion).toBe(1);
      expect(loaded?.revision).toBe(1);
      expect(loaded?.pilotMode).toBe(false);
    });
  });
});
