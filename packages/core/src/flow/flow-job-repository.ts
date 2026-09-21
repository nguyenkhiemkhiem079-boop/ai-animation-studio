import { IStorageProvider } from '../storage/index.js';
import { FlowJobRecord } from './flow-job-manager.js';

export interface IFlowJobRepository {
  save(job: FlowJobRecord): Promise<void>;
  findById(jobId: string): Promise<FlowJobRecord | undefined>;
  findByShot(projectId: string, shotId: string): Promise<FlowJobRecord[]>;
  list(projectId?: string): Promise<FlowJobRecord[]>;
  delete(jobId: string): Promise<void>;
}

/**
 * Disk-backed Flow Job Repository utilizing the Studio's IStorageProvider abstraction.
 * Authoritative source of persistent Flow production jobs across process restarts.
 */
export class StorageFlowJobRepository implements IFlowJobRepository {
  private basePrefix: string;

  constructor(
    private storage: IStorageProvider,
    basePrefix = '.studio/flow/jobs'
  ) {
    this.basePrefix = basePrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  private getJobUri(jobId: string): string {
    return `${this.basePrefix}/${jobId}.json`;
  }

  public async save(job: FlowJobRecord): Promise<void> {
    const uri = this.getJobUri(job.jobId);
    await this.storage.writeJson(uri, job);
  }

  public async findById(jobId: string): Promise<FlowJobRecord | undefined> {
    const uri = this.getJobUri(jobId);
    if (!(await this.storage.exists(uri))) {
      return undefined;
    }
    return this.storage.readJson<FlowJobRecord>(uri);
  }

  public async findByShot(projectId: string, shotId: string): Promise<FlowJobRecord[]> {
    const all = await this.list(projectId);
    return all.filter((j) => j.shotId === shotId);
  }

  public async list(projectId?: string): Promise<FlowJobRecord[]> {
    const files = await this.storage.list(this.basePrefix);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const jobs: FlowJobRecord[] = [];

    for (const f of jsonFiles) {
      try {
        const record = await this.storage.readJson<FlowJobRecord>(f);
        if (record && record.jobId) {
          if (!projectId || record.projectId === projectId) {
            jobs.push(record);
          }
        }
      } catch {
        // Skip unparseable files
      }
    }

    return jobs.sort((a, b) => a.version - b.version || a.createdAt.localeCompare(b.createdAt));
  }

  public async delete(jobId: string): Promise<void> {
    const uri = this.getJobUri(jobId);
    if (await this.storage.exists(uri)) {
      await this.storage.delete(uri);
    }
  }
}
