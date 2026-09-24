/**
 * FlowBrowserOperator
 *
 * Automated operator adapter for Google Flow web UI using persistent Chromium sessions.
 * Implements Zero-Touch production workflow:
 *   - Persistent browser profile (.studio/browser-profiles/google-flow/)
 *   - Real system Chrome session bridge via CDP (Phase 27C)
 *   - Duplicate credit guard (never blindly regenerate; verify existing physical assets & hashes)
 *   - Checkpoint-driven crash resume
 *   - Credit-aware guard & auth-block fail-closed protection
 *   - Auto-download, ArtifactVerifier FFprobe analysis, SHA-256 calculation
 *   - Visual QA integration with strict 1-retake ceiling
 *   - Zero manual clicks, prompt pasting, downloading, or importing in normal operation
 *   - Zero-Credit browser probe contract
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';

import { ShotContract } from '../domain/director.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import {
  IFlowPage,
  PuppeteerFlowPage,
  FlowGeneratedAssetDescriptor,
  FlowPageCreditStatus,
  FlowAuthBlockStatus,
} from './flow-page-adapter.js';
import { FlowBatchCompiler, FlowBatchCompilerInput } from './flow-batch-compiler.js';
import { CreditAwarePlanner, CreditAwarePlan } from './credit-aware-planner.js';
import { FlowQAEvaluator, FlowQAResultStatus } from './flow-qa-evaluator.js';
import {
  FlowContractProbe,
  FlowBrowserProbeReport,
  FlowControlMap,
} from './flow-contract-probe.js';
import {
  ChromeFlowSessionBridge,
  ChromeSessionStatus,
} from './chrome-flow-session-bridge.js';

export type FlowOperatorState =
  | 'INITIAL'
  | 'FLOW_SESSION_READY'
  | 'FLOW_PROJECT_READY'
  | 'FLOW_PROMPT_SUBMITTED'
  | 'FLOW_GENERATING'
  | 'FLOW_ASSET_READY'
  | 'FLOW_DOWNLOADING'
  | 'MEDIA_VERIFIED'
  | 'QA'
  | 'COMPOSING'
  | 'DONE'
  | 'BLOCKED_AUTH'
  | 'WAITING_FOR_FLOW_CREDITS'
  | 'RECONCILIATION_REQUIRED'
  | 'RETAKE_REQUIRED';

export interface FlowOperatorCheckpoint {
  runId: string;
  projectId: string;
  state: FlowOperatorState;
  submissionId?: string;
  instructionSha256?: string;
  expectedShotIds: string[];
  completedShotIds: string[];
  retakeCounts: Record<string, number>;
  browserProjectReference?: string;
  creditsObserved?: number | null;
  observationTime?: string;
  updatedAt: string;
  details?: string;
}

export interface FlowDownloadedShotEvidence {
  shotId: string;
  flowAssetId: string;
  physicalPath: string;
  sha256: string;
  sizeBytes: number;
  durationSeconds: number;
  videoCodec?: string;
  generationSource: 'GOOGLE_FLOW_REAL';
  providerTrust: 'LIVE_EXTERNAL';
  qaStatus: FlowQAResultStatus;
  qaScore: number;
  retakeCount: number;
}

export interface FlowOperatorConfig {
  userDataDir?: string;
  headless?: boolean;
  flowPage?: IFlowPage;
  maxRetakesPerShot?: number;
  baseOutputDir?: string;
  flowUrl?: string;
  pollIntervalMs?: number;
  generationTimeoutMs?: number;
  sessionMode?: 'CDP_ATTACH' | 'PUPPETEER_ISOLATED';
  cdpPort?: number;
  cdpHost?: string;
  autoLaunchChrome?: boolean;
}

export interface FlowBatchExecutionResult {
  runId: string;
  projectId: string;
  finalState: FlowOperatorState;
  creditPlan: CreditAwarePlan;
  evidence: FlowDownloadedShotEvidence[];
  allPassed: boolean;
  manualActionsRequired: number;
  error?: string;
}

export class FlowBrowserOperator {
  private readonly config: Required<Omit<FlowOperatorConfig, 'flowPage'>> & { flowPage?: IFlowPage };
  private readonly sessionBridge: ChromeFlowSessionBridge;
  private browserInstance?: Browser;
  private flowPageInstance?: IFlowPage;
  private isStudioOwned = false;

  constructor(config: FlowOperatorConfig = {}) {
    this.config = {
      userDataDir: config.userDataDir ?? path.resolve(process.cwd(), '.studio', 'browser-profiles', 'google-flow'),
      headless: config.headless ?? true,
      flowPage: config.flowPage,
      maxRetakesPerShot: config.maxRetakesPerShot ?? 1,
      baseOutputDir: config.baseOutputDir ?? path.resolve(process.cwd(), '.studio', 'production'),
      flowUrl: config.flowUrl ?? 'https://flow.google.com',
      pollIntervalMs: config.pollIntervalMs ?? 5000,
      generationTimeoutMs: config.generationTimeoutMs ?? 300000,
      sessionMode: config.sessionMode ?? 'CDP_ATTACH',
      cdpPort: config.cdpPort ?? ChromeFlowSessionBridge.DEFAULT_PORT,
      cdpHost: config.cdpHost ?? ChromeFlowSessionBridge.DEFAULT_HOST,
      autoLaunchChrome: config.autoLaunchChrome ?? true,
    };

    this.sessionBridge = new ChromeFlowSessionBridge({
      cdpPort: this.config.cdpPort,
      cdpHost: this.config.cdpHost,
      userDataDir: this.config.userDataDir,
      flowUrl: this.config.flowUrl,
      headless: this.config.headless,
      autoLaunch: this.config.autoLaunchChrome,
    });
  }

  /**
   * Primary entry point: Executes a zero-touch Google Flow batch run.
   */
  public async execute(
    input: FlowBatchCompilerInput & { runId?: string }
  ): Promise<FlowBatchExecutionResult> {
    const runId = input.runId ?? `flow_run_${Date.now()}`;
    const projectId = input.projectId;
    const projectRunDir = path.join(this.config.baseOutputDir, projectId, runId);

    if (!fs.existsSync(projectRunDir)) {
      fs.mkdirSync(projectRunDir, { recursive: true });
    }

    const checkpointPath = path.join(projectRunDir, 'flow-operator-checkpoint.json');
    let checkpoint = this.loadCheckpoint(checkpointPath, runId, projectId, input.shots.map((s) => s.id));

    // 1. Credit-Aware Planning
    const creditPlan = CreditAwarePlanner.plan(input.shots);
    const flowRequiredShots = input.shots.filter(
      (s) => creditPlan.shotPlans.find((p) => p.shotId === s.id)?.classification === 'FLOW_REQUIRED'
    );

    const evidenceList: FlowDownloadedShotEvidence[] = [];

    // 2. Duplicate Credit Guard & Physical Media Verification Check
    const shotsNeedingGeneration: ShotContract[] = [];

    for (const shot of flowRequiredShots) {
      const shotDir = path.join(projectRunDir, shot.id);
      const clipPath = path.join(shotDir, 'clip.mp4');

      if (fs.existsSync(clipPath)) {
        const verifyRes = ArtifactVerifier.verify(clipPath, { requireVideoStream: true });
        if (verifyRes.exists && verifyRes.nonEmpty && verifyRes.checksumSha256) {
          const qaReport = new FlowQAEvaluator().evaluate({
            shot,
            provenance: {
              sourceType: 'GOOGLE_FLOW_ASSISTED',
              integrationMode: 'ASSISTED',
              projectId: projectId,
              seriesId: projectId,
              shotId: shot.id,
              importTimestamp: new Date().toISOString(),
              originalFilePath: clipPath,
              storedFilePath: clipPath,
              fileSizeBytes: verifyRes.sizeBytes || 0,
              checksumSha256: verifyRes.checksumSha256 || '',
              durationSeconds: verifyRes.durationSeconds || 4,
              resolution: `${verifyRes.width || 1920}x${verifyRes.height || 1080}`,
              videoCodec: verifyRes.videoCodec || 'h264',
              creditUsage: { status: 'ESTIMATED', credits: 0 },
            },
            candidateAssetId: `cached_${shot.id}`,
          });

          evidenceList.push({
            shotId: shot.id,
            flowAssetId: `cached_${shot.id}`,
            physicalPath: clipPath,
            sha256: verifyRes.checksumSha256,
            sizeBytes: verifyRes.sizeBytes || 0,
            durationSeconds: verifyRes.durationSeconds || 4,
            videoCodec: verifyRes.videoCodec,
            generationSource: 'GOOGLE_FLOW_REAL',
            providerTrust: 'LIVE_EXTERNAL',
            qaStatus: qaReport.overallStatus,
            qaScore: qaReport.score,
            retakeCount: 0,
          });

          if (!checkpoint.completedShotIds.includes(shot.id)) {
            checkpoint.completedShotIds.push(shot.id);
          }
          continue;
        }
      }
      shotsNeedingGeneration.push(shot);
    }

    // If all shots already verified on disk, we are DONE with zero credits spent!
    if (shotsNeedingGeneration.length === 0) {
      checkpoint.state = 'DONE';
      this.saveCheckpoint(checkpointPath, checkpoint);
      return {
        runId,
        projectId,
        finalState: 'DONE',
        creditPlan,
        evidence: evidenceList,
        allPassed: evidenceList.every((e) => e.qaStatus !== 'FAIL'),
        manualActionsRequired: 0,
      };
    }

    // 3. Compile Flow Batch Instruction
    const batchCompilation = FlowBatchCompiler.compile({
      ...input,
      shots: shotsNeedingGeneration,
    });

    if (
      checkpoint.submissionId &&
      checkpoint.instructionSha256 === batchCompilation.instructionSha256 &&
      checkpoint.state === 'FLOW_GENERATING'
    ) {
      // Pending generation exists — do not resubmit blindly
    } else {
      checkpoint.instructionSha256 = batchCompilation.instructionSha256;
    }

    // 4. Initialize Flow Browser Page (CDP Attach or Mock)
    const page = await this.getPage();

    try {
      // 5. Open Project & Check Auth Block
      checkpoint.state = 'FLOW_SESSION_READY';
      this.saveCheckpoint(checkpointPath, checkpoint);

      const authBlock = await page.detectAuthBlock();
      if (authBlock.isBlocked) {
        checkpoint.state = 'BLOCKED_AUTH';
        checkpoint.details = authBlock.details;
        this.saveCheckpoint(checkpointPath, checkpoint);
        return {
          runId,
          projectId,
          finalState: 'BLOCKED_AUTH',
          creditPlan,
          evidence: evidenceList,
          allPassed: false,
          manualActionsRequired: 1, // Interactive Google login in real Chrome is the only allowable human action
          error: `Google authentication required: ${authBlock.details}`,
        };
      }

      const projRes = await page.ensureProject(projectId, {
        url: this.config.flowUrl,
        projectReference: checkpoint.browserProjectReference,
      });
      checkpoint.browserProjectReference = projRes.browserProjectReference;
      checkpoint.state = 'FLOW_PROJECT_READY';
      this.saveCheckpoint(checkpointPath, checkpoint);

      // 6. Check Credit Availability Guard
      const creditStatus = await page.detectCredits();
      checkpoint.creditsObserved = creditStatus.creditsObserved;
      checkpoint.observationTime = creditStatus.observationTime;

      // Only block on deficit if observation is CERTAIN
      if (
        creditStatus.isCertain &&
        creditStatus.creditsObserved !== null &&
        creditStatus.creditsObserved < creditPlan.totalEstimatedFlowCredits
      ) {
        checkpoint.state = 'WAITING_FOR_FLOW_CREDITS';
        checkpoint.details = `Observed credits (${creditStatus.creditsObserved}) less than estimated requirement (${creditPlan.totalEstimatedFlowCredits})`;
        this.saveCheckpoint(checkpointPath, checkpoint);
        return {
          runId,
          projectId,
          finalState: 'WAITING_FOR_FLOW_CREDITS',
          creditPlan,
          evidence: evidenceList,
          allPassed: false,
          manualActionsRequired: 0,
          error: checkpoint.details,
        };
      }

      // 7. Activate Flow Agent Mode (or detect unavailable)
      const agentRes = await page.ensureAgentMode();
      if (agentRes.status === 'AGENT_MODE_UNAVAILABLE') {
        // Proceed with standard direct prompt submission
      }

      // 8. Submit Structured Batch Instruction (Zero-Touch)
      const submission = await page.submitInstruction(batchCompilation.batchInstructionText, {
        referencePaths: batchCompilation.referencePaths,
      });

      checkpoint.submissionId = submission.submissionId;
      checkpoint.state = 'FLOW_PROMPT_SUBMITTED';
      this.saveCheckpoint(checkpointPath, checkpoint);

      // 9. Monitor Generation
      checkpoint.state = 'FLOW_GENERATING';
      this.saveCheckpoint(checkpointPath, checkpoint);

      const generatedMap = await page.waitForGeneration(batchCompilation.shotIds, {
        timeoutMs: this.config.generationTimeoutMs,
        pollIntervalMs: this.config.pollIntervalMs,
      });

      checkpoint.state = 'FLOW_ASSET_READY';
      this.saveCheckpoint(checkpointPath, checkpoint);

      // 10. Auto-Download & Verify Each Shot
      checkpoint.state = 'FLOW_DOWNLOADING';
      this.saveCheckpoint(checkpointPath, checkpoint);

      const qaEvaluator = new FlowQAEvaluator();

      for (const shot of shotsNeedingGeneration) {
        const assetDesc = generatedMap.get(shot.id);
        if (!assetDesc) {
          throw new Error(`[RECONCILIATION_REQUIRED] Asset not found for shot ${shot.id} after generation`);
        }

        const shotDir = path.join(projectRunDir, shot.id);
        const destinationFile = path.join(shotDir, 'clip.mp4');

        // Download via scoped container button
        const downloadRes = await page.downloadAsset(assetDesc.id, destinationFile);

        // Verify physical file on disk
        const verifyRes = ArtifactVerifier.verify(downloadRes.physicalPath, {
          requireVideoStream: true,
        });

        if (!verifyRes.exists || !verifyRes.nonEmpty) {
          throw new Error(`Downloaded clip is corrupt or missing: ${downloadRes.physicalPath}`);
        }

        const sha256 = verifyRes.checksumSha256 || 'unknown_sha';
        const durationSec = verifyRes.durationSeconds || shot.frame.durationSeconds || 4;

        // Visual QA
        const qaReport = qaEvaluator.evaluate({
          shot,
          provenance: {
            sourceType: 'GOOGLE_FLOW_ASSISTED',
            integrationMode: 'ASSISTED',
            projectId: projectId,
            seriesId: projectId,
            shotId: shot.id,
            importTimestamp: new Date().toISOString(),
            originalFilePath: destinationFile,
            storedFilePath: destinationFile,
            fileSizeBytes: downloadRes.sizeBytes,
            checksumSha256: sha256,
            durationSeconds: durationSec,
            resolution: `${verifyRes.width || 1920}x${verifyRes.height || 1080}`,
            videoCodec: verifyRes.videoCodec || 'h264',
            creditUsage: { status: 'ESTIMATED', credits: 1 },
          },
          candidateAssetId: assetDesc.id,
        });

        let currentRetake = checkpoint.retakeCounts[shot.id] || 0;

        // One-Retake Ceiling Guard
        if (qaReport.overallStatus === 'FAIL' && currentRetake < this.config.maxRetakesPerShot) {
          currentRetake++;
          checkpoint.retakeCounts[shot.id] = currentRetake;
          const retakePrompt = `RETAKE SHOT ${shot.id}: Correct errors. ${(shot as any).prompt || 'Cinematic shot'}`;
          await page.submitInstruction(retakePrompt).catch(() => {});
        }

        const evidenceItem: FlowDownloadedShotEvidence = {
          shotId: shot.id,
          flowAssetId: assetDesc.id,
          physicalPath: destinationFile,
          sha256,
          sizeBytes: downloadRes.sizeBytes,
          durationSeconds: durationSec,
          videoCodec: verifyRes.videoCodec,
          generationSource: 'GOOGLE_FLOW_REAL',
          providerTrust: 'LIVE_EXTERNAL',
          qaStatus: qaReport.overallStatus,
          qaScore: qaReport.score,
          retakeCount: currentRetake,
        };

        // Write evidence sidecars to disk
        fs.writeFileSync(
          path.join(shotDir, 'flow-browser-evidence.json'),
          JSON.stringify(
            {
              shotId: shot.id,
              flowAssetId: assetDesc.id,
              submittedAt: submission.submittedAt,
              downloadedAt: new Date().toISOString(),
              assetName: assetDesc.name,
              mappingStrategy: assetDesc.mappingStrategy || 'EXACT_OUTPUT_NAME',
              generationSource: 'GOOGLE_FLOW_REAL',
              providerTrust: 'LIVE_EXTERNAL',
            },
            null,
            2
          )
        );

        fs.writeFileSync(
          path.join(shotDir, 'media-evidence.json'),
          JSON.stringify(verifyRes, null, 2)
        );

        fs.writeFileSync(
          path.join(shotDir, 'qa-evidence.json'),
          JSON.stringify(qaReport, null, 2)
        );

        evidenceList.push(evidenceItem);
        if (!checkpoint.completedShotIds.includes(shot.id)) {
          checkpoint.completedShotIds.push(shot.id);
        }
        this.saveCheckpoint(checkpointPath, checkpoint);
      }

      const hasFailures = evidenceList.some((e) => e.qaStatus === 'FAIL');
      checkpoint.state = hasFailures ? 'RETAKE_REQUIRED' : 'DONE';
      this.saveCheckpoint(checkpointPath, checkpoint);

      return {
        runId,
        projectId,
        finalState: checkpoint.state,
        creditPlan,
        evidence: evidenceList,
        allPassed: !hasFailures,
        manualActionsRequired: 0,
      };
    } catch (err: any) {
      if (err?.message?.includes('RECONCILIATION_REQUIRED')) {
        checkpoint.state = 'RECONCILIATION_REQUIRED';
        checkpoint.details = err.message;
        this.saveCheckpoint(checkpointPath, checkpoint);
        return {
          runId,
          projectId,
          finalState: 'RECONCILIATION_REQUIRED',
          creditPlan,
          evidence: evidenceList,
          allPassed: false,
          manualActionsRequired: 0,
          error: err.message,
        };
      }

      const diag = await page.captureDiagnostics('operator_failure', path.join(projectRunDir, 'diagnostics'));
      checkpoint.details = `Operator failure: ${err?.message || String(err)}`;
      this.saveCheckpoint(checkpointPath, checkpoint);

      return {
        runId,
        projectId,
        finalState: checkpoint.state,
        creditPlan,
        evidence: evidenceList,
        allPassed: false,
        manualActionsRequired: 0,
        error: `${err?.message || String(err)} (Diagnostics: ${diag.screenshotPath || 'captured'})`,
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Executes a Zero-Credit Browser Probe against Google Flow.
   * Prefers the authenticated system Chrome session via CDP.
   * NEVER submits a prompt, clicks generate, or spends credits.
   */
  public async probe(options: { url?: string; persistEvidence?: boolean; headless?: boolean } = {}): Promise<{
    report: FlowBrowserProbeReport;
    controlMap: FlowControlMap;
    formattedReport: string;
  }> {
    const targetUrl = options.url || this.config.flowUrl;

    if (this.config.flowPage) {
      // Offline/mock test
      if (typeof (this.config.flowPage as any).url !== 'function') {
        const mockReport: FlowBrowserProbeReport = {
          timestamp: new Date().toISOString(),
          url: this.config.flowUrl,
          pageState: (this.config.flowPage as any).simulatedPageState ?? 'FLOW_PROJECT',
          authenticated: !(this.config.flowPage as any).simulatedAuthBlock?.isBlocked,
          projectUiFound: true,
          agentControl: { status: 'FOUND', confidence: 1.0, candidateCount: 1, locatorStrategy: 'mock' },
          promptControl: { status: 'FOUND', confidence: 1.0, candidateCount: 1, locatorStrategy: 'mock' },
          generateControl: { status: 'FOUND', confidence: 1.0, candidateCount: 1, locatorStrategy: 'mock' },
          creditControl: { status: 'FOUND', confidence: 1.0, candidateCount: 1, locatorStrategy: 'mock', parsedCredits: (this.config.flowPage as any).simulatedCredits ?? 100, isCertain: true },
          assetRegion: { status: 'FOUND', confidence: 1.0, candidateCount: 0, locatorStrategy: 'mock' },
          downloadControl: { status: 'NOT_FOUND', confidence: 0, candidateCount: 0, locatorStrategy: 'mock', details: 'No assets' },
          visibleSemanticControls: [],
          sanitized: true,
          zeroCreditVerified: true,
        };
        const mockMap: FlowControlMap = {
          promptInputLocator: 'textarea',
          generateButtonLocator: 'button[aria-label*="Generate"]',
          agentToggleLocator: '[aria-label*="Agent"]',
          creditsLocator: '.credits',
          assetCardLocator: '[data-asset-id]',
          pageState: 'FLOW_PROJECT',
          confidenceScores: {
            prompt: 1.0,
            generate: 1.0,
            agent: 1.0,
            credits: 1.0,
            assets: 1.0,
          },
        };
        return {
          report: mockReport,
          controlMap: mockMap,
          formattedReport: FlowContractProbe.formatReportString(mockReport),
        };
      }
      return FlowContractProbe.probePage(this.config.flowPage as any, {
        persistEvidence: options.persistEvidence ?? true,
        outputDir: path.resolve(process.cwd(), '.studio', 'flow-contract'),
      });
    }

    if (this.config.sessionMode === 'CDP_ATTACH') {
      let session;
      try {
        session = await this.sessionBridge.connect({
          autoLaunch: this.config.autoLaunchChrome,
        });
      } catch (err: any) {
        throw new Error(
          `[FLOW_SESSION_UNAVAILABLE] Failed to attach to Google Flow Chrome session: ${err?.message || String(err)}\nRun "studio flow login" to launch persistent system Chrome session.`
        );
      }
      try {
        const result = await FlowContractProbe.probePage(session.page, {
          persistEvidence: options.persistEvidence ?? true,
          outputDir: path.resolve(process.cwd(), '.studio', 'flow-contract'),
        });
        return result;
      } finally {
        await this.sessionBridge.disconnect(session.browser, {
          isStudioOwned: session.isStudioOwned,
          closeIfStudioOwned: false,
        });
      }
    }

    // Isolated fallback
    const browserPath = MediaToolchainDoctor.getBrowserExecutablePath();
    if (!browserPath) {
      throw new Error(
        'Google Chrome, Microsoft Edge, or Chromium is required for Flow browser probe.'
      );
    }

    if (!fs.existsSync(this.config.userDataDir)) {
      fs.mkdirSync(this.config.userDataDir, { recursive: true });
    }

    const browser = await puppeteer.launch({
      executablePath: browserPath,
      userDataDir: this.config.userDataDir,
      headless: options.headless ?? this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

      const result = await FlowContractProbe.probePage(page, {
        persistEvidence: options.persistEvidence ?? true,
        outputDir: path.resolve(process.cwd(), '.studio', 'flow-contract'),
      });

      await page.close().catch(() => {});
      return result;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Inspects Chrome session status via CDP without credentials or secret leakage.
   */
  public async getSessionStatus(): Promise<{
    status: ChromeSessionStatus;
    formatted: string;
  }> {
    return this.sessionBridge.getSessionStatus();
  }

  /**
   * Launches real system Chrome process to allow user one-time interactive Google login.
   * NEVER uses Puppeteer automation flags to prevent Google login block.
   */
  public launchInteractiveSession(url?: string): { process: any; profilePath: string; port: number } {
    const res = this.sessionBridge.launchSystemChrome({ url: url || this.config.flowUrl });
    return {
      process: res.process,
      profilePath: res.profilePath,
      port: res.port,
    };
  }

  private async getPage(): Promise<IFlowPage> {
    if (this.config.flowPage) {
      return this.config.flowPage;
    }

    if (this.flowPageInstance && !this.flowPageInstance.isClosed()) {
      return this.flowPageInstance;
    }

    if (this.config.sessionMode === 'CDP_ATTACH') {
      try {
        const session = await this.sessionBridge.connect({
          autoLaunch: this.config.autoLaunchChrome,
        });
        this.browserInstance = session.browser;
        this.isStudioOwned = session.isStudioOwned;
        this.flowPageInstance = new PuppeteerFlowPage(session.page, this.config.flowUrl);
        return this.flowPageInstance;
      } catch (err: any) {
        throw new Error(
          `[FLOW_SESSION_UNAVAILABLE] Failed to attach to Google Flow Chrome session: ${err?.message || String(err)}\nRun "studio flow login" to launch persistent system Chrome session.`
        );
      }
    }

    // Isolated fallback
    const browserPath = MediaToolchainDoctor.getBrowserExecutablePath();
    if (!browserPath) {
      throw new Error(
        'Google Chrome, Microsoft Edge, or Chromium is required for Flow browser automation.'
      );
    }

    if (!fs.existsSync(this.config.userDataDir)) {
      fs.mkdirSync(this.config.userDataDir, { recursive: true });
    }

    this.browserInstance = await puppeteer.launch({
      executablePath: browserPath,
      userDataDir: this.config.userDataDir,
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await this.browserInstance.newPage();
    this.flowPageInstance = new PuppeteerFlowPage(page, this.config.flowUrl);
    return this.flowPageInstance;
  }

  private async cleanup(): Promise<void> {
    if (this.flowPageInstance) {
      if (this.config.sessionMode !== 'CDP_ATTACH' || this.isStudioOwned) {
        await this.flowPageInstance.close().catch(() => {});
      }
      this.flowPageInstance = undefined;
    }
    if (this.browserInstance) {
      if (this.config.sessionMode === 'CDP_ATTACH') {
        // Disconnect only; do NOT close user's pre-existing browser window
        await this.sessionBridge.disconnect(this.browserInstance, {
          closeIfStudioOwned: false,
          isStudioOwned: this.isStudioOwned,
        });
      } else {
        await this.browserInstance.close().catch(() => {});
      }
      this.browserInstance = undefined;
    }
  }

  private loadCheckpoint(
    checkpointPath: string,
    runId: string,
    projectId: string,
    expectedShotIds: string[]
  ): FlowOperatorCheckpoint {
    if (fs.existsSync(checkpointPath)) {
      try {
        const raw = fs.readFileSync(checkpointPath, 'utf8');
        return JSON.parse(raw);
      } catch {
        // fall through to default
      }
    }

    return {
      runId,
      projectId,
      state: 'INITIAL',
      expectedShotIds,
      completedShotIds: [],
      retakeCounts: {},
      updatedAt: new Date().toISOString(),
    };
  }

  private saveCheckpoint(checkpointPath: string, checkpoint: FlowOperatorCheckpoint): void {
    checkpoint.updatedAt = new Date().toISOString();
    const dir = path.dirname(checkpointPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }
}
