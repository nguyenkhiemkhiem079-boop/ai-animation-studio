import { ShotContract } from '../domain/director.js';
import { SourceTraceability } from '../domain/story.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import {
  FlowJobStatus,
  FlowProductionPackageV1,
  FlowReferenceAsset,
  FlowFrameDescriptor,
  FlowCapability,
  validateFlowJobTransition,
} from './flow-types.js';
import { FlowProductionPackageBuilder } from './flow-package-builder.js';
import { FlowResultImporter, FlowImportResult } from './flow-result-importer.js';
import { FlowQAEvaluator, FlowQAReport } from './flow-qa-evaluator.js';
import { IFlowJobRepository, StorageFlowJobRepository } from './flow-job-repository.js';
import { FileSystemStorage, MemoryStorage } from '../storage/index.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { StudioError } from '../errors/index.js';

export interface FlowJobRecord {
  jobId: string;
  projectId: string;
  seriesId: string;
  sceneId: string;
  shotId: string;
  status: FlowJobStatus;
  createdAt: string;
  updatedAt: string;
  package?: FlowProductionPackageV1;
  packageDir?: string;
  importResult?: FlowImportResult;
  qaReport?: FlowQAReport;
  decision?: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  approvalNotes?: string;
  version: number;
  lastError?: string;
  lastAttemptAt?: string;
  failureCode?: string;
}

export interface CreateFlowJobInput {
  projectId: string;
  seriesId: string;
  sceneId: string;
  shot: ShotContract;
  sourceReferences?: SourceTraceability[];
  references?: FlowReferenceAsset[];
  firstFrame?: FlowFrameDescriptor;
  lastFrame?: FlowFrameDescriptor;
  continuityConstraints?: string[];
  explicitWorkflow?: FlowCapability;
  styleGuidelines?: string;
  outputBaseDir?: string;
}

export class FlowJobManager {
  private jobs = new Map<string, FlowJobRecord>();
  private packageBuilder: FlowProductionPackageBuilder;
  private importer: FlowResultImporter;
  private qaEvaluator: FlowQAEvaluator;
  private assetRegistry?: IAssetRegistry;
  private repository: IFlowJobRepository;

  constructor(
    assetRegistry?: IAssetRegistry,
    packageBuilder = new FlowProductionPackageBuilder(),
    importer?: FlowResultImporter,
    qaEvaluator = new FlowQAEvaluator(),
    repository?: IFlowJobRepository
  ) {
    this.assetRegistry = assetRegistry;
    this.packageBuilder = packageBuilder;
    this.importer = importer ?? new FlowResultImporter(assetRegistry);
    this.qaEvaluator = qaEvaluator;
    this.repository = repository ?? new StorageFlowJobRepository(new MemoryStorage());
  }

  public getRepository(): IFlowJobRepository {
    return this.repository;
  }

  /**
   * Preloads all persisted jobs from disk into memory cache.
   */
  public async loadPersistedJobs(projectId?: string): Promise<FlowJobRecord[]> {
    const persisted = await this.repository.list(projectId);
    for (const job of persisted) {
      this.jobs.set(job.jobId, job);
    }
    return persisted;
  }

  /**
   * Initializes and prepares a physical Google Flow production package for a shot.
   * State machine: DRAFT -> PACKAGE_READY -> NEEDS_USER_ACTION.
   * State is persisted at every transition and survives process restart.
   */
  public async prepareFlowJob(input: CreateFlowJobInput): Promise<FlowJobRecord> {
    // 1. Query disk repository for historical versions to prevent version reset on restart
    const persisted = await this.repository.findByShot(input.projectId, input.shot.id);
    for (const pj of persisted) {
      this.jobs.set(pj.jobId, pj);
    }

    const existingForShot = Array.from(this.jobs.values()).filter(
      (j) => j.projectId === input.projectId && j.shotId === input.shot.id
    );
    const maxVersion = existingForShot.reduce((max, j) => Math.max(max, j.version || 0), 0);
    let version = maxVersion + 1;
    let jobId = `flow_job_${input.projectId}_${input.shot.id}_v${version}`;

    // Collision detection & retry
    while ((await this.repository.findById(jobId)) || this.jobs.has(jobId)) {
      version++;
      jobId = `flow_job_${input.projectId}_${input.shot.id}_v${version}`;
    }

    const job: FlowJobRecord = {
      jobId,
      projectId: input.projectId,
      seriesId: input.seriesId,
      sceneId: input.sceneId,
      shotId: input.shot.id,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version,
    };
    this.jobs.set(jobId, job);
    await this.persistJob(job);

    // Build physical package
    const buildResult = await this.packageBuilder.buildPackage({
      projectId: input.projectId,
      seriesId: input.seriesId,
      sceneId: input.sceneId,
      shot: input.shot,
      sourceReferences: input.sourceReferences,
      references: input.references,
      firstFrame: input.firstFrame,
      lastFrame: input.lastFrame,
      continuityConstraints: input.continuityConstraints,
      styleGuidelines: input.styleGuidelines,
      explicitWorkflow: input.explicitWorkflow,
      outputBaseDir: input.outputBaseDir,
    });

    this.transitionState(job, 'PACKAGE_READY');
    job.package = buildResult.pkg;
    job.packageDir = buildResult.packageDir;
    await this.persistJob(job);

    // Handoff to human creator
    this.transitionState(job, 'NEEDS_USER_ACTION');
    await this.persistJob(job);

    return job;
  }

  /**
   * Imports the user's downloaded Google Flow MP4 clip and verifies media stream.
   * State machine: NEEDS_USER_ACTION -> WAITING_FOR_IMPORT -> IMPORTED -> VERIFYING -> VERIFIED -> QA_PENDING -> (CANDIDATE | QA_FAILED).
   * Atomically reverts to WAITING_FOR_IMPORT with error metadata upon import or verification failure.
   */
  public async importFlowResult(
    jobId: string,
    localMp4Path: string,
    metadata?: {
      modelUsed?: string;
      userReportedCredits?: number;
      notes?: string;
    },
    options?: { requireValidVideoStream?: boolean }
  ): Promise<FlowJobRecord> {
    const job = await this.resolveJobOrThrow(jobId);

    if (job.status === 'NEEDS_USER_ACTION') {
      this.transitionState(job, 'WAITING_FOR_IMPORT');
      await this.persistJob(job);
    }
    this.transitionState(job, 'IMPORTED');
    await this.persistJob(job);

    this.transitionState(job, 'VERIFYING');
    await this.persistJob(job);

    try {
      // Import and physical FFprobe verification
      const importResult = await this.importer.importResult({
        projectId: job.projectId,
        seriesId: job.seriesId,
        sceneId: job.sceneId,
        shotId: job.shotId,
        packageId: job.package?.packageId,
        sourceMp4Path: localMp4Path,
        generationMetadata: metadata,
        requireValidVideoStream: options?.requireValidVideoStream,
      });

      this.transitionState(job, 'VERIFIED');
      job.importResult = importResult;
      job.lastError = undefined;
      job.failureCode = undefined;
      await this.persistJob(job);

      // Run Continuity QA
      this.transitionState(job, 'QA_PENDING');
      await this.persistJob(job);

      if (!job.package?.shotContractSnapshot) {
        throw new StudioError(
          `Cannot run QA on Flow job "${jobId}": Missing shotContractSnapshot in package.`,
          'FLOW_MISSING_CONTRACT'
        );
      }

      const qaReport = this.qaEvaluator.evaluate({
        shot: job.package.shotContractSnapshot,
        package: job.package,
        provenance: importResult.provenance,
        candidateAssetId: importResult.candidateAssetId,
      });

      job.qaReport = qaReport;

      if (qaReport.overallStatus === 'FAIL') {
        this.transitionState(job, 'QA_FAILED');
      } else {
        this.transitionState(job, 'CANDIDATE');
      }
      await this.persistJob(job);

      return job;
    } catch (error: any) {
      // Import failure atomicity: return safely to WAITING_FOR_IMPORT with diagnostic metadata
      job.status = 'WAITING_FOR_IMPORT';
      job.updatedAt = new Date().toISOString();
      job.lastError = error.message;
      job.lastAttemptAt = new Date().toISOString();
      job.failureCode = error.code || 'FLOW_IMPORT_FAILED';
      await this.persistJob(job);
      throw error;
    }
  }

  /**
   * Promotes candidate asset to Canon approval.
   * State machine: CANDIDATE -> APPROVED.
   * Re-verifies physical candidate artifact existence and media stream integrity before promotion.
   */
  public async approveCandidate(
    jobId: string,
    approvalNotes?: string,
    options?: { requireValidVideoStream?: boolean }
  ): Promise<FlowJobRecord> {
    const job = await this.resolveJobOrThrow(jobId);

    if (job.status !== 'CANDIDATE') {
      throw new StudioError(
        `Cannot approve Flow job "${jobId}": Job status is "${job.status}", expected "CANDIDATE".`,
        'FLOW_ILLEGAL_APPROVAL_STATE'
      );
    }

    if (!job.qaReport) {
      throw new StudioError(
        `Cannot approve Flow job "${jobId}": QA evaluation has not been conducted.`,
        'FLOW_MISSING_QA_REPORT'
      );
    }

    // Enforce safety gate
    this.qaEvaluator.assertCanApprove(job.qaReport);

    // Re-verify physical candidate artifact integrity on disk
    if (job.importResult?.storedFilePath) {
      const shouldVerifyVideoStream =
        options?.requireValidVideoStream ?? (job.importResult.provenance?.hasVideoStreamVerified === true);

      const verification = ArtifactVerifier.verify(job.importResult.storedFilePath, {
        requireVideoStream: shouldVerifyVideoStream,
        requireValidMedia: shouldVerifyVideoStream,
      });

      if (!verification.exists || !verification.nonEmpty || !verification.readable) {
        throw new StudioError(
          `Cannot approve Flow job "${jobId}": Candidate physical artifact is missing, empty, or unreadable: "${job.importResult.storedFilePath}". Details: ${verification.error || 'N/A'}`,
          'FLOW_CANDIDATE_ARTIFACT_INVALID'
        );
      }

      if (shouldVerifyVideoStream && (!verification.hasVideoStream || verification.error)) {
        throw new StudioError(
          `Cannot approve Flow job "${jobId}": Candidate physical artifact failed media stream re-check: ${verification.error || 'No valid video stream'}`,
          'FLOW_CANDIDATE_ARTIFACT_INVALID'
        );
      }

      if (
        job.importResult.provenance?.checksumSha256 &&
        verification.checksumSha256 &&
        job.importResult.provenance.checksumSha256 !== verification.checksumSha256
      ) {
        throw new StudioError(
          `Cannot approve Flow job "${jobId}": Candidate physical artifact checksum mismatch. Recorded: ${job.importResult.provenance.checksumSha256}, Actual: ${verification.checksumSha256}`,
          'FLOW_CANDIDATE_ARTIFACT_CORRUPTED'
        );
      }
    } else {
      throw new StudioError(
        `Cannot approve Flow job "${jobId}": Missing stored physical file path in import record.`,
        'FLOW_CANDIDATE_ARTIFACT_INVALID'
      );
    }

    // Promote in AssetRegistry if present
    if (this.assetRegistry && job.importResult?.candidateAssetId) {
      await this.assetRegistry.approveCanon(job.importResult.candidateAssetId);
    }

    this.transitionState(job, 'APPROVED');
    job.decision = 'APPROVED';
    job.approvalNotes = approvalNotes;
    await this.persistJob(job);

    return job;
  }

  /**
   * Rejects candidate asset.
   * State machine: CANDIDATE / QA_FAILED -> REJECTED.
   * Preserves artifact and provenance for historical audit.
   */
  public async rejectCandidate(jobId: string, reason: string): Promise<FlowJobRecord> {
    const job = await this.resolveJobOrThrow(jobId);

    if (job.status !== 'CANDIDATE' && job.status !== 'QA_FAILED') {
      throw new StudioError(
        `Cannot reject Flow job "${jobId}": Job status is "${job.status}", expected "CANDIDATE" or "QA_FAILED".`,
        'FLOW_ILLEGAL_REJECT_STATE'
      );
    }

    this.transitionState(job, 'REJECTED');
    job.decision = 'REJECTED';
    job.rejectionReason = reason;
    await this.persistJob(job);

    return job;
  }

  public getJob(jobId: string): FlowJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  public async findJob(jobId: string): Promise<FlowJobRecord | undefined> {
    const cached = this.jobs.get(jobId);
    if (cached) return cached;
    const persisted = await this.repository.findById(jobId);
    if (persisted) {
      this.jobs.set(persisted.jobId, persisted);
    }
    return persisted;
  }

  public getJobsForShot(shotId: string, projectId?: string): FlowJobRecord[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.shotId === shotId && (!projectId || j.projectId === projectId)
    );
  }

  public async findJobsForShot(shotId: string, projectId = ''): Promise<FlowJobRecord[]> {
    const persisted = await this.repository.findByShot(projectId, shotId);
    for (const j of persisted) {
      this.jobs.set(j.jobId, j);
    }
    return this.getJobsForShot(shotId, projectId || undefined);
  }

  public getAllJobs(): FlowJobRecord[] {
    return Array.from(this.jobs.values());
  }

  public async findAllJobs(projectId?: string): Promise<FlowJobRecord[]> {
    const persisted = await this.repository.list(projectId);
    for (const j of persisted) {
      this.jobs.set(j.jobId, j);
    }
    return persisted;
  }

  private async resolveJobOrThrow(jobId: string): Promise<FlowJobRecord> {
    let job = this.jobs.get(jobId);
    if (!job) {
      job = await this.repository.findById(jobId);
      if (job) {
        this.jobs.set(job.jobId, job);
      }
    }
    if (!job) {
      throw new StudioError(
        `Google Flow job not found: "${jobId}"`,
        'FLOW_JOB_NOT_FOUND',
        { jobId }
      );
    }
    return job;
  }

  private transitionState(job: FlowJobRecord, nextState: FlowJobStatus): void {
    validateFlowJobTransition(job.status, nextState);
    job.status = nextState;
    job.updatedAt = new Date().toISOString();
  }

  private async persistJob(job: FlowJobRecord): Promise<void> {
    await this.repository.save(job);
  }
}
