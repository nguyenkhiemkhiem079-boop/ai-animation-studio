import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import {
  HumanQaWorkbench,
  HumanAcceptanceRecord,
  HumanJudgments,
} from '../src/qa/human-qa-workbench.js';

describe('Phase 30: HumanQaWorkbench', () => {
  const testCwd = path.resolve(process.cwd(), '.studio', 'scratch', 'test_human_qa');

  beforeEach(async () => {
    await fs.mkdir(testCwd, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testCwd, { recursive: true, force: true });
    } catch {}
  });

  it('evaluates final acceptance state deterministically', () => {
    const allNotReviewed: HumanJudgments = {
      clipVisuallyValid: 'NOT_REVIEWED',
      masterVisuallyValid: 'NOT_REVIEWED',
      audioAcceptable: 'NOT_REVIEWED',
      promptCorrespondence: 'NOT_REVIEWED',
      uiWorkflowAcceptable: 'NOT_REVIEWED',
    };
    expect(HumanQaWorkbench.evaluateFinalState(allNotReviewed)).toBe('NOT_REVIEWED');

    const allPass: HumanJudgments = {
      clipVisuallyValid: 'PASS',
      masterVisuallyValid: 'PASS',
      audioAcceptable: 'PASS',
      promptCorrespondence: 'PASS',
      uiWorkflowAcceptable: 'PASS',
    };
    expect(HumanQaWorkbench.evaluateFinalState(allPass)).toBe('HUMAN_ACCEPTED');

    const oneFail: HumanJudgments = {
      clipVisuallyValid: 'PASS',
      masterVisuallyValid: 'FAIL',
      audioAcceptable: 'PASS',
      promptCorrespondence: 'PASS',
      uiWorkflowAcceptable: 'PASS',
    };
    expect(HumanQaWorkbench.evaluateFinalState(oneFail)).toBe('HUMAN_REJECTED');

    const partial: HumanJudgments = {
      clipVisuallyValid: 'PASS',
      masterVisuallyValid: 'PASS',
      audioAcceptable: 'NOT_REVIEWED',
      promptCorrespondence: 'PASS',
      uiWorkflowAcceptable: 'NOT_REVIEWED',
    };
    expect(HumanQaWorkbench.evaluateFinalState(partial)).toBe('PARTIAL_REVIEW');
  });

  it('discovers latest known-good evidence from workspace', async () => {
    const evidence = await HumanQaWorkbench.discoverLatestEvidence(process.cwd());
    expect(evidence).not.toBeNull();
    if (evidence) {
      expect(evidence.runId).toBe('run_1790328582248');
      expect(evidence.providerClassification).toBe('LIVE_EXTERNAL');
      expect(evidence.masterSha256).toBe(
        'a9833c03c4c19c2928c9c1b1642ba25f34d7f8d43bf22ab9718ea0f3b38ad92b'
      );
      expect(evidence.clipSha256).toBe(
        'c680000747f4a2f6626f1d91f4951411c81f57246e3552b51f3fc0793650916d'
      );
    }
  });

  it('persists machine-readable acceptance record and generates markdown report', async () => {
    const record: HumanAcceptanceRecord = {
      schemaVersion: '1.0.0',
      reviewer: 'khiem.tester',
      timestamp: '2026-09-26T04:00:00.000Z',
      runId: 'run_test_acceptance_101',
      sourceEvidenceHash: 'abc123def456',
      mediaHashes: {
        clipSha256: 'clip_hash_123',
        masterSha256: 'master_hash_456',
      },
      judgments: {
        clipVisuallyValid: 'PASS',
        masterVisuallyValid: 'PASS',
        audioAcceptable: 'PASS',
        promptCorrespondence: 'PASS',
        uiWorkflowAcceptable: 'PASS',
      },
      notes: 'Crisp resolution and flawless character motion verified.',
      finalState: 'HUMAN_ACCEPTED',
      metadata: {
        duration: 4.042,
        width: 1280,
        height: 720,
        fps: 24,
        codec: 'h264',
        provider: 'GOOGLE_FLOW_REAL',
      },
    };

    const { jsonPath, markdownPath } = await HumanQaWorkbench.persistAcceptance(testCwd, record);

    expect(syncFs.existsSync(jsonPath)).toBe(true);
    expect(syncFs.existsSync(markdownPath)).toBe(true);

    const jsonRaw = await fs.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(jsonRaw);
    expect(parsed.finalState).toBe('HUMAN_ACCEPTED');
    expect(parsed.reviewer).toBe('khiem.tester');

    const mdRaw = await fs.readFile(markdownPath, 'utf-8');
    expect(mdRaw).toContain('# Human QA Acceptance Report — Run run_test_acceptance_101');
    expect(mdRaw).toContain('HUMAN_ACCEPTED');
    expect(mdRaw).toContain('Crisp resolution and flawless character motion verified.');
  });
});
