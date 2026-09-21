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

  constructor(
    assetRegistry?: IAssetRegistry,
    packageBuilder = new FlowProductionPackageBuilder(),
    importer?: FlowResultImporter,
    qaEvaluator = new FlowQAEvaluator()
  ) {
    this.assetRegistry = assetRegistry;
    this.packageBuilder = packageBuilder;
    this.importer = importer ?? new FlowResultImporter(assetRegistry);
    this.qaEvaluator = qaEvaluator;
  }

  /**
   * Initializes and prepares a physical Google Flow production package for a shot.
   * State machine: DRAFT -> PACKAGE_READY -> NEEDS_USER_ACTION.
   */
  public async prepareFlowJob(input: CreateFlowJobInput): Promise<FlowJobRecord> {
    const existingForShot = Array.from(this.jobs.values()).filter(
      (j) => j.projectId === input.projectId && j.shotId === input.shot.id
    );
    const version = existingForShot.length + 1;
    const jobId = `flow_job_${input.projectId}_${input.shot.id}_v${version}`;

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

    // Handoff to human creator
    this.transitionState(job, 'NEEDS_USER_ACTION');

    return job;
  }

  /**
   * Imports the user's downloaded Google Flow MP4 clip and verifies media stream.
   * State machine: NEEDS_USER_ACTION -> WAITING_FOR_IMPORT -> IMPORTED -> VERIFYING -> VERIFIED -> QA_PENDING -> (CANDIDATE | QA_FAILED).
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
    const job = this.getJobOrThrow(jobId);

    if (job.status === 'NEEDS_USER_ACTION') {
      this.transitionState(job, 'WAITING_FOR_IMPORT');
    }
    this.transitionState(job, 'IMPORTED');
    this.transitionState(job, 'VERIFYING');

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

    // Run Continuity QA
    this.transitionState(job, 'QA_PENDING');
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

    return job;
  }

  /**
   * Promotes candidate asset to Canon approval.
   * State machine: CANDIDATE -> APPROVED.
   * Strictly fails if QA failed.
   */
  public async approveCandidate(jobId: string, approvalNotes?: string): Promise<FlowJobRecord> {
    const job = this.getJobOrThrow(jobId);

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

    // Promote in AssetRegistry if present
    if (this.assetRegistry && job.importResult?.candidateAssetId) {
      await this.assetRegistry.approveCanon(job.importResult.candidateAssetId);
    }

    this.transitionState(job, 'APPROVED');
    job.decision = 'APPROVED';
    job.approvalNotes = approvalNotes;

    return job;
  }

  /**
   * Rejects candidate asset.
   * State machine: CANDIDATE / QA_FAILED -> REJECTED.
   * Preserves artifact and provenance for historical audit.
   */
  public async rejectCandidate(jobId: string, reason: string): Promise<FlowJobRecord> {
    const job = this.getJobOrThrow(jobId);

    if (job.status !== 'CANDIDATE' && job.status !== 'QA_FAILED') {
      throw new StudioError(
        `Cannot reject Flow job "${jobId}": Job status is "${job.status}", expected "CANDIDATE" or "QA_FAILED".`,
        'FLOW_ILLEGAL_REJECT_STATE'
      );
    }

    this.transitionState(job, 'REJECTED');
    job.decision = 'REJECTED';
    job.rejectionReason = reason;

    return job;
  }

  public getJob(jobId: string): FlowJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  public getJobsForShot(shotId: string): FlowJobRecord[] {
    return Array.from(this.jobs.values()).filter((j) => j.shotId === shotId);
  }

  public getAllJobs(): FlowJobRecord[] {
    return Array.from(this.jobs.values());
  }

  private getJobOrThrow(jobId: string): FlowJobRecord {
    const job = this.jobs.get(jobId);
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
}
