import * as path from 'node:path';
import { IStorageProvider } from '../storage/index.js';
import {
  ProductionRun,
  ProductionRunSchema,
  ProviderExecutionEvidence,
  ProviderExecutionEvidenceSchema,
  ProductionMediaEvidence,
  ProductionMediaEvidenceSchema,
  ProductionQAEvidence,
  ProductionQAEvidenceSchema,
  ProductionApprovalEvidence,
  ProductionApprovalEvidenceSchema,
  ProductionApprovalChallenge,
  ProductionApprovalChallengeSchema,
  MasterProductionEvidence,
  MasterProductionEvidenceSchema,
  migrateProductionRun,
} from '../domain/production-run.js';
import { z } from 'zod';
import { ProductionSafetyError } from '../domain/execution-mode.js';
import { assertSafeIdentifier, CorruptedEvidenceError } from '../domain/security.js';

export class EvidenceStore {
  constructor(private storage: IStorageProvider) {}

  public getProductionDir(projectId: string, runId: string): string {
    const safeProj = assertSafeIdentifier(projectId, 'projectId');
    const safeRun = assertSafeIdentifier(runId, 'runId');
    return path.join('.studio', 'production', safeProj, safeRun).replace(/\\/g, '/');
  }

  private async safeReadJson<T>(filePath: string): Promise<T> {
    try {
      return await this.storage.readJson<T>(filePath);
    } catch (err: any) {
      throw new CorruptedEvidenceError(filePath, err.message);
    }
  }

  // 1. Production Run
  public async saveProductionRun(run: ProductionRun, options?: { expectedRevision?: number }): Promise<void> {
    const dir = this.getProductionDir(run.projectId, run.runId);
    const filePath = `${dir}/production-run.json`;
    if (options?.expectedRevision !== undefined && (await this.storage.exists(filePath))) {
      const current = await this.loadProductionRun(run.projectId, run.runId);
      if (current && current.revision !== options.expectedRevision) {
        throw new ProductionSafetyError(
          `CONCURRENCY CONFLICT: Stale update rejected for run "${run.runId}". Expected revision ${options.expectedRevision}, but current revision is ${current.revision}.`
        );
      }
    }
    const validated = ProductionRunSchema.parse(run);
    await this.storage.writeJson(filePath, validated);
  }

  public async loadProductionRun(projectId: string, runId: string): Promise<ProductionRun | null> {
    const filePath = `${this.getProductionDir(projectId, runId)}/production-run.json`;
    if (!(await this.storage.exists(filePath))) return null;
    const data = await this.safeReadJson<unknown>(filePath);
    const parsed = migrateProductionRun(data);
    const challengesPath = `${this.getProductionDir(projectId, runId)}/approval-challenges.json`;
    if (await this.storage.exists(challengesPath)) {
      const challenges = await this.loadApprovalChallenges(projectId, runId);
      parsed.approvalChallenges = { ...challenges, ...(parsed.approvalChallenges || {}) };
    }
    return parsed;
  }

  // 2. Provider Evidence
  public async saveProviderEvidence(
    projectId: string,
    runId: string,
    records: ProviderExecutionEvidence[]
  ): Promise<void> {
    const validated = z.array(ProviderExecutionEvidenceSchema).parse(records);
    const dir = this.getProductionDir(projectId, runId);
    await this.storage.writeJson(`${dir}/provider-evidence.json`, validated);
  }

  public async loadProviderEvidence(
    projectId: string,
    runId: string
  ): Promise<ProviderExecutionEvidence[]> {
    const filePath = `${this.getProductionDir(projectId, runId)}/provider-evidence.json`;
    if (!(await this.storage.exists(filePath))) return [];
    const data = await this.safeReadJson<unknown>(filePath);
    return z.array(ProviderExecutionEvidenceSchema).parse(data);
  }

  public async appendProviderEvidence(
    projectId: string,
    runId: string,
    record: ProviderExecutionEvidence
  ): Promise<void> {
    const current = await this.loadProviderEvidence(projectId, runId);
    current.push(record);
    await this.saveProviderEvidence(projectId, runId, current);
  }

  // 3. Media Evidence
  public async saveMediaEvidence(
    projectId: string,
    runId: string,
    mediaMap: Record<string, ProductionMediaEvidence>
  ): Promise<void> {
    const validated = z.record(ProductionMediaEvidenceSchema).parse(mediaMap);
    const dir = this.getProductionDir(projectId, runId);
    await this.storage.writeJson(`${dir}/media-evidence.json`, validated);
  }

  public async loadMediaEvidence(
    projectId: string,
    runId: string
  ): Promise<Record<string, ProductionMediaEvidence>> {
    const filePath = `${this.getProductionDir(projectId, runId)}/media-evidence.json`;
    if (!(await this.storage.exists(filePath))) return {};
    const data = await this.safeReadJson<unknown>(filePath);
    return z.record(ProductionMediaEvidenceSchema).parse(data);
  }

  // 4. QA Evidence
  public async saveQAEvidence(
    projectId: string,
    runId: string,
    qaMap: Record<string, ProductionQAEvidence>
  ): Promise<void> {
    const validated = z.record(ProductionQAEvidenceSchema).parse(qaMap);
    const dir = this.getProductionDir(projectId, runId);
    await this.storage.writeJson(`${dir}/qa-evidence.json`, validated);
  }

  public async loadQAEvidence(
    projectId: string,
    runId: string
  ): Promise<Record<string, ProductionQAEvidence>> {
    const filePath = `${this.getProductionDir(projectId, runId)}/qa-evidence.json`;
    if (!(await this.storage.exists(filePath))) return {};
    const data = await this.safeReadJson<unknown>(filePath);
    return z.record(ProductionQAEvidenceSchema).parse(data);
  }

  // 5. Approval Evidence
  public async saveApprovalEvidence(
    projectId: string,
    runId: string,
    approvalMap: Record<string, ProductionApprovalEvidence>
  ): Promise<void> {
    const validated = z.record(ProductionApprovalEvidenceSchema).parse(approvalMap);
    const dir = this.getProductionDir(projectId, runId);
    await this.storage.writeJson(`${dir}/approval-evidence.json`, validated);
  }

  public async loadApprovalEvidence(
    projectId: string,
    runId: string
  ): Promise<Record<string, ProductionApprovalEvidence>> {
    const filePath = `${this.getProductionDir(projectId, runId)}/approval-evidence.json`;
    if (!(await this.storage.exists(filePath))) return {};
    const data = await this.safeReadJson<unknown>(filePath);
    return z.record(ProductionApprovalEvidenceSchema).parse(data);
  }

  // 5b. Approval Challenges
  public async saveApprovalChallenges(
    projectId: string,
    runId: string,
    challenges: Record<string, ProductionApprovalChallenge>
  ): Promise<void> {
    const validated = z.record(ProductionApprovalChallengeSchema).parse(challenges);
    const dir = this.getProductionDir(projectId, runId);
    await this.storage.writeJson(`${dir}/approval-challenges.json`, validated);
  }

  public async loadApprovalChallenges(
    projectId: string,
    runId: string
  ): Promise<Record<string, ProductionApprovalChallenge>> {
    const filePath = `${this.getProductionDir(projectId, runId)}/approval-challenges.json`;
    if (!(await this.storage.exists(filePath))) return {};
    const data = await this.safeReadJson<unknown>(filePath);
    return z.record(ProductionApprovalChallengeSchema).parse(data);
  }

  // 6. Master Evidence
  public async saveMasterEvidence(
    projectId: string,
    runId: string,
    evidence: MasterProductionEvidence
  ): Promise<void> {
    const validated = MasterProductionEvidenceSchema.parse(evidence);
    const dir = this.getProductionDir(projectId, runId);
    await this.storage.writeJson(`${dir}/master-evidence.json`, validated);
  }

  public async loadMasterEvidence(
    projectId: string,
    runId: string
  ): Promise<MasterProductionEvidence | null> {
    const filePath = `${this.getProductionDir(projectId, runId)}/master-evidence.json`;
    if (!(await this.storage.exists(filePath))) return null;
    const data = await this.safeReadJson<unknown>(filePath);
    return MasterProductionEvidenceSchema.parse(data);
  }
}
