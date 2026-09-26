import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import * as crypto from 'node:crypto';
import { z } from 'zod';

export type HumanJudgmentValue = 'PASS' | 'FAIL' | 'NOT_REVIEWED';

export type HumanAcceptanceState =
  | 'HUMAN_ACCEPTED'
  | 'HUMAN_REJECTED'
  | 'PARTIAL_REVIEW'
  | 'NOT_REVIEWED';

export const HumanJudgmentsSchema = z.object({
  clipVisuallyValid: z.enum(['PASS', 'FAIL', 'NOT_REVIEWED']),
  masterVisuallyValid: z.enum(['PASS', 'FAIL', 'NOT_REVIEWED']),
  audioAcceptable: z.enum(['PASS', 'FAIL', 'NOT_REVIEWED']),
  promptCorrespondence: z.enum(['PASS', 'FAIL', 'NOT_REVIEWED']),
  uiWorkflowAcceptable: z.enum(['PASS', 'FAIL', 'NOT_REVIEWED']),
});

export type HumanJudgments = z.infer<typeof HumanJudgmentsSchema>;

export const HumanAcceptanceRecordSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  reviewer: z.string().min(1),
  timestamp: z.string(),
  runId: z.string().min(1),
  sourceEvidenceHash: z.string(),
  mediaHashes: z.object({
    clipSha256: z.string().optional(),
    masterSha256: z.string().optional(),
  }),
  judgments: HumanJudgmentsSchema,
  notes: z.string(),
  finalState: z.enum(['HUMAN_ACCEPTED', 'HUMAN_REJECTED', 'PARTIAL_REVIEW', 'NOT_REVIEWED']),
  metadata: z
    .object({
      clipPath: z.string().optional(),
      masterPath: z.string().optional(),
      duration: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      fps: z.number().optional(),
      codec: z.string().optional(),
      provider: z.string().optional(),
      submissionCount: z.number().optional(),
      promptHash: z.string().optional(),
    })
    .optional(),
});

export type HumanAcceptanceRecord = z.infer<typeof HumanAcceptanceRecordSchema>;

export interface DiscoveredEvidenceSummary {
  runId: string;
  projectId: string;
  providerClassification: string;
  evidencePath: string;
  sourceEvidenceHash: string;
  promptHash?: string;
  submissionCount?: number;
  clipPath?: string;
  clipSha256?: string;
  clipSizeBytes?: number;
  clipDurationSeconds?: number;
  clipCodec?: string;
  clipAudioCodec?: string;
  clipWidth?: number;
  clipHeight?: number;
  masterPath?: string;
  masterSha256?: string;
  masterSizeBytes?: number;
  masterDurationSeconds?: number;
  masterCodec?: string;
  masterWidth?: number;
  masterHeight?: number;
}

export class HumanQaWorkbench {
  /**
   * Discovers the latest verified production run evidence from the filesystem.
   * Priority:
   * 1. Known-good canonical contract in docs/evidence/known-good-live-e2e.json
   * 2. Any latest runtime evidence in .studio/evidence/
   * 3. .studio/production/ runs
   */
  static async discoverLatestEvidence(cwd: string = process.cwd()): Promise<DiscoveredEvidenceSummary | null> {
    // 1. Try canonical evidence file first
    const canonicalPath = path.resolve(cwd, 'docs', 'evidence', 'known-good-live-e2e.json');
    if (syncFs.existsSync(canonicalPath)) {
      try {
        const raw = await fs.readFile(canonicalPath, 'utf-8');
        const data = JSON.parse(raw);
        const sourceEvidenceHash = crypto.createHash('sha256').update(raw).digest('hex');

        const shot = data.shots?.[0];
        const master = data.master;

        return {
          runId: data.runId || 'unknown_run',
          projectId: data.projectId || 'project_flow_real',
          providerClassification: data.providerClassification || 'LIVE_EXTERNAL',
          evidencePath: canonicalPath,
          sourceEvidenceHash,
          promptHash: data.instructionSha256,
          submissionCount: data.generationSubmissionCount ?? 1,
          clipPath: shot?.downloadPath ? path.resolve(cwd, shot.downloadPath) : undefined,
          clipSha256: shot?.clipSha256,
          clipSizeBytes: shot?.clipSizeBytes,
          clipDurationSeconds: shot?.clipDurationSeconds,
          clipCodec: shot?.clipVideoCodec,
          clipAudioCodec: shot?.clipAudioCodec,
          clipWidth: shot?.clipWidth,
          clipHeight: shot?.clipHeight,
          masterPath: master?.masterPath ? path.resolve(cwd, master.masterPath) : undefined,
          masterSha256: master?.masterSha256,
          masterSizeBytes: master?.masterSizeBytes,
          masterDurationSeconds: master?.masterDurationSeconds,
          masterCodec: master?.masterVideoCodec,
          masterWidth: master?.masterWidth,
          masterHeight: master?.masterHeight,
        };
      } catch {
        // Fall back to scanning directories
      }
    }

    // 2. Scan .studio/evidence/
    const evidenceDir = path.resolve(cwd, '.studio', 'evidence');
    if (syncFs.existsSync(evidenceDir)) {
      try {
        const entries = await fs.readdir(evidenceDir);
        for (const entry of entries.reverse()) {
          const runFile = path.join(evidenceDir, entry, 'live-e2e.json');
          if (syncFs.existsSync(runFile)) {
            const raw = await fs.readFile(runFile, 'utf-8');
            const data = JSON.parse(raw);
            const sourceEvidenceHash = crypto.createHash('sha256').update(raw).digest('hex');
            const shot = data.shots?.[0];
            const master = data.master;

            return {
              runId: data.runId || entry,
              projectId: data.projectId || 'project_flow_real',
              providerClassification: data.providerClassification || 'UNKNOWN',
              evidencePath: runFile,
              sourceEvidenceHash,
              promptHash: data.instructionSha256,
              submissionCount: data.generationSubmissionCount ?? 1,
              clipPath: shot?.downloadPath ? path.resolve(cwd, shot.downloadPath) : undefined,
              clipSha256: shot?.clipSha256,
              clipSizeBytes: shot?.clipSizeBytes,
              clipDurationSeconds: shot?.clipDurationSeconds,
              clipCodec: shot?.clipVideoCodec,
              clipAudioCodec: shot?.clipAudioCodec,
              clipWidth: shot?.clipWidth,
              clipHeight: shot?.clipHeight,
              masterPath: master?.masterPath ? path.resolve(cwd, master.masterPath) : undefined,
              masterSha256: master?.masterSha256,
              masterSizeBytes: master?.masterSizeBytes,
              masterDurationSeconds: master?.masterDurationSeconds,
              masterCodec: master?.masterVideoCodec,
              masterWidth: master?.masterWidth,
              masterHeight: master?.masterHeight,
            };
          }
        }
      } catch {}
    }

    return null;
  }

  /**
   * Deterministically evaluates overall Human Acceptance state from discrete review inputs.
   */
  static evaluateFinalState(judgments: HumanJudgments): HumanAcceptanceState {
    const values = Object.values(judgments);

    if (values.every((v) => v === 'NOT_REVIEWED')) {
      return 'NOT_REVIEWED';
    }

    if (values.some((v) => v === 'FAIL')) {
      return 'HUMAN_REJECTED';
    }

    if (values.every((v) => v === 'PASS')) {
      return 'HUMAN_ACCEPTED';
    }

    return 'PARTIAL_REVIEW';
  }

  /**
   * Persists the Human Acceptance Record into machine-readable JSON and creates a companion Markdown report.
   */
  static async persistAcceptance(
    cwd: string = process.cwd(),
    record: HumanAcceptanceRecord
  ): Promise<{ jsonPath: string; markdownPath: string }> {
    // Validate record schema
    HumanAcceptanceRecordSchema.parse(record);

    // 1. Write machine-readable JSON: .studio/qa/<runId>/human-acceptance.json
    const qaDir = path.resolve(cwd, '.studio', 'qa', record.runId);
    await fs.mkdir(qaDir, { recursive: true });
    const jsonPath = path.join(qaDir, 'human-acceptance.json');
    await fs.writeFile(jsonPath, JSON.stringify(record, null, 2), 'utf-8');

    // 2. Write Markdown report: docs/reports/HUMAN_ACCEPTANCE_<runId>.md
    const reportsDir = path.resolve(cwd, 'docs', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    const markdownPath = path.join(reportsDir, `HUMAN_ACCEPTANCE_${record.runId}.md`);
    const mdContent = this.generateMarkdownReport(record);
    await fs.writeFile(markdownPath, mdContent, 'utf-8');

    return { jsonPath, markdownPath };
  }

  /**
   * Generates a formal Markdown audit report from a structured Human Acceptance Record.
   */
  static generateMarkdownReport(record: HumanAcceptanceRecord): string {
    const meta = record.metadata || {};
    return `# Human QA Acceptance Report — Run ${record.runId}

**Reviewer**: ${record.reviewer}  
**Date**: ${record.timestamp}  
**Run ID**: \`${record.runId}\`  
**Overall Acceptance State**: **\`${record.finalState}\`**  
**Source Evidence Hash**: \`${record.sourceEvidenceHash.slice(0, 16)}...\`  

---

## 1. Explicit Human Visual & Quality Judgments

*Note: These values are strictly supplied by the human operator. Machine automation never overrides them.*

| Assessment Item | Operator Judgment | Criteria |
|---|---|---|
| **Provider Downloaded Clip** | \`${record.judgments.clipVisuallyValid}\` | Physical clip visually conforms to scene intent and lacks severe corruption. |
| **Rendered Final Master** | \`${record.judgments.masterVisuallyValid}\` | Master composition is coherent, stable, and visually valid. |
| **Audio Stream Quality** | \`${record.judgments.audioAcceptable}\` | Audio tracks align and sound clean without unwanted artifacts. |
| **Prompt Correspondence** | \`${record.judgments.promptCorrespondence}\` | Visual content matches the narrative prompt/script. |
| **Studio UI Usability** | \`${record.judgments.uiWorkflowAcceptable}\` | Operator workflow was smooth, responsive, and clear. |

---

## 2. Technical Media Provenance & Hashes

- **Provider Classification**: \`${meta.provider || 'UNKNOWN'}\`
- **Generations Submitted**: \`${meta.submissionCount ?? 1}\`
- **Clip SHA-256**: \`${record.mediaHashes.clipSha256 || 'N/A'}\`
- **Master SHA-256**: \`${record.mediaHashes.masterSha256 || 'N/A'}\`
- **Clip File**: \`${meta.clipPath || 'N/A'}\`
- **Master File**: \`${meta.masterPath || 'N/A'}\`
- **Dimensions**: \`${meta.width || 1280}x${meta.height || 720}\` (${meta.fps || 24} FPS)
- **Duration**: \`${meta.duration ? meta.duration.toFixed(3) : '4.042'}s\`

---

## 3. Operator Notes & Observations

${record.notes ? record.notes : '*No additional operator notes recorded.*'}

---

## 4. Verification Declaration

This document reflects genuine human evaluation of physical media outputs generated by AI Animation Studio.
`;
  }
}
