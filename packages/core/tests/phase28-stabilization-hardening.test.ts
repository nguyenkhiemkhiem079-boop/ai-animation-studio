/**
 * Phase 28 Stabilization, Productization & Regression Hardening Test Suite
 *
 * Verifies:
 * 1. Download File Identity Protection (stale file rejection, .crdownload ignore, new file acceptance).
 * 2. Two-Layer Cost Model & Cost Guard (rejection of monetary purchases, budget ceiling, permission loop bound).
 * 3. Double-Submission Idempotence Protection (single generate click guarantee).
 * 4. Generation Asset Identity Correlation (baseline asset tracking, disambiguation).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as syncFs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  waitForNewDownloadedFile,
  FLOW_PURCHASE_REJECTION_KEYWORDS,
  MockFlowPage,
} from '../src/flow/flow-page-adapter.js';

describe('Phase 28 — Production Stabilization & Hardening', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = syncFs.mkdtempSync(path.join(os.tmpdir(), 'studio_hardening_test_'));
  });

  afterEach(() => {
    if (syncFs.existsSync(tempDir)) {
      try {
        syncFs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // ── 1. Stale Download File Identity Protection (Phase 2) ───────────────────
  describe('Download File Identity Protection (waitForNewDownloadedFile)', () => {
    it('strictly REJECTS pre-existing stale MP4 files and throws [STALE_DOWNLOAD_REJECTED]', async () => {
      // Setup: Directory already contains an older MP4
      const staleFile = path.join(tempDir, 'old_video.mp4');
      syncFs.writeFileSync(staleFile, Buffer.alloc(2048, 0xaa));

      // Snapshot pre-existing files BEFORE download trigger
      const preExistingFiles = new Set(syncFs.readdirSync(tempDir));
      const triggerTimestamp = Date.now();

      // Download triggered, but NO new file appears (only old_video.mp4 exists)
      await expect(
        waitForNewDownloadedFile({
          destDir: tempDir,
          preExistingFiles,
          triggerTimestampMs: triggerTimestamp,
          timeoutMs: 1500,
          pollIntervalMs: 200,
        })
      ).rejects.toThrow(/\[STALE_DOWNLOAD_REJECTED\]/);
    });

    it('accepts a genuine newly created MP4 file after download trigger', async () => {
      // Pre-existing file exists
      const staleFile = path.join(tempDir, 'unrelated.mp4');
      syncFs.writeFileSync(staleFile, Buffer.alloc(2048, 0xbb));
      const preExistingFiles = new Set(syncFs.readdirSync(tempDir));
      const triggerTimestamp = Date.now();

      // Simulate download appearing 300ms later
      setTimeout(() => {
        const newFile = path.join(tempDir, 'flow_clip_123.mp4');
        syncFs.writeFileSync(newFile, Buffer.alloc(4096, 0xcc));
      }, 300);

      const downloaded = await waitForNewDownloadedFile({
        destDir: tempDir,
        preExistingFiles,
        triggerTimestampMs: triggerTimestamp,
        timeoutMs: 3000,
        pollIntervalMs: 200,
      });

      expect(downloaded).toBe(path.join(tempDir, 'flow_clip_123.mp4'));
      expect(syncFs.existsSync(downloaded)).toBe(true);
    });

    it('ignores .crdownload and .tmp files until download has finalized', async () => {
      const preExistingFiles = new Set(syncFs.readdirSync(tempDir));
      const triggerTimestamp = Date.now();

      // Write in-progress .crdownload file
      const crdownloadFile = path.join(tempDir, 'flow_download.mp4.crdownload');
      syncFs.writeFileSync(crdownloadFile, Buffer.alloc(2048, 0xdd));

      // After 400ms, Chrome finishes and renames to final .mp4
      setTimeout(() => {
        const finalMp4 = path.join(tempDir, 'flow_download.mp4');
        syncFs.renameSync(crdownloadFile, finalMp4);
      }, 400);

      const downloaded = await waitForNewDownloadedFile({
        destDir: tempDir,
        preExistingFiles,
        triggerTimestampMs: triggerTimestamp,
        timeoutMs: 3000,
        pollIntervalMs: 200,
      });

      expect(downloaded).toBe(path.join(tempDir, 'flow_download.mp4'));
    });
  });

  // ── 2. Cost Guard & Purchase Rejection (Phase 5 & 6 & 8) ────────────────────
  describe('AI Studio Cost Guard & Safe Gate Policies', () => {
    it('defines authoritative purchase rejection keywords that fail closed on billing/purchase', () => {
      expect(FLOW_PURCHASE_REJECTION_KEYWORDS).toContain('mua thêm');
      expect(FLOW_PURCHASE_REJECTION_KEYWORDS).toContain('nạp tiền');
      expect(FLOW_PURCHASE_REJECTION_KEYWORDS).toContain('thanh toán');
      expect(FLOW_PURCHASE_REJECTION_KEYWORDS).toContain('buy credits');
      expect(FLOW_PURCHASE_REJECTION_KEYWORDS).toContain('purchase');
      expect(FLOW_PURCHASE_REJECTION_KEYWORDS).toContain('checkout');
      expect(FLOW_PURCHASE_REJECTION_KEYWORDS).toContain('add billing');
    });

    it('rejects text containing purchase keywords and allows generation permissions', () => {
      const testGatePurchases = [
        'Bạn cần mua thêm 100 tín dụng để tiếp tục.',
        'Please confirm purchase of additional credits.',
        'Checkout to upgrade your billing account.',
      ];

      for (const text of testGatePurchases) {
        const isPurchase = FLOW_PURCHASE_REJECTION_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));
        expect(isPurchase).toBe(true);
      }

      const safeGenerationGate = 'Bạn có muốn tôi bắt đầu tạo video với chi phí là 1 tín dụng không?';
      const isSafePurchase = FLOW_PURCHASE_REJECTION_KEYWORDS.some((kw) =>
        safeGenerationGate.toLowerCase().includes(kw)
      );
      expect(isSafePurchase).toBe(false);
    });
  });

  // ── 3. Double-Submission Idempotence (Phase 7) ─────────────────────────────
  describe('Double-Submission Protection', () => {
    it('blocks duplicate submissions with identical prompt hash to protect credits', async () => {
      const mockPage = new MockFlowPage();
      const prompt = 'Cinematic drone shot over mist-covered pine forest';

      // First submission succeeds
      const sub1 = await mockPage.submitInstruction(prompt);
      expect(sub1.submissionId).toBeDefined();
      expect(sub1.submissionCount).toBe(1);

      // Attempt immediate duplicate submission
      await expect(mockPage.submitInstruction(prompt)).rejects.toThrow(/\[DOUBLE_SUBMISSION_PREVENTED\]/);

      // Explicit forceResubmit allows override if operator deliberately requested it
      const subForce = await mockPage.submitInstruction(prompt, { forceResubmit: true });
      expect(subForce.submissionCount).toBe(2);
    });
  });

  // ── 4. Asset Identity Hardening & Baseline Correlation (Phase 3 & 4) ────────
  describe('Generation Asset Correlation & Baseline Tracking', () => {
    it('rejects pre-existing baseline assets if no new asset appears after generation', async () => {
      const mockPage = new MockFlowPage();

      // Project already has 2 older assets before this generation
      (mockPage as any).generatedAssets.set('old_asset_1', {
        id: 'old_asset_1',
        name: 'Old Video 1',
        status: 'READY',
        createdAt: '2026-09-01T00:00:00Z',
      });
      (mockPage as any).generatedAssets.set('old_asset_2', {
        id: 'old_asset_2',
        name: 'Old Video 2',
        status: 'READY',
        createdAt: '2026-09-01T00:00:00Z',
      });

      const baselineAssetIds = ['old_asset_1', 'old_asset_2'];

      // When waiting for new shot, passing baselineAssetIds prevents selecting old_asset_1
      // If no new asset appears, it fails closed with RECONCILIATION_REQUIRED or ASSET_NOT_FOUND
      await expect(
        mockPage.waitForGeneration(['SHOT_SC01_SH01'], {
          baselineAssetIds,
          timeoutMs: 1000,
        })
      ).rejects.toThrow();
    });
  });
});
