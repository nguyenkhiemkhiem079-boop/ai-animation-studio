import { IStorageProvider } from '../storage/index.js';
import { EvidenceStore } from '../production-evidence/evidence-store.js';
import { ProductionRun, ProductionRunSchema } from '../domain/production-run.js';

export class ProductionRunRepository {
  private evidenceStore: EvidenceStore;

  constructor(private storage: IStorageProvider) {
    this.evidenceStore = new EvidenceStore(storage);
  }

  public async save(run: ProductionRun): Promise<void> {
    await this.evidenceStore.saveProductionRun(run);
  }

  public async findById(projectId: string, runId: string): Promise<ProductionRun | null> {
    return this.evidenceStore.loadProductionRun(projectId, runId);
  }

  public async findLatest(projectId: string): Promise<ProductionRun | null> {
    const runs = await this.listRuns(projectId);
    if (runs.length === 0) return null;
    runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return runs[0];
  }

  public async listRuns(projectId: string): Promise<ProductionRun[]> {
    const baseDir = `.studio/production/${projectId}`;
    if (!(await this.storage.exists(baseDir))) return [];

    const entries = await this.storage.list(baseDir);
    const runIds = new Set<string>();

    for (const entry of entries) {
      // Entry may be path like .studio/production/projectId/runId/production-run.json or runId
      const parts = entry.replace(/\\/g, '/').split('/');
      const prodIndex = parts.indexOf('production');
      if (prodIndex !== -1 && parts.length > prodIndex + 2) {
        runIds.add(parts[prodIndex + 2]);
      } else if (parts.length > 0) {
        runIds.add(parts[0]);
      }
    }

    const runs: ProductionRun[] = [];
    for (const id of runIds) {
      const run = await this.findById(projectId, id);
      if (run) runs.push(run);
    }

    return runs;
  }
}
