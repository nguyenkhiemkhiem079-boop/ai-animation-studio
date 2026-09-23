import * as path from 'node:path';
import * as fs from 'node:fs';
import { IStorageProvider } from '../storage/index.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { LLMProvider } from '../llm/llm-provider.js';
import { ProductionOrchestrator } from './production-orchestrator.js';
import { ProductionRun } from '../domain/production-run.js';
import { EvidenceStore } from '../production-evidence/evidence-store.js';

export interface PilotExecutionResult {
  run: ProductionRun;
  evidenceStore: EvidenceStore;
  stoppedReason: string;
  nextStepCommand: string;
  allEvidencePersisted: boolean;
}

export class CanonicalProductionPilot {
  public static readonly CANONICAL_STORY =
    'Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.';

  public static async run(
    storage: IStorageProvider,
    assetRegistry: IAssetRegistry,
    options: {
      projectId?: string;
      seriesId?: string;
      mode?: 'MOCK' | 'LOCAL' | 'PRODUCTION';
      llm?: LLMProvider;
    } = {}
  ): Promise<PilotExecutionResult> {
    const projectId = options.projectId || 'proj_phase18_pilot';
    const seriesId = options.seriesId || 'series_phase18_pilot';
    const mode = options.mode || 'LOCAL';

    const orchestrator = new ProductionOrchestrator(storage, assetRegistry, options.llm);
    const evidenceStore = new EvidenceStore(storage);

    // 1. Create run
    const createdRun = await orchestrator.createRun({
      projectId,
      seriesId,
      rawScript: this.CANONICAL_STORY,
      mode,
    });

    // 2. Initial execution
    const executedRun = await orchestrator.execute(projectId, createdRun.runId);

    // Check evidence directory files
    const dir = evidenceStore.getProductionDir(projectId, executedRun.runId);
    const hasRunJson = await storage.exists(`${dir}/production-run.json`);

    return {
      run: executedRun,
      evidenceStore,
      stoppedReason: executedRun.resumeMetadata.nextAction || 'Awaiting next action',
      nextStepCommand: executedRun.resumeMetadata.recommendedCommand || `studio production status ${executedRun.runId}`,
      allEvidencePersisted: hasRunJson,
    };
  }
}
