/**
 * Long-Run Mission Manifest & Resume Contract
 *
 * Persists mission continuity state across long-running autonomous execution,
 * handling agent handoffs, quota exhaustion, and deterministic resumption.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { QuotaStateMapSchema, QuotaStateMap, createDefaultQuotaState } from './agent-quota-state.js';

export type EngineeringOwner = 'ANTIGRAVITY' | 'GEMINI_FALLBACK';

export const FallbackHistorySchema = z.object({
  primaryAgentQuotaEvents: z.number().int().nonnegative().default(0),
  geminiEngineeringFallbackUsed: z.boolean().default(false),
  geminiEngineeringRequestCount: z.number().int().nonnegative().default(0),
  geminiEngineeringModelsUsed: z.array(z.string()).default([]),
  fallbackCommits: z.array(z.string()).default([]),
  primaryAgentTakeovers: z.number().int().nonnegative().default(0),
  dualQuotaBlockEvents: z.number().int().nonnegative().default(0),
  paidVideoApiUsed: z.literal(false).default(false),
});

export type FallbackHistory = z.infer<typeof FallbackHistorySchema>;

export const LongRunManifestSchema = z.object({
  missionId: z.string().default('long-run-production-completion'),
  activeEngineeringOwner: z.enum(['ANTIGRAVITY', 'GEMINI_FALLBACK']).default('ANTIGRAVITY'),
  currentPhase: z.string().default('PHASE_28_PROJECT_WORKSPACE_CALIBRATION_AND_END_TO_END_PATH'),
  repositoryHead: z.string(),
  lastGreenHead: z.string(),
  updatedAt: z.string(),
  quotaState: QuotaStateMapSchema.default(createDefaultQuotaState()),
  completedTasks: z.array(z.string()).default([]),
  remainingTasks: z.array(z.string()).default([]),
  nextExactAction: z.string(),
  firstCommandToRun: z.string(),
  fallbackHistory: FallbackHistorySchema.default({
    primaryAgentQuotaEvents: 0,
    geminiEngineeringFallbackUsed: false,
    geminiEngineeringRequestCount: 0,
    geminiEngineeringModelsUsed: [],
    fallbackCommits: [],
    primaryAgentTakeovers: 0,
    dualQuotaBlockEvents: 0,
    paidVideoApiUsed: false,
  }),
});

export type LongRunManifest = z.infer<typeof LongRunManifestSchema>;

export class LongRunManifestManager {
  private readonly runtimeDir: string;
  private readonly manifestPath: string;
  private readonly resumeMdPath: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.runtimeDir = path.join(workspaceRoot, '.studio', 'agent-runtime');
    this.manifestPath = path.join(this.runtimeDir, 'long-run-manifest.json');
    this.resumeMdPath = path.join(this.runtimeDir, 'RESUME.md');
  }

  public getManifestPath(): string {
    return this.manifestPath;
  }

  public getResumeMdPath(): string {
    return this.resumeMdPath;
  }

  public manifestExists(): boolean {
    return fs.existsSync(this.manifestPath);
  }

  public loadManifest(): LongRunManifest {
    if (!fs.existsSync(this.manifestPath)) {
      throw new Error(`[MANIFEST_NOT_FOUND] Long-run manifest not found at ${this.manifestPath}`);
    }
    const raw = fs.readFileSync(this.manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return LongRunManifestSchema.parse(parsed);
  }

  public saveManifest(manifest: LongRunManifest): void {
    if (!fs.existsSync(this.runtimeDir)) {
      fs.mkdirSync(this.runtimeDir, { recursive: true });
    }
    const validated = LongRunManifestSchema.parse(manifest);
    fs.writeFileSync(this.manifestPath, JSON.stringify(validated, null, 2), 'utf8');
    this.generateResumeMd(validated);
  }

  public initialize(options: {
    head: string;
    currentPhase: string;
    completedTasks?: string[];
    remainingTasks?: string[];
    nextExactAction: string;
    firstCommandToRun: string;
  }): LongRunManifest {
    const manifest: LongRunManifest = {
      missionId: 'long-run-production-completion',
      activeEngineeringOwner: 'ANTIGRAVITY',
      currentPhase: options.currentPhase,
      repositoryHead: options.head,
      lastGreenHead: options.head,
      updatedAt: new Date().toISOString(),
      quotaState: createDefaultQuotaState(),
      completedTasks: options.completedTasks || [],
      remainingTasks: options.remainingTasks || [],
      nextExactAction: options.nextExactAction,
      firstCommandToRun: options.firstCommandToRun,
      fallbackHistory: {
        primaryAgentQuotaEvents: 0,
        geminiEngineeringFallbackUsed: false,
        geminiEngineeringRequestCount: 0,
        geminiEngineeringModelsUsed: [],
        fallbackCommits: [],
        primaryAgentTakeovers: 0,
        dualQuotaBlockEvents: 0,
        paidVideoApiUsed: false,
      },
    };
    this.saveManifest(manifest);
    return manifest;
  }

  public updateOwner(newOwner: EngineeringOwner, head: string): LongRunManifest {
    const manifest = this.loadManifest();
    manifest.activeEngineeringOwner = newOwner;
    manifest.repositoryHead = head;
    manifest.updatedAt = new Date().toISOString();
    if (newOwner === 'ANTIGRAVITY' && manifest.fallbackHistory.geminiEngineeringFallbackUsed) {
      manifest.fallbackHistory.primaryAgentTakeovers += 1;
    }
    this.saveManifest(manifest);
    return manifest;
  }

  public updateQuota(updates: Partial<QuotaStateMap>): LongRunManifest {
    const manifest = this.loadManifest();
    manifest.quotaState = {
      ...manifest.quotaState,
      ...updates,
      paidVideoApi: 'DISABLED',
    };
    manifest.updatedAt = new Date().toISOString();
    if (updates.primaryAgent === 'EXHAUSTED') {
      manifest.fallbackHistory.primaryAgentQuotaEvents += 1;
    }
    if (manifest.quotaState.primaryAgent === 'EXHAUSTED' && manifest.quotaState.geminiEngineering === 'EXHAUSTED') {
      manifest.fallbackHistory.dualQuotaBlockEvents += 1;
    }
    this.saveManifest(manifest);
    return manifest;
  }

  public generateResumeMd(manifest: LongRunManifest): string {
    const content = `# AI ANIMATION STUDIO — MISSION RESUME CONTRACT

**Mission ID**: \`${manifest.missionId}\`
**Active Engineering Owner**: \`${manifest.activeEngineeringOwner}\`
**Current Phase**: \`${manifest.currentPhase}\`
**Repository HEAD**: \`${manifest.repositoryHead}\`
**Last Green HEAD**: \`${manifest.lastGreenHead}\`
**Last Updated**: \`${manifest.updatedAt}\`

---

## 1. Quota State Matrix

| Quota Subsystem | Status | Policy |
| :--- | :--- | :--- |
| **Primary Agent (Antigravity/Codex)** | \`${manifest.quotaState.primaryAgent}\` | Primary driver |
| **Gemini Engineering Quota** | \`${manifest.quotaState.geminiEngineering}\` | Coding & reasoning fallback worker |
| **Gemini Visual QA Quota** | \`${manifest.quotaState.geminiVisualQA}\` | Production multimodal QA |
| **Google Flow Credits** | \`${manifest.quotaState.flowCredits}\` | External media generation |
| **Paid Video API** | \`${manifest.quotaState.paidVideoApi}\` | STRICTLY DISABLED (FREE_ONLY) |

---

## 2. Immediate Execution Continuity

- **Next Exact Action**: \`${manifest.nextExactAction}\`
- **First Command to Run**:
  \`\`\`bash
  ${manifest.firstCommandToRun}
  \`\`\`

---

## 3. Completed Tasks
${manifest.completedTasks.map((t) => `- [x] ${t}`).join('\n') || '- None recorded yet'}

## 4. Remaining Critical Path Tasks
${manifest.remainingTasks.map((t) => `- [ ] ${t}`).join('\n') || '- All recorded critical tasks complete'}

---

## 5. Fallback History & Quota Telemetry

- **Primary Agent Quota Events**: ${manifest.fallbackHistory.primaryAgentQuotaEvents}
- **Gemini Fallback Used**: ${manifest.fallbackHistory.geminiEngineeringFallbackUsed ? 'YES' : 'NO'}
- **Gemini Fallback Requests**: ${manifest.fallbackHistory.geminiEngineeringRequestCount}
- **Gemini Models Used**: ${manifest.fallbackHistory.geminiEngineeringModelsUsed.join(', ') || 'None'}
- **Fallback Commits**: ${manifest.fallbackHistory.fallbackCommits.length}
- **Primary Agent Takeovers**: ${manifest.fallbackHistory.primaryAgentTakeovers}
- **Dual Quota Block Events**: ${manifest.fallbackHistory.dualQuotaBlockEvents}
- **Paid Video API Used**: NO
`;
    fs.writeFileSync(this.resumeMdPath, content, 'utf8');
    return content;
  }
}
