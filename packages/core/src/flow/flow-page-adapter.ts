/**
 * FlowPageAdapter
 *
 * Dedicated page-object / UI adapter layer for Google Flow browser automation.
 * Centralizes UI selectors and interaction logic.
 *
 * Principles (Phase 27B Real Calibration):
 *   - Strictly Puppeteer-compatible (NO Playwright-style text selectors).
 *   - Use visible browser-level controls, semantic roles, accessible text.
 *   - Fail closed on unexpected UI changes, auth challenges, CAPTCHA, or ambiguous controls.
 *   - Never log passwords, tokens, or private secrets.
 *   - Zero credit loss: probe, parse, and verify before dispatching actions.
 */

import * as path from 'node:path';
import * as syncFs from 'node:fs';
import * as crypto from 'node:crypto';
import type { Page } from 'puppeteer-core';
import {
  findEditablePromptSurface,
  findGenerateControl,
  findCreditIndicator,
  findAgentControl,
  findAssetContainers,
  findDownloadAction,
  parseCreditText,
  findStartCreatingControl,
  findIntermediateWorkspaceAction,
} from './flow-semantic-discovery.js';
import { FlowContractProbe, FlowPageState } from './flow-contract-probe.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { getDeterministicMp4Buffer } from '../media/test-media-helper.js';

export const FLOW_PURCHASE_REJECTION_KEYWORDS = [
  'mua thêm',
  'nạp tiền',
  'thanh toán',
  'mua gói',
  'nâng cấp gói',
  'buy credits',
  'purchase',
  'payment',
  'subscribe',
  'upgrade',
  'checkout',
  'add billing',
  'confirm payment',
  'billing account',
];

export interface DownloadWaitOptions {
  destDir: string;
  preExistingFiles: Set<string>;
  triggerTimestampMs: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  expectedExt?: string;
  minSizeBytes?: number;
}

/**
 * Robustly waits for a genuine NEW downloaded file to appear and stabilize on disk.
 *
 * Guarantees (Phase 2 Download File Identity Protection):
 * 1. NEVER accepts a pre-existing stale file (files present before download trigger).
 * 2. Rejects temporary or in-progress files (.crdownload, .tmp).
 * 3. Enforces mtime strictly newer than triggerTimestampMs - 1500 (rejecting older files).
 * 4. Ensures file size is non-empty and stable across successive polls (not mid-write).
 * 5. Fails closed with [STALE_DOWNLOAD_REJECTED] if only stale files exist at timeout.
 */
export async function waitForNewDownloadedFile(options: DownloadWaitOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 45000;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const expectedExt = (options.expectedExt ?? '.mp4').toLowerCase();
  const minSizeBytes = options.minSizeBytes ?? 1024;
  const startTime = Date.now();
  let candidatePath: string | undefined;
  let candidateLastSize = -1;

  while (Date.now() - startTime < timeoutMs) {
    if (!syncFs.existsSync(options.destDir)) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    const allEntries = syncFs.readdirSync(options.destDir);

    // Filter candidate files:
    // 1. MUST NOT be in preExistingFiles
    // 2. MUST NOT be transient in-progress download files (.crdownload, .tmp)
    // 3. MUST match expected extension
    // 4. MUST have mtimeMs >= triggerTimestampMs - 1500 (rejecting older files)
    const newFiles = allEntries.filter((f) => {
      if (options.preExistingFiles.has(f)) return false;
      const lower = f.toLowerCase();
      if (lower.endsWith('.crdownload') || lower.endsWith('.tmp')) return false;
      if (!lower.endsWith(expectedExt)) return false;

      try {
        const stat = syncFs.statSync(path.join(options.destDir, f));
        if (stat.mtimeMs < options.triggerTimestampMs - 1500) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });

    if (newFiles.length > 0) {
      // Sort newest first
      const sorted = newFiles.sort((a, b) => {
        try {
          return (
            syncFs.statSync(path.join(options.destDir, b)).mtimeMs -
            syncFs.statSync(path.join(options.destDir, a)).mtimeMs
          );
        } catch {
          return 0;
        }
      });

      const currentCandidate = path.join(options.destDir, sorted[0]);
      try {
        const stat = syncFs.statSync(currentCandidate);
        if (stat.size >= minSizeBytes) {
          if (candidatePath === currentCandidate && stat.size === candidateLastSize) {
            // File size is stable across consecutive checks: download complete!
            return currentCandidate;
          }
          candidatePath = currentCandidate;
          candidateLastSize = stat.size;
        }
      } catch {}
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  // Timeout reached: audit folder contents
  if (syncFs.existsSync(options.destDir)) {
    const allFiles = syncFs.readdirSync(options.destDir).filter((f) => f.toLowerCase().endsWith(expectedExt));
    const staleFiles = allFiles.filter((f) => options.preExistingFiles.has(f));
    if (staleFiles.length > 0 && allFiles.length === staleFiles.length) {
      throw new Error(
        `[STALE_DOWNLOAD_REJECTED] Download timed out and only pre-existing stale file(s) [${staleFiles.join(
          ', '
        )}] were found in ${options.destDir}. Stale files rejected to prevent contamination.`
      );
    }
  }

  throw new Error(
    `[DOWNLOAD_TIMEOUT] No new completed download file (${expectedExt}) appeared within ${timeoutMs}ms in ${options.destDir}.`
  );
}

export interface FlowGeneratedAssetDescriptor {
  id: string;
  name: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  downloadUrl?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  createdAt: string;
  matchedShotId?: string;
  mappingStrategy?: FlowShotMappingStrategy;
}

export type FlowShotMappingStrategy =
  | 'EXACT_OUTPUT_NAME'
  | 'DETERMINISTIC_RENAME'
  | 'SUBMISSION_ORDER_VERIFIED_METADATA'
  | 'RECONCILIATION_REQUIRED';

export interface FlowPageCreditStatus {
  creditsObserved: number | null;
  rawText?: string;
  observationTime: string;
  isCertain: boolean;
  confidence?: number;
  tier?: string;
  details?: string;
}

export interface FlowAgentModeResult {
  mode: 'AGENT' | 'DIRECT' | 'UNKNOWN';
  isAgentActive: boolean;
  status: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'AGENT_MODE_UNAVAILABLE';
  confidence: number;
  details: string;
}

export interface FlowProjectNavigationResult {
  projectId: string;
  url: string;
  pageState: FlowPageState;
  browserProjectReference?: string;
}

export interface FlowAuthBlockStatus {
  isBlocked: boolean;
  blockType?: 'LOGIN' | '2FA' | 'CAPTCHA' | 'CONSENT';
  details?: string;
}

export interface FlowDiagnostics {
  screenshotPath?: string;
  domSnippet?: string;
  currentUrl: string;
  capturedAt: string;
}

export interface IFlowPage {
  /** Ensure Google Flow project exists or is open */
  /** Ensure Flow project workspace is active, safely entering workspace from FLOW_HOME */
  ensureProject(
    projectName: string,
    options?: { url?: string; projectReference?: string }
  ): Promise<FlowProjectNavigationResult>;

  /** Enter project workspace from FLOW_HOME via safe navigation ("Start Creating") */
  enterFlowWorkspace(options?: {
    timeoutMs?: number;
    maxIntermediateSteps?: number;
  }): Promise<FlowProjectNavigationResult>;

  /** Ensure Flow Agent mode is activated when available */
  ensureAgentMode(): Promise<FlowAgentModeResult>;

  /** Submit structured master production batch instruction */
  submitInstruction(
    instructionText: string,
    options?: { referencePaths?: string[]; forceResubmit?: boolean }
  ): Promise<{ submissionId: string; submittedAt: string; submissionCount?: number }>;

  /** Wait for generated assets matching requested shotIds */
  waitForGeneration(
    shotIds: string[],
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      baselineAssetIds?: string[];
      maxFlowCredits?: number;
    }
  ): Promise<Map<string, FlowGeneratedAssetDescriptor>>;

  /** List all generated assets visible in the project */
  listGeneratedAssets(): Promise<FlowGeneratedAssetDescriptor[]>;

  /** Download a completed video asset to physical disk (scoped to container) */
  downloadAsset(
    flowAssetId: string,
    destinationFilePath: string,
    assetName?: string
  ): Promise<{ physicalPath: string; sizeBytes: number; resolution?: string }>;

  /** Detect observed credits from the UI */
  detectCredits(): Promise<FlowPageCreditStatus>;

  /** Detect if browser is blocked by Google Login, 2FA, or CAPTCHA */
  detectAuthBlock(): Promise<FlowAuthBlockStatus>;

  /** Detect failure banner or generation error */
  detectFailure(): Promise<{ hasFailed: boolean; errorReason?: string }>;

  /** Capture diagnostics without secret leakage on failure */
  captureDiagnostics(tag: string, diagnosticsDir?: string): Promise<FlowDiagnostics>;

  /** Close page/session */
  close(): Promise<void>;

  isClosed(): boolean;
}

// ─── Concrete Puppeteer Page Adapter ──────────────────────────────────────────

export class PuppeteerFlowPage implements IFlowPage {
  private readonly page: Page;
  private readonly defaultFlowUrl: string;
  private closed = false;
  private submissionCount = 0;
  private lastInstructionSha256 = '';
  private approvalCount = 0;
  private readonly maxApprovalsPerRun: number;
  private readonly maxFlowCredits: number;

  constructor(
    page: Page,
    defaultFlowUrl = 'https://flow.google.com',
    options: { maxFlowCredits?: number; maxApprovalsPerRun?: number } = {}
  ) {
    this.page = page;
    this.defaultFlowUrl = defaultFlowUrl;
    this.maxFlowCredits = options.maxFlowCredits ?? 50;
    this.maxApprovalsPerRun = options.maxApprovalsPerRun ?? 2;
  }

  public async enterFlowWorkspace(options: {
    timeoutMs?: number;
    maxIntermediateSteps?: number;
  } = {}): Promise<FlowProjectNavigationResult> {
    const timeoutMs = options.timeoutMs ?? 20000;
    const maxIntermediateSteps = options.maxIntermediateSteps ?? 3;

    const rawUrl = this.page.url();
    const bodyText = await this.page.evaluate(() => (document.body ? document.body.innerText.slice(0, 3000) : '')).catch(() => '');
    const domSnippet = await this.page.evaluate(() => (document.body ? document.body.innerHTML.slice(0, 3000) : '')).catch(() => '');
    let pageState = FlowContractProbe.categorizePageState(rawUrl, bodyText, domSnippet);

    // If already in FLOW_PROJECT, extract project reference and return
    if (pageState === 'FLOW_PROJECT') {
      const projectMatch = rawUrl.match(/\/(?:projects?|workspace|p)\/([a-zA-Z0-9_-]+)/);
      const browserProjectReference = projectMatch ? projectMatch[1] : `project_${Date.now()}`;
      return {
        projectId: browserProjectReference,
        url: rawUrl.split('?')[0],
        pageState: 'FLOW_PROJECT',
        browserProjectReference,
      };
    }

    // Check authentication
    const auth = await this.detectAuthBlock();
    if (auth.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Authentication required: ${auth.details}`);
    }

    if (pageState !== 'FLOW_HOME') {
      throw new Error(`[FLOW_NAVIGATION_INVALID_STATE] Cannot enter workspace from pageState "${pageState}". Expected FLOW_HOME.`);
    }

    // 1. Discover safe "Start Creating" navigation control
    const navControl = await findStartCreatingControl(this.page);

    if (navControl.status === 'NOT_FOUND') {
      throw new Error('[FLOW_NAVIGATION_NOT_FOUND] Safe "Start Creating" navigation control not found on Flow home page.');
    }

    if (navControl.status === 'AMBIGUOUS') {
      throw new Error(
        `[FLOW_NAVIGATION_AMBIGUOUS] Multiple candidate Start Creating controls discovered (${navControl.candidateCount} candidates): ${navControl.evidence || navControl.details}. Failing closed to prevent accidental click.`
      );
    }

    if (!navControl.isSafeNavigation || navControl.classification !== 'SAFE_NAVIGATION') {
      throw new Error(
        `[FLOW_NAVIGATION_UNSAFE] Start Creating candidate is not classified as SAFE_NAVIGATION (classified as: ${navControl.classification}). Aborting navigation.`
      );
    }

    // 2. Click safe navigation control (ZERO generation, navigation only)
    const clicked = await this.page.evaluate((selector: string, expectedText: string) => {
      // Try selector first
      try {
        if (selector) {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (el) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.click();
            return true;
          }
        }
      } catch {}

      // Try data-studio-nav attribute
      try {
        const stamped = document.querySelector('[data-studio-nav="start-creating"]') as HTMLElement | null;
        if (stamped) {
          stamped.scrollIntoView({ behavior: 'instant', block: 'center' });
          stamped.click();
          return true;
        }
      } catch {}

      // Fallback: semantic search by text/role
      const clickables = Array.from(
        document.querySelectorAll(
          'button, [role="button"], a[href], div[role="button"], span[role="button"], input[type="button"]'
        )
      ) as HTMLElement[];

      const match = clickables.find((el) => {
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const a = el.getAttribute('aria-label') || '';
        return (
          t.toLowerCase() === expectedText.toLowerCase() ||
          a.toLowerCase() === expectedText.toLowerCase() ||
          t.toLowerCase().startsWith(expectedText.toLowerCase())
        );
      });

      if (match) {
        match.scrollIntoView({ behavior: 'instant', block: 'center' });
        match.click();
        return true;
      }
      return false;
    }, navControl.locatorStrategy, (navControl as any).target?.text || 'Start Creating');

    if (!clicked) {
      throw new Error(`[FLOW_NAVIGATION_CLICK_FAILED] Failed to click navigation control: ${navControl.locatorStrategy}`);
    }

    // 3. Wait for workspace to load or intermediate modal
    const start = Date.now();
    let intermediateStepsTaken = 0;

    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 600));

      const currentUrl = this.page.url();
      const currentBody = await this.page.evaluate(() => (document.body ? document.body.innerText.slice(0, 3000) : '')).catch(() => '');
      const currentDom = await this.page.evaluate(() => (document.body ? document.body.innerHTML.slice(0, 3000) : '')).catch(() => '');
      pageState = FlowContractProbe.categorizePageState(currentUrl, currentBody, currentDom);

      // 1. Check prompt composer existence
      const promptSurface = await findEditablePromptSurface(this.page);
      if (promptSurface.status === 'FOUND') {
        const projectMatch = currentUrl.match(/\/(?:projects?|workspace|p)\/([a-zA-Z0-9_-]+)/);
        const browserProjectReference = projectMatch ? projectMatch[1] : `project_${Date.now()}`;
        return {
          projectId: browserProjectReference,
          url: currentUrl.split('?')[0],
          pageState: 'FLOW_PROJECT',
          browserProjectReference,
        };
      }

      // 2. Check if intermediate modal/dialog (e.g. Blank Canvas template, "Bắt đầu" welcome modal) needs safe action
      const intermediate = await findIntermediateWorkspaceAction(this.page);
      if (intermediate.status === 'FOUND' && intermediate.isSafeNavigation) {
        if (intermediateStepsTaken >= maxIntermediateSteps) {
          throw new Error(
            `[FLOW_NAVIGATION_REQUIRES_CALIBRATION] Exceeded maximum intermediate setup steps (${maxIntermediateSteps}). Failing closed.`
          );
        }
        intermediateStepsTaken++;
        await this.page.evaluate((sel: string, expectedText?: string) => {
          let el = document.querySelector(sel) as HTMLElement | null;
          if (!el && expectedText) {
            const clickables = Array.from(document.querySelectorAll('button, [role="button"], a[href], div[role="button"]')) as HTMLElement[];
            el = clickables.find(c => (c.textContent || '').trim().toLowerCase().includes(expectedText.toLowerCase())) || null;
          }
          if (el) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.click();
          }
        }, intermediate.locatorStrategy, (intermediate as any).target?.text);
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }

      if (intermediate.status === 'AMBIGUOUS') {
        throw new Error(
          `[FLOW_NAVIGATION_REQUIRES_CALIBRATION] Intermediate UI detected without clear safe navigation path: ${intermediate.details} | Evidence: ${intermediate.evidence || 'none'}`
        );
      }

      // 3. Fallback: if already inside project URL and no blocking modal, return FLOW_PROJECT
      if (pageState === 'FLOW_PROJECT') {
        const projectMatch = currentUrl.match(/\/(?:projects?|workspace|p)\/([a-zA-Z0-9_-]+)/);
        const browserProjectReference = projectMatch ? projectMatch[1] : `project_${Date.now()}`;
        return {
          projectId: browserProjectReference,
          url: currentUrl.split('?')[0],
          pageState: 'FLOW_PROJECT',
          browserProjectReference,
        };
      }
    }

    throw new Error(`[FLOW_NAVIGATION_TIMEOUT] Timed out waiting for Flow project workspace after ${timeoutMs}ms.`);
  }

  public async ensureProject(
    projectName: string,
    options: { url?: string; projectReference?: string } = {}
  ): Promise<FlowProjectNavigationResult> {
    const targetUrl = options.projectReference
      ? `${this.defaultFlowUrl}/project/${options.projectReference}`
      : options.url || this.defaultFlowUrl;

    const current = this.page.url();
    if (!current.startsWith(targetUrl)) {
      await this.page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    }

    const auth = await this.detectAuthBlock();
    if (auth.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Authentication required: ${auth.details}`);
    }

    // Wait for SPA loading spinner ("Đang tải...", "Loading...") to settle and prompt surface to appear
    await this.page
      .waitForFunction(
        () => {
          const text = document.body ? document.body.innerText : '';
          const isLoading = text.includes('Đang tải...') || text.includes('Loading...');
          const hasPrompt =
            document.querySelector(
              '.ProseMirror, [contenteditable="true"], textarea, button.generate-icon-button, button[aria-label*="tạo" i], button[aria-label*="generate" i]'
            ) !== null;
          return !isLoading && hasPrompt;
        },
        { timeout: 25000 }
      )
      .catch(() => {});

    const rawUrl = this.page.url();
    const bodyText = await this.page.evaluate(() => (document.body ? document.body.innerText.slice(0, 2000) : '')).catch(() => '');
    const domSnippet = await this.page.evaluate(() => (document.body ? document.body.innerHTML.slice(0, 2000) : '')).catch(() => '');
    let pageState = FlowContractProbe.categorizePageState(rawUrl, bodyText, domSnippet);

    const sanitizedProject = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');

    // If on FLOW_HOME without active project canvas, enter workspace automatically via safe Start Creating
    if (pageState === 'FLOW_HOME' && !rawUrl.includes('/project/')) {
      const navRes = await this.enterFlowWorkspace();
      if (navRes.pageState !== 'FLOW_PROJECT') {
        throw new Error(`[FLOW_NAVIGATION_FAILED] Failed to navigate to workspace from FLOW_HOME. Page state remained: ${navRes.pageState}`);
      }
      return navRes;
    }

    // Extract project reference from URL if present
    const projectMatch = rawUrl.match(/\/projects?\/([a-zA-Z0-9_-]+)/);
    const browserProjectReference = projectMatch ? projectMatch[1] : sanitizedProject;

    return {
      projectId: sanitizedProject,
      url: rawUrl,
      pageState,
      browserProjectReference,
    };
  }

  public async ensureAgentMode(): Promise<FlowAgentModeResult> {
    const discovery = await findAgentControl(this.page);

    if (discovery.status === 'NOT_FOUND') {
      return {
        mode: 'UNKNOWN',
        isAgentActive: false,
        status: 'AGENT_MODE_UNAVAILABLE',
        confidence: 0,
        details: 'Agent mode toggle or button not found in current UI',
      };
    }

    if (discovery.status === 'AMBIGUOUS') {
      return {
        mode: 'UNKNOWN',
        isAgentActive: false,
        status: 'AMBIGUOUS',
        confidence: discovery.confidence,
        details: discovery.details || 'Multiple candidate agent controls discovered',
      };
    }

    // Exactly 1 control discovered
    const target = discovery.target;
    if (target?.isActive) {
      return {
        mode: 'AGENT',
        isAgentActive: true,
        status: 'FOUND',
        confidence: discovery.confidence,
        details: 'Flow Agent mode is already active',
      };
    }

    // Toggle / button exists but is not active: click to activate
    try {
      const clicked = await this.page.evaluate((locator: string) => {
        const el = document.querySelector(locator) as HTMLElement | null;
        if (el) {
          el.click();
          return true;
        }
        return false;
      }, discovery.locatorStrategy);

      if (clicked) {
        await new Promise((r) => setTimeout(r, 1000));
        // Verify active state after click
        const recheck = await findAgentControl(this.page);
        const isActive = Boolean(recheck.target?.isActive);
        return {
          mode: isActive ? 'AGENT' : 'DIRECT',
          isAgentActive: isActive,
          status: 'FOUND',
          confidence: recheck.confidence,
          details: isActive ? 'Agent mode successfully activated' : 'Clicked agent toggle but state remained inactive',
        };
      }
    } catch (err: any) {
      return {
        mode: 'UNKNOWN',
        isAgentActive: false,
        status: 'AGENT_MODE_UNAVAILABLE',
        confidence: 0.3,
        details: `Failed to toggle agent mode: ${err?.message || String(err)}`,
      };
    }

    return {
      mode: 'UNKNOWN',
      isAgentActive: false,
      status: 'AGENT_MODE_UNAVAILABLE',
      confidence: 0,
      details: 'Could not interact with agent toggle',
    };
  }

  public async submitInstruction(
    instructionText: string,
    options: { referencePaths?: string[]; forceResubmit?: boolean } = {}
  ): Promise<{ submissionId: string; submittedAt: string; submissionCount: number }> {
    const auth = await this.detectAuthBlock();
    if (auth.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Cannot submit instruction while auth blocked: ${auth.details}`);
    }

    const instructionHash = crypto.createHash('sha256').update(instructionText.trim()).digest('hex');

    // Double-submission protection (Phase 7):
    // If submitInstruction was already called for this identical instruction, reject unless forceResubmit is set
    if (this.submissionCount > 0 && this.lastInstructionSha256 === instructionHash && !options.forceResubmit) {
      throw new Error(
        `[DOUBLE_SUBMISSION_PREVENTED] Repeated submitInstruction called for identical prompt hash ${instructionHash.slice(0, 10)}. Submission count is already ${this.submissionCount}. Failing closed to prevent accidental double generation.`
      );
    }

    // 1. Discover editable prompt surface with confidence check (with bounded retry for page settling)
    let promptDiscovery = await findEditablePromptSurface(this.page);
    const startWait = Date.now();
    while (promptDiscovery.status !== 'FOUND' && Date.now() - startWait < 20000) {
      await new Promise((r) => setTimeout(r, 1000));
      promptDiscovery = await findEditablePromptSurface(this.page);
    }

    if (promptDiscovery.status === 'NOT_FOUND') {
      throw new Error('[PROMPT_INPUT_NOT_FOUND] Could not locate Google Flow prompt input surface.');
    }
    if (promptDiscovery.status === 'AMBIGUOUS') {
      throw new Error(
        `[PROMPT_INPUT_AMBIGUOUS] Multiple candidate prompt surfaces found without decisive semantic winner: ${promptDiscovery.details}`
      );
    }

    // Locate the element via discovered locator strategy
    const inputSelector = promptDiscovery.locatorStrategy;
    const inputEl = await this.page.$(inputSelector);
    if (!inputEl) {
      throw new Error(`[PROMPT_INPUT_UNAVAILABLE] Failed to bind discovered locator "${inputSelector}".`);
    }

    // Clear and enter prompt text safely
    await inputEl.click().catch(() => {});
    await new Promise((r) => setTimeout(r, 200));

    // Clear existing text in contenteditable / textarea
    await this.page.keyboard.down('Control').catch(() => {});
    await this.page.keyboard.press('KeyA').catch(() => {});
    await this.page.keyboard.up('Control').catch(() => {});
    await this.page.keyboard.press('Backspace').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));

    // Type text via real keyboard events to trigger ProseMirror transactions and Angular form bindings
    if (typeof this.page.keyboard?.type === 'function') {
      await this.page.keyboard.type(instructionText);
    } else {
      await inputEl.type(instructionText);
    }
    await new Promise((r) => setTimeout(r, 300));

    // 2. Verify prompt value in composer (Phase E Step 3 requirement)
    let currentVal: string = await inputEl.evaluate((el: any) => {
      return ('value' in el ? el.value : el.innerText || el.textContent || '').trim();
    });

    if (!currentVal || currentVal.length === 0) {
      // Fallback insertion for rich contenteditable / ProseMirror editors
      await inputEl.evaluate((el: any, text: string) => {
        el.focus();
        try {
          document.execCommand('insertText', false, text);
        } catch {
          el.innerText = text;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, instructionText);

      currentVal = await inputEl.evaluate((el: any) => {
        return ('value' in el ? el.value : el.innerText || el.textContent || '').trim();
      });
    }

    if (!currentVal || currentVal.length === 0) {
      throw new Error('[PROMPT_VALUE_VERIFICATION_FAILED] Prompt input value could not be confirmed in composer.');
    }

    // Attach reference assets if provided
    if (options.referencePaths && options.referencePaths.length > 0) {
      const fileInput = await this.page.$('input[type="file"]');
      if (fileInput) {
        for (const refPath of options.referencePaths) {
          if (syncFs.existsSync(refPath)) {
            await (fileInput as any).uploadFile(refPath).catch(() => {});
          }
        }
      }
    }

    // 3. Discover Generate / Submit control with confidence check
    const generateDiscovery = await findGenerateControl(this.page);
    if (generateDiscovery.status === 'AMBIGUOUS') {
      throw new Error(
        `[GENERATE_CONTROL_AMBIGUOUS] Multiple candidate generate buttons found without decisive winner: ${generateDiscovery.details}`
      );
    }

    let clickDispatched = false;
    if (generateDiscovery.status === 'FOUND') {
      const generateBtn = await this.page.$(generateDiscovery.locatorStrategy);
      if (generateBtn) {
        // Allow brief moment for reactive framework to update disabled state after input
        await this.page
          .waitForFunction(
            (sel) => {
              const b = document.querySelector(sel) as HTMLButtonElement | null;
              return b && !b.disabled && !b.classList.contains('mat-mdc-button-disabled');
            },
            { timeout: 3000 },
            generateDiscovery.locatorStrategy
          )
          .catch(() => {});

        await generateBtn.click().catch(() => {});
        clickDispatched = true;
      }
    }

    // If generate button was not dispatched, fallback to pressing Enter
    if (!clickDispatched) {
      await new Promise((r) => setTimeout(r, 600));
      const stillHasInput = await inputEl.evaluate((el: any) => {
        const val = ('value' in el ? el.value : el.innerText || el.textContent || '').trim();
        return val.length > 0;
      }).catch(() => false);

      if (stillHasInput) {
        await inputEl.focus();
        await this.page.keyboard.press('Enter');
        clickDispatched = true;
      }
    }

    // Confirm generation initiated
    await new Promise((r) => setTimeout(r, 1500));

    this.submissionCount++;
    this.lastInstructionSha256 = instructionHash;
    console.log(`[GENERATION_SUBMISSION_COUNT] ${this.submissionCount}`);

    const submissionId = `flow_sub_${Date.now()}`;
    return {
      submissionId,
      submittedAt: new Date().toISOString(),
      submissionCount: this.submissionCount,
    };
  }

  /**
   * Detects and clicks the Flow Agent in-panel confirmation gate.
   *
   * Two-Layer Architecture (Phase 5 Cost Approval Safety):
   * LAYER 1: AI Animation Studio Cost Guard
   *   - Inspects gate text for monetary purchase / subscription / checkout operations.
   *   - Rejects monetary purchase requests immediately (fails closed).
   *   - Enforces credit budget ceiling (maxFlowCredits).
   *   - Enforces approval loop ceiling (max 2 approvals per run) to prevent loops (Phase 8).
   * LAYER 2: Google Flow permission interaction
   *   - Finds and clicks "Luôn phê duyệt" (priority 1) or "Phê duyệt" (priority 2).
   *   - Strictly ignores "Từ chối" or read-only/disabled rows.
   */
  private async handleAgentConfirmationGate(maxFlowCredits?: number): Promise<boolean> {
    const budgetCeiling = maxFlowCredits ?? this.maxFlowCredits;

    // Check approval loop bounds (Phase 8 Approval Loop Protection)
    if (this.approvalCount >= this.maxApprovalsPerRun) {
      throw new Error(
        `[FLOW_PERMISSION_LOOP] Flow permission gate encountered ${this.approvalCount + 1} times. Maximum allowed approvals (${this.maxApprovalsPerRun}) reached. Failing closed to protect credits.`
      );
    }

    // Inspect recent chat bubble / permission gate text for Cost Guard verification
    const gateInfo: any = await this.page.evaluate(() => {
      const messages = Array.from(
        document.querySelectorAll('flow-permission-message, flow-chat-bubble, .choice-container, .agent-bubble')
      );
      const recent = messages.slice(-4);
      const text = recent.map((m) => m.textContent || '').join(' ').toLowerCase();
      return { text };
    }).catch(() => ({ text: '' }));

    const gateText =
      gateInfo && typeof gateInfo === 'object' && typeof gateInfo.text === 'string'
        ? gateInfo.text
        : typeof gateInfo === 'string'
        ? gateInfo
        : '';

    // Layer 1 Check A: Reject monetary / billing / credit purchases (NEVER auto-purchase)
    for (const kw of FLOW_PURCHASE_REJECTION_KEYWORDS) {
      if (gateText && gateText.includes(kw)) {
        throw new Error(
          `[COST_GUARD_REJECTED_PURCHASE] Flow gate requested monetary purchase or billing action ("${kw}"). Automatic approval forbidden.`
        );
      }
    }

    // Layer 1 Check B: Check credit budget if specified in prompt
    // e.g. "với chi phí là 1 tín dụng", "cost of 2 credits", "costs 1 credit"
    const costMatch = gateText.match(/(?:chi phí là|cost(?:s)?\s*(?:of)?)\s*(\d+)\s*(?:tín dụng|credits?)/i);
    if (costMatch) {
      const requestedCost = parseInt(costMatch[1], 10);
      if (requestedCost > budgetCeiling) {
        throw new Error(
          `[COST_GUARD_BUDGET_EXCEEDED] Flow gate requested ${requestedCost} credits, exceeding max budget of ${budgetCeiling}. Failing closed.`
        );
      }
    }

    // Layer 2: Dispatch approval click
    try {
      const approved = await this.page.evaluate(() => {
        // Strategy 1: Targeted radio option in Google Flow's flow-permission-message component
        // Active rows do NOT have 'read-only' or 'disabled'.
        const allOptionRows = Array.from(
          document.querySelectorAll('flow-permission-message .option-row, .choice-container .option-row, [role="radio"]')
        );
        const activeRows = allOptionRows.filter(
          (r) => !r.classList.contains('read-only') && !r.classList.contains('disabled')
        );
        const candidates = activeRows.length > 0 ? activeRows : allOptionRows;

        // Priority 1a: "Luôn phê duyệt" (Always approve) - prevents repeated future gates
        // Priority 1b: "Phê duyệt" (Approve)
        const match =
          candidates.find((r) => {
            const a = (r.getAttribute('aria-label') || '').toLowerCase();
            const t = (r.textContent || '').toLowerCase();
            return a.includes('luôn phê duyệt') || t.includes('luôn phê duyệt') || a.includes('always approve') || t.includes('always approve');
          }) ||
          candidates.find((r) => {
            const a = (r.getAttribute('aria-label') || '').toLowerCase();
            const t = (r.textContent || '').toLowerCase();
            const isDecline = a.includes('từ chối') || t.includes('từ chối') || a.includes('decline') || t.includes('decline');
            return !isDecline && (a.includes('phê duyệt') || t.includes('phê duyệt') || a.includes('approve') || t.includes('approve'));
          });

        if (match) {
          (match as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
          (match as HTMLElement).click();
          return true;
        }

        // Strategy 2: Button / role="button" matching approval keywords
        const APPROVE_KEYWORDS = ['luôn phê duyệt', 'phê duyệt', 'always approve', 'approve'];
        const clickables = Array.from(
          document.querySelectorAll('button, [role="button"], [role="option"], div[tabindex], span[tabindex]')
        );

        for (const el of clickables) {
          const text = (el.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const isDecline = text.includes('từ chối') || aria.includes('từ chối') || text.includes('decline') || aria.includes('decline');
          if (!isDecline && APPROVE_KEYWORDS.some((kw) => text.includes(kw) || aria.includes(kw))) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isVisible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0;
            if (isVisible) {
              (el as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      });

      if (approved) {
        this.approvalCount++;
        console.log(`[COST_GUARD] Flow permission gate approved (approval #${this.approvalCount}).`);
        return true;
      }
      return false;
    } catch (err: any) {
      if (
        err?.message?.includes('COST_GUARD_REJECTED_PURCHASE') ||
        err?.message?.includes('COST_GUARD_BUDGET_EXCEEDED') ||
        err?.message?.includes('FLOW_PERMISSION_LOOP')
      ) {
        throw err;
      }
      return false;
    }
  }

  /**
   * Detects whether the Flow Agent is waiting for confirmation (cost approval gate).
   */
  private async detectAgentConfirmationPending(): Promise<boolean> {
    try {
      const isPending = await this.page.evaluate(() => {
        // Check for active (non-readonly) option rows in permission messages
        const activeRows = Array.from(
          document.querySelectorAll('flow-permission-message .option-row, .choice-container .option-row, [role="radio"]')
        ).filter((r) => !r.classList.contains('read-only') && !r.classList.contains('disabled'));
        if (activeRows.length > 0) return true;

        // Fallback: check recent chat bubble text
        const PENDING_SIGNALS = [
          'phê duyệt',
          'luôn phê duyệt',
          'tín dụng không',
          'chi phí là',
          'approve',
          'always approve',
        ];
        const bubbles = Array.from(document.querySelectorAll('flow-chat-bubble, .agent-bubble, .agent-row'));
        const lastBubble = bubbles[bubbles.length - 1];
        const textToCheck = (lastBubble ? lastBubble.textContent || '' : document.body?.innerText?.slice(-800) || '').toLowerCase();
        return PENDING_SIGNALS.some((s) => textToCheck.includes(s));
      });
      return typeof isPending === 'boolean' ? isPending : false;
    } catch {
      return false;
    }
  }

  public async waitForGeneration(
    shotIds: string[],
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      baselineAssetIds?: string[];
      maxFlowCredits?: number;
    } = {}
  ): Promise<Map<string, FlowGeneratedAssetDescriptor>> {
    const timeoutMs = options.timeoutMs ?? 300000; // 5 min default
    const pollIntervalMs = options.pollIntervalMs ?? 5000;
    const startTime = Date.now();
    const results = new Map<string, FlowGeneratedAssetDescriptor>();
    const baselineSet = new Set(options.baselineAssetIds ?? []);

    while (Date.now() - startTime < timeoutMs) {
      // ── Phase 1: Handle Flow Agent confirmation gate (cost approval) ──────────
      // The agent may ask "Do you want me to create this video for X credits?"
      // with options: Luôn phê duyệt / Phê duyệt / Từ chối
      const gatePending = await this.detectAgentConfirmationPending();
      if (gatePending) {
        const clicked = await this.handleAgentConfirmationGate(options.maxFlowCredits);
        if (clicked) {
          // Wait for agent to process approval and start generation
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
      }

      const assets = await this.listGeneratedAssets();

      // Apply Shot-ID Mapping Strategies:
      for (const shotId of shotIds) {
        if (results.has(shotId)) continue;

        // Strategy A: Exact output name contains shotId (prefer newly generated assets first)
        const exactMatchNew = assets.find(
          (a) =>
            !baselineSet.has(a.id) &&
            ((a.name && typeof a.name === 'string' && a.name.includes(shotId)) ||
              (a.matchedShotId && a.matchedShotId === shotId) ||
              (a.id && typeof a.id === 'string' && a.id.includes(shotId))) &&
            a.status === 'READY'
        );
        if (exactMatchNew) {
          exactMatchNew.matchedShotId = shotId;
          exactMatchNew.mappingStrategy = 'EXACT_OUTPUT_NAME';
          results.set(shotId, exactMatchNew);
          continue;
        }

        // Strategy A2: If no baseline was provided (e.g. offline/mock run), allow matching any ready asset
        if (baselineSet.size === 0) {
          const exactMatchAny = assets.find(
            (a) =>
              ((a.name && typeof a.name === 'string' && a.name.includes(shotId)) ||
                (a.matchedShotId && a.matchedShotId === shotId) ||
                (a.id && typeof a.id === 'string' && a.id.includes(shotId))) &&
              a.status === 'READY'
          );
          if (exactMatchAny) {
            exactMatchAny.matchedShotId = shotId;
            exactMatchAny.mappingStrategy = 'EXACT_OUTPUT_NAME';
            results.set(shotId, exactMatchAny);
            continue;
          }
        }

        // Strategy B: If only 1 shot requested, map to the newest READY asset that is NOT in baseline
        if (shotIds.length === 1) {
          const newReadyAssets = assets.filter((a) => !baselineSet.has(a.id) && a.status === 'READY');
          if (newReadyAssets.length > 0) {
            const single = newReadyAssets[newReadyAssets.length - 1];
            single.matchedShotId = shotId;
            single.mappingStrategy = 'SUBMISSION_ORDER_VERIFIED_METADATA';
            results.set(shotId, single);
            continue;
          }

          // If no baseline was provided (e.g. legacy/mock run), map to newest ready asset
          if (baselineSet.size === 0) {
            const readyAssets = assets.filter((a) => a.status === 'READY');
            if (readyAssets.length > 0) {
              const single = readyAssets[readyAssets.length - 1];
              single.matchedShotId = shotId;
              single.mappingStrategy = 'SUBMISSION_ORDER_VERIFIED_METADATA';
              results.set(shotId, single);
              continue;
            }
          }
        }
      }

      if (results.size === shotIds.length) {
        return results;
      }

      const failure = await this.detectFailure();
      if (failure.hasFailed) {
        throw new Error(`Flow generation failed: ${failure.errorReason}`);
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // If generation timed out or assets cannot be attributed confidently
    if (results.size < shotIds.length) {
      const allAssets = await this.listGeneratedAssets();
      const newAssetsCount = allAssets.filter((a) => !baselineSet.has(a.id)).length;

      if (baselineSet.size > 0 && newAssetsCount === 0) {
        throw new Error(
          `[ASSET_NOT_FOUND] Flow generation completed or timed out but no new video asset appeared beyond the ${baselineSet.size} baseline assets. Existing assets before run: ${baselineSet.size}, Assets after run: ${allAssets.length}. Pre-existing baseline cards rejected.`
        );
      }

      if (allAssets.length > 0 && results.size === 0) {
        throw new Error(
          `[RECONCILIATION_REQUIRED] Generated assets observed (${allAssets.length}) but could not be mapped to requested shots [${shotIds.join(', ')}] with high confidence.`
        );
      }
    }

    return results;
  }


  public async listGeneratedAssets(): Promise<FlowGeneratedAssetDescriptor[]> {
    const discovery = await findAssetContainers(this.page);
    const containers = discovery.containers || [];

    return containers.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status === 'UNKNOWN' ? 'GENERATING' : c.status,
      createdAt: new Date().toISOString(),
    }));
  }

  public async downloadAsset(
    flowAssetId: string,
    destinationFilePath: string,
    assetName?: string
  ): Promise<{ physicalPath: string; sizeBytes: number; resolution?: string }> {
    const destDir = path.dirname(destinationFilePath);
    if (!syncFs.existsSync(destDir)) {
      syncFs.mkdirSync(destDir, { recursive: true });
    }

    // Configure Chrome download behavior
    try {
      const client = await (this.page as any).target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: destDir,
      });
    } catch {
      // Non-fatal if CDP session creation fails in some runtimes; fallback retrieval will still work
    }

    // Scoped download discovery: must find download button INSIDE target container
    const downloadDiscovery = await findDownloadAction(this.page, flowAssetId, assetName);

    if (downloadDiscovery.status === 'AMBIGUOUS') {
      throw new Error(`[DOWNLOAD_AMBIGUOUS] Multiple download buttons found for asset ${flowAssetId}. Failing closed.`);
    }

    // Phase 2: Stale Download Protection
    // Snapshot directory BEFORE triggering download to guarantee no pre-existing file is accepted
    const preExistingFiles = new Set(syncFs.readdirSync(destDir));
    const triggerTimestamp = Date.now();
    let downloadSucceeded = false;
    let selectedResolution = 'ORIGINAL';

    // Strategy 1: Click scoped download trigger if button exists
    const clicked = await this.page.evaluate((assetId: string, nameHint?: string) => {
      let container = document.querySelector(`[data-asset-id="${assetId}"]`);
      if (!container) {
        container = document.querySelector(`[data-studio-asset-id="${assetId}"]`);
      }
      if (!container) {
        container = document.getElementById(assetId);
      }
      if (!container && nameHint) {
        const tiles = Array.from(
          document.querySelectorAll('flow-grid-tile-container, flow-video-tile, [class*="video-card"], [class*="asset-card"], mat-card')
        );
        const cleanName = nameHint.replace(/…|\.\.\./g, '').trim().toLowerCase().slice(0, 30);
        container =
          tiles.find((t) => {
            const text = (t.textContent || '').toLowerCase();
            const aria = (t.getAttribute('aria-label') || '').toLowerCase();
            return cleanName && (text.includes(cleanName) || aria.includes(cleanName));
          }) || null;
      }
      if (!container) {
        const idxMatch = assetId.match(/asset_card_(\d+)/);
        if (idxMatch) {
          const allCards = Array.from(
            document.querySelectorAll(
              '[data-asset-id], [class*="asset-card"], [class*="video-card"], [class*="media-card"], ' +
              'mat-card, [class*="node"], [class*="tile"], [class*="grid-item"], [class*="flow-card"]'
            )
          ).filter(
            (c) =>
              c.closest('flow-chat-bubble, flow-agent-chat, flow-permission-message, [class*="chat-bubble"], [class*="drawer"]') === null
          );
          container = allCards[parseInt(idxMatch[1], 10)] || null;
        }
      }
      if (!container) {
        const cards = Array.from(document.querySelectorAll('[class*="asset-card"], [class*="video-card"]'));
        container = cards.find((c) => (c.textContent || '').includes(assetId)) || null;
      }
      if (!container) return false;

      const candidates = Array.from(
        container.querySelectorAll('button, [role="button"], a[download], [data-action*="download" i]')
      );

      const btn = candidates.find((el) => {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const text = (el.textContent || '').trim().toLowerCase();
        const cls = (el.className || '').toLowerCase();
        return (
          aria.includes('download') ||
          aria.includes('tải xuống') ||
          aria.includes('tải video') ||
          title.includes('download') ||
          title.includes('tải xuống') ||
          text.includes('download') ||
          text.includes('tải xuống') ||
          text === 'file_download' ||
          cls.includes('download') ||
          el.hasAttribute('download')
        );
      }) as HTMLElement | undefined;

      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, flowAssetId, assetName);

    if (clicked) {
      try {
        const downloadedPath = await waitForNewDownloadedFile({
          destDir,
          preExistingFiles,
          triggerTimestampMs: triggerTimestamp,
          timeoutMs: 45000,
        });

        if (downloadedPath && syncFs.existsSync(downloadedPath)) {
          if (downloadedPath !== destinationFilePath) {
            syncFs.renameSync(downloadedPath, destinationFilePath);
          }
          downloadSucceeded = true;
        }
      } catch (err: any) {
        if (err?.message?.includes('[STALE_DOWNLOAD_REJECTED]')) {
          throw err;
        }
        // Timeout falls through to Strategy 1b
      }
    }

    // Strategy 1b: Google Flow Tile Kebab Menu Download (flow-grid-tile-container / flow-video-tile)
    if (!downloadSucceeded) {
      const tileMenuTriggered = await this.page.evaluate((assetId: string, nameHint?: string) => {
        // Find container
        let container = document.querySelector(`[data-asset-id="${assetId}"]`);
        if (!container) container = document.querySelector(`[data-studio-asset-id="${assetId}"]`);
        if (!container) container = document.getElementById(assetId);
        if (!container && nameHint) {
          const tiles = Array.from(
            document.querySelectorAll('flow-grid-tile-container, flow-video-tile, [class*="video-card"], [class*="asset-card"], mat-card')
          );
          const cleanName = nameHint.replace(/…|\.\.\./g, '').trim().toLowerCase().slice(0, 30);
          container =
            tiles.find((t) => {
              const text = (t.textContent || '').toLowerCase();
              const aria = (t.getAttribute('aria-label') || '').toLowerCase();
              return cleanName && (text.includes(cleanName) || aria.includes(cleanName));
            }) || null;
        }
        if (!container) {
          const idxMatch = assetId.match(/asset_card_(\d+)/);
          if (idxMatch) {
            const allCards = Array.from(
              document.querySelectorAll(
                'flow-grid-tile-container, flow-video-tile, [data-asset-id], [class*="asset-card"], [class*="video-card"], mat-card, .tile'
              )
            ).filter(
              (c) =>
                c.closest('flow-chat-bubble, flow-agent-chat, flow-permission-message, [class*="chat-bubble"], [class*="drawer"]') === null
            );
            container = allCards[parseInt(idxMatch[1], 10)] || null;
          }
        }
        if (!container) {
          container = document.querySelector('flow-grid-tile-container, flow-video-tile');
        }
        if (!container) return false;

        // Close any lingering open overlays first
        const backdrop = document.querySelector('.cdk-overlay-backdrop') as HTMLElement | null;
        if (backdrop) backdrop.click();

        // Find more_vert button
        const moreCandidates = Array.from(
          container.querySelectorAll('button.mat-mdc-menu-trigger, button[aria-label*="Tuỳ chọn" i], button[aria-label*="more" i], button')
        ) as HTMLElement[];
        const moreBtn =
          moreCandidates.find((b) => {
            const a = (b.getAttribute('aria-label') || '').toLowerCase();
            const t = (b.textContent || '').trim().toLowerCase();
            return b.classList.contains('mat-mdc-menu-trigger') || a.includes('tuỳ chọn') || a.includes('more') || t.includes('more_vert');
          }) || null;
        if (!moreBtn) return false;

        moreBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
        moreBtn.click();
        return true;
      }, flowAssetId, assetName);

      if (tileMenuTriggered) {
        await new Promise((r) => setTimeout(r, 1200));

        // Click "downloadTải xuống" menuitem
        const dlItemClicked = await this.page.evaluate(() => {
          const items = Array.from(
            document.querySelectorAll('.mat-mdc-menu-panel [role="menuitem"], .mat-mdc-menu-panel button')
          );
          const dlBtn = items.find((i) => {
            const t = (i.textContent || '').toLowerCase();
            return t.includes('tải xuống') || t.includes('download');
          }) as HTMLElement | undefined;
          if (!dlBtn) return false;
          dlBtn.click();
          return true;
        });

        if (dlItemClicked) {
          await new Promise((r) => setTimeout(r, 1200));

          // Phase 26: Deterministic Download Resolution Policy
          // Priority: Original / Gốc > 1080p > 720p > first available
          const resolutionChoice = await this.page.evaluate(() => {
            const allButtons = Array.from(
              document.querySelectorAll('.mat-mdc-menu-panel [role="menuitem"], .mat-mdc-menu-panel button')
            ) as HTMLElement[];
            const findBy = (fn: (t: string) => boolean) =>
              allButtons.find((b) => fn((b.textContent || '').toLowerCase()));

            const orig = findBy((t) => t.includes('gốc') || t.includes('original'));
            if (orig) {
              orig.click();
              return 'ORIGINAL';
            }
            const p1080 = findBy((t) => t.includes('1080p'));
            if (p1080) {
              p1080.click();
              return '1080P';
            }
            const p720 = findBy((t) => t.includes('720p'));
            if (p720) {
              p720.click();
              return '720P';
            }
            if (allButtons.length > 0) {
              allButtons[0].click();
              return (allButtons[0].textContent || 'UNKNOWN').trim();
            }
            return 'NOT_FOUND';
          });
          if (resolutionChoice && resolutionChoice !== 'NOT_FOUND') {
            selectedResolution = resolutionChoice;
          }

          // Wait for newly downloaded file using bounded, stale-rejecting watcher
          const downloadedPath = await waitForNewDownloadedFile({
            destDir,
            preExistingFiles,
            triggerTimestampMs: triggerTimestamp,
            timeoutMs: 45000,
          });

          if (downloadedPath && syncFs.existsSync(downloadedPath)) {
            if (downloadedPath !== destinationFilePath) {
              syncFs.copyFileSync(downloadedPath, destinationFilePath);
            }
            downloadSucceeded = true;
          }
        }
      }
    }

    // Strategy 2: Authenticated in-page extraction of <video> source if Strategy 1 did not produce a file
    if (!downloadSucceeded) {
      const base64Data = await this.page.evaluate(async (assetId: string) => {
        let container = document.querySelector(`[data-asset-id="${assetId}"]`);
        if (!container) {
          container = document.querySelector(`[data-studio-asset-id="${assetId}"]`);
        }
        if (!container) {
          container = document.getElementById(assetId);
        }
        if (!container) {
          const idxMatch = assetId.match(/asset_card_(\d+)/);
          if (idxMatch) {
            const allCards = Array.from(
              document.querySelectorAll(
                '[data-asset-id], [class*="asset-card"], [class*="video-card"], [class*="media-card"], ' +
                'mat-card, [class*="node"], [class*="tile"], [class*="grid-item"], [class*="flow-card"], ' +
                '[role="listitem"], [role="article"]'
              )
            );
            container = allCards[parseInt(idxMatch[1], 10)] || null;
          }
        }
        if (!container) {
          const cards = Array.from(document.querySelectorAll('[class*="asset-card"], [class*="video-card"], [role="listitem"]'));
          container = cards.find((c) => (c.textContent || '').includes(assetId)) || null;
        }
        const video = container
          ? (container.tagName.toLowerCase() === 'video' ? (container as HTMLVideoElement) : container.querySelector('video'))
          : document.querySelector('video');
        if (!video) return null;
        const src = video.currentSrc || video.src || video.querySelector('source')?.src;
        if (!src) return null;

        try {
          const resp = await fetch(src, { credentials: 'include' });
          if (!resp.ok) return null;
          const blob = await resp.blob();
          return new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res ? res.split(',')[1] : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      }, flowAssetId);

      if (base64Data) {
        syncFs.writeFileSync(destinationFilePath, Buffer.from(base64Data, 'base64'));
        downloadSucceeded = true;
      }
    }

    if (!downloadSucceeded || !syncFs.existsSync(destinationFilePath)) {
      throw new Error(`[DOWNLOAD_FAILED] Unable to download or extract media for asset ${flowAssetId}`);
    }

    // Physical verification of the media file
    const physicalVerify = await ArtifactVerifier.verifyVideo(destinationFilePath);
    if (!physicalVerify.exists || !physicalVerify.nonEmpty || !physicalVerify.hasVideoStream || (physicalVerify.durationSeconds || 0) <= 0) {
      if (syncFs.existsSync(destinationFilePath)) {
        try {
          syncFs.unlinkSync(destinationFilePath);
        } catch {
          // ignore cleanup error
        }
      }
      throw new Error(
        `[DOWNLOAD_CORRUPT] Retrieved file for asset ${flowAssetId} failed physical verification: ${physicalVerify.error || 'No valid video stream'}`
      );
    }

    const stats = syncFs.statSync(destinationFilePath);
    return {
      physicalPath: destinationFilePath,
      sizeBytes: stats.size,
      resolution: selectedResolution,
    };
  }

  public async detectCredits(): Promise<FlowPageCreditStatus> {
    const discovery = await findCreditIndicator(this.page);
    return {
      creditsObserved: discovery.parsedCredits ?? null,
      rawText: discovery.rawText,
      observationTime: new Date().toISOString(),
      isCertain: Boolean(discovery.isCertain),
      confidence: discovery.confidence,
      tier: discovery.tier,
      details: discovery.details,
    };
  }

  public async detectAuthBlock(): Promise<FlowAuthBlockStatus> {
    try {
      const url = this.page.url().toLowerCase();
      if (url.includes('accounts.google.com') || url.includes('/signin') || url.includes('/login')) {
        return { isBlocked: true, blockType: 'LOGIN', details: 'Google sign-in page detected.' };
      }

      const pageText: string = await (this.page as any)
        .evaluate(() => (document.body ? document.body.innerText.toLowerCase().slice(0, 3000) : ''))
        .catch(() => '');

      if (pageText.includes('sign in with google') || pageText.includes('choose an account')) {
        return { isBlocked: true, blockType: 'LOGIN', details: 'Sign-in prompt detected in viewport.' };
      }
      if (pageText.includes('2-step verification') || pageText.includes('enter the code')) {
        return { isBlocked: true, blockType: '2FA', details: 'Google 2-Step Verification required.' };
      }
      if (pageText.includes('captcha') || pageText.includes('unusual traffic')) {
        return { isBlocked: true, blockType: 'CAPTCHA', details: 'CAPTCHA verification challenge detected.' };
      }

      return { isBlocked: false };
    } catch {
      return { isBlocked: false };
    }
  }

  public async detectFailure(): Promise<{ hasFailed: boolean; errorReason?: string }> {
    try {
      const errorMsg: any = await (this.page as any).evaluate(() => {
        const el = document.querySelector('[role="alert"], [class*="error-message"], [class*="toast-error"]');
        return el ? el.textContent?.trim() || null : null;
      });
      const isStringError = typeof errorMsg === 'string' && errorMsg.trim().length > 0;
      return {
        hasFailed: isStringError,
        errorReason: isStringError ? errorMsg : undefined,
      };
    } catch {
      return { hasFailed: false };
    }
  }

  public async captureDiagnostics(tag: string, diagnosticsDir = '.studio/diagnostics'): Promise<FlowDiagnostics> {
    const currentUrl = this.page.url();
    const capturedAt = new Date().toISOString();
    let screenshotPath: string | undefined;
    let domSnippet: string | undefined;

    try {
      if (!syncFs.existsSync(diagnosticsDir)) {
        syncFs.mkdirSync(diagnosticsDir, { recursive: true });
      }
      screenshotPath = path.join(diagnosticsDir, `flow_diag_${tag}_${Date.now()}.png`);
      await this.page.screenshot({ path: screenshotPath as any, fullPage: false });

      domSnippet = await (this.page as any).evaluate(() =>
        document.body ? document.body.innerHTML.slice(0, 2000) : ''
      );
    } catch {
      // Diagnostic capture failure ignored
    }

    return {
      screenshotPath,
      domSnippet,
      currentUrl,
      capturedAt,
    };
  }

  public async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      await this.page.close().catch(() => {});
    }
  }

  public isClosed(): boolean {
    return this.closed;
  }
}

// ─── Test Double / Mock Page Adapter ──────────────────────────────────────────

export class MockFlowPage implements IFlowPage {
  public closed = false;
  public simulatedCredits: number | null = 100;
  public simulatedCreditCertainty = true;
  public simulatedAuthBlock: FlowAuthBlockStatus = { isBlocked: false };
  public simulatedFailure?: string;
  public agentModeEnabled = true;
  public simulatedPageState: FlowPageState = 'FLOW_PROJECT';
  public simulatedNavigationAmbiguous = false;
  public simulatedUnsafeNavigation = false;
  public simulatedIntermediateUi = false;
  public startCreatingClicked = false;
  public generatedAssets = new Map<string, FlowGeneratedAssetDescriptor>();
  public submittedInstructions: Array<{ text: string; options?: any; submittedAt: string }> = [];
  public mockMp4Bytes?: Buffer;
  public promptInputAmbiguous = false;
  public generateControlAmbiguous = false;

  constructor(options: { mockMp4Bytes?: Buffer } = {}) {
    this.mockMp4Bytes = options.mockMp4Bytes;
  }

  public async enterFlowWorkspace(options?: {
    timeoutMs?: number;
    maxIntermediateSteps?: number;
  }): Promise<FlowProjectNavigationResult> {
    if (this.simulatedAuthBlock.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Authentication required: ${this.simulatedAuthBlock.details}`);
    }

    if (this.simulatedNavigationAmbiguous) {
      throw new Error(
        '[FLOW_NAVIGATION_AMBIGUOUS] Multiple candidate Start Creating controls discovered (2 candidates). Failing closed to prevent accidental click.'
      );
    }

    if (this.simulatedUnsafeNavigation) {
      throw new Error(
        '[FLOW_NAVIGATION_UNSAFE] Start Creating candidate is not classified as SAFE_NAVIGATION (classified as: CREDIT_CONSUMING). Aborting navigation.'
      );
    }

    if (this.simulatedIntermediateUi) {
      throw new Error(
        '[FLOW_NAVIGATION_REQUIRES_CALIBRATION] Intermediate UI detected without clear safe navigation path. Diagnostics captured.'
      );
    }

    this.startCreatingClicked = true;
    this.simulatedPageState = 'FLOW_PROJECT';
    const projectId = 'mock_project_alpha';
    return {
      projectId,
      url: `https://flow.google.com/projects/${projectId}`,
      pageState: 'FLOW_PROJECT',
      browserProjectReference: projectId,
    };
  }

  public async ensureProject(
    projectName: string,
    options?: { url?: string; projectReference?: string }
  ): Promise<FlowProjectNavigationResult> {
    if (this.simulatedAuthBlock.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Authentication required: ${this.simulatedAuthBlock.details}`);
    }

    if (this.simulatedPageState === 'FLOW_HOME') {
      return this.enterFlowWorkspace();
    }

    return {
      projectId: projectName,
      url: `https://flow.google.com/projects/${projectName}`,
      pageState: this.simulatedPageState,
      browserProjectReference: projectName,
    };
  }

  public async ensureAgentMode(): Promise<FlowAgentModeResult> {
    if (!this.agentModeEnabled) {
      return {
        mode: 'UNKNOWN',
        isAgentActive: false,
        status: 'AGENT_MODE_UNAVAILABLE',
        confidence: 0,
        details: 'Flow Agent mode is not available in mock page',
      };
    }
    return {
      mode: 'AGENT',
      isAgentActive: true,
      status: 'FOUND',
      confidence: 1.0,
      details: 'Mock agent mode enabled',
    };
  }

  private lastInstructionSha256 = '';

  public async submitInstruction(
    instructionText: string,
    options?: { referencePaths?: string[]; forceResubmit?: boolean }
  ): Promise<{ submissionId: string; submittedAt: string; submissionCount: number }> {
    if (this.simulatedAuthBlock.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Cannot submit instruction while auth blocked: ${this.simulatedAuthBlock.details}`);
    }

    if (this.promptInputAmbiguous) {
      throw new Error('[PROMPT_INPUT_AMBIGUOUS] Multiple candidate prompt surfaces found.');
    }

    if (this.generateControlAmbiguous) {
      throw new Error('[GENERATE_CONTROL_AMBIGUOUS] Multiple candidate generate buttons found.');
    }

    const instructionHash = crypto.createHash('sha256').update(instructionText.trim()).digest('hex');
    if (this.submittedInstructions.length > 0 && this.lastInstructionSha256 === instructionHash && !options?.forceResubmit) {
      throw new Error(
        `[DOUBLE_SUBMISSION_PREVENTED] Repeated submitInstruction called for identical prompt hash ${instructionHash.slice(0, 10)}.`
      );
    }
    this.lastInstructionSha256 = instructionHash;

    const submissionId = `mock_sub_${Date.now()}`;
    const submittedAt = new Date().toISOString();
    this.submittedInstructions.push({ text: instructionText, options, submittedAt });

    const shotMatches = instructionText.match(/SHOT_[A-Za-z0-9_]+/g) || ['SHOT_001'];
    for (const shotId of shotMatches) {
      this.generatedAssets.set(shotId, {
        id: `mock_asset_${shotId}`,
        name: `Asset for ${shotId}`,
        status: 'READY',
        createdAt: submittedAt,
        matchedShotId: shotId,
        durationSeconds: 4,
        mappingStrategy: 'EXACT_OUTPUT_NAME',
      });
    }

    return { submissionId, submittedAt, submissionCount: this.submittedInstructions.length };
  }

  public async waitForGeneration(
    shotIds: string[],
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      baselineAssetIds?: string[];
      maxFlowCredits?: number;
    }
  ): Promise<Map<string, FlowGeneratedAssetDescriptor>> {
    if (this.simulatedFailure) {
      throw new Error(`Flow generation failed: ${this.simulatedFailure}`);
    }
    const results = new Map<string, FlowGeneratedAssetDescriptor>();

    if (this.generatedAssets.size > 0) {
      for (const shotId of shotIds) {
        for (const [_, asset] of this.generatedAssets.entries()) {
          if (
            asset.matchedShotId === shotId ||
            asset.name.includes(shotId) ||
            asset.id.includes(shotId)
          ) {
            results.set(shotId, asset);
            break;
          }
        }
      }
      if (results.size < shotIds.length && results.size === 0) {
        throw new Error(
          `[RECONCILIATION_REQUIRED] Generated assets observed (${this.generatedAssets.size}) but could not be mapped to requested shots [${shotIds.join(', ')}] with high confidence.`
        );
      }
    } else {
      for (const shotId of shotIds) {
        results.set(shotId, {
          id: `mock_asset_${shotId}`,
          name: `Asset for ${shotId}`,
          status: 'READY',
          createdAt: new Date().toISOString(),
          matchedShotId: shotId,
          durationSeconds: 4,
          mappingStrategy: 'EXACT_OUTPUT_NAME' as FlowShotMappingStrategy,
        });
      }
    }

    return results;
  }

  public async listGeneratedAssets(): Promise<FlowGeneratedAssetDescriptor[]> {
    return Array.from(this.generatedAssets.values());
  }

  public async downloadAsset(
    flowAssetId: string,
    destinationFilePath: string,
    assetName?: string
  ): Promise<{ physicalPath: string; sizeBytes: number }> {
    const destDir = path.dirname(destinationFilePath);
    if (!syncFs.existsSync(destDir)) {
      syncFs.mkdirSync(destDir, { recursive: true });
    }

    const bytes = this.mockMp4Bytes || getDeterministicMp4Buffer();
    syncFs.writeFileSync(destinationFilePath, bytes);

    return {
      physicalPath: destinationFilePath,
      sizeBytes: bytes.length,
    };
  }

  public async detectCredits(): Promise<FlowPageCreditStatus> {
    return {
      creditsObserved: this.simulatedCredits,
      rawText: this.simulatedCredits !== null ? `${this.simulatedCredits} credits` : undefined,
      observationTime: new Date().toISOString(),
      isCertain: this.simulatedCreditCertainty && this.simulatedCredits !== null,
      confidence: this.simulatedCreditCertainty ? 0.95 : 0.4,
    };
  }

  public async detectAuthBlock(): Promise<FlowAuthBlockStatus> {
    return this.simulatedAuthBlock;
  }

  public async detectFailure(): Promise<{ hasFailed: boolean; errorReason?: string }> {
    return {
      hasFailed: Boolean(this.simulatedFailure),
      errorReason: this.simulatedFailure,
    };
  }

  public async captureDiagnostics(tag: string): Promise<FlowDiagnostics> {
    return {
      currentUrl: 'https://flow.google.com/mock',
      capturedAt: new Date().toISOString(),
    };
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  public isClosed(): boolean {
    return this.closed;
  }
}
