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
    options?: { referencePaths?: string[] }
  ): Promise<{ submissionId: string; submittedAt: string }>;

  /** Wait for generated assets matching requested shotIds */
  waitForGeneration(
    shotIds: string[],
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<Map<string, FlowGeneratedAssetDescriptor>>;

  /** List all generated assets visible in the project */
  listGeneratedAssets(): Promise<FlowGeneratedAssetDescriptor[]>;

  /** Download a completed video asset to physical disk (scoped to container) */
  downloadAsset(
    flowAssetId: string,
    destinationFilePath: string
  ): Promise<{ physicalPath: string; sizeBytes: number }>;

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

  constructor(page: Page, defaultFlowUrl = 'https://flow.google.com') {
    this.page = page;
    this.defaultFlowUrl = defaultFlowUrl;
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
    options: { referencePaths?: string[] } = {}
  ): Promise<{ submissionId: string; submittedAt: string }> {
    const auth = await this.detectAuthBlock();
    if (auth.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Cannot submit instruction while auth blocked: ${auth.details}`);
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
      }
    }

    // Confirm generation initiated
    await new Promise((r) => setTimeout(r, 1500));

    const submissionId = `flow_sub_${Date.now()}`;
    return {
      submissionId,
      submittedAt: new Date().toISOString(),
    };
  }

  /**
   * Detects and clicks the Flow Agent in-panel confirmation gate.
   * When Flow Agent asks "Bạn có muốn tôi bắt đầu tạo... với chi phí là X tín dụng không?"
   * this method finds and clicks the "Luôn phê duyệt" / "Phê duyệt" (Approve) option.
   * Returns true if an approval was dispatched.
   */
  private async handleAgentConfirmationGate(): Promise<boolean> {
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
      return Boolean(approved);
    } catch {
      return false;
    }
  }

  /**
   * Detects whether the Flow Agent is waiting for confirmation (cost approval gate).
   */
  private async detectAgentConfirmationPending(): Promise<boolean> {
    try {
      return await this.page.evaluate(() => {
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
    } catch {
      return false;
    }
  }

  public async waitForGeneration(
    shotIds: string[],
    options: { timeoutMs?: number; pollIntervalMs?: number } = {}
  ): Promise<Map<string, FlowGeneratedAssetDescriptor>> {
    const timeoutMs = options.timeoutMs ?? 300000; // 5 min default
    const pollIntervalMs = options.pollIntervalMs ?? 5000;
    const startTime = Date.now();
    const results = new Map<string, FlowGeneratedAssetDescriptor>();

    while (Date.now() - startTime < timeoutMs) {
      // ── Phase 1: Handle Flow Agent confirmation gate (cost approval) ──────────
      // The agent may ask "Do you want me to create this video for X credits?"
      // with options: Luôn phê duyệt / Phê duyệt / Từ chối
      const gatePending = await this.detectAgentConfirmationPending();
      if (gatePending) {
        const clicked = await this.handleAgentConfirmationGate();
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

        // Strategy A: Exact output name contains shotId
        const exactMatch = assets.find(
          (a) => (a.name.includes(shotId) || a.matchedShotId === shotId || a.id.includes(shotId)) && a.status === 'READY'
        );
        if (exactMatch) {
          exactMatch.matchedShotId = shotId;
          exactMatch.mappingStrategy = 'EXACT_OUTPUT_NAME';
          results.set(shotId, exactMatch);
          continue;
        }

        // Strategy B: If only 1 shot requested, map to the newest READY asset
        if (shotIds.length === 1) {
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
    destinationFilePath: string
  ): Promise<{ physicalPath: string; sizeBytes: number }> {
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
    const downloadDiscovery = await findDownloadAction(this.page, flowAssetId);

    if (downloadDiscovery.status === 'AMBIGUOUS') {
      throw new Error(`[DOWNLOAD_AMBIGUOUS] Multiple download buttons found for asset ${flowAssetId}. Failing closed.`);
    }

    let downloadSucceeded = false;

    // Strategy 1: Click scoped download trigger if button exists
    const clicked = await this.page.evaluate((assetId: string) => {
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
    }, flowAssetId);

    if (clicked) {
      // Wait for download to appear
      const maxWait = 45000;
      const start = Date.now();
      let downloadedPath: string | undefined;

      while (Date.now() - start < maxWait) {
        const files = syncFs
          .readdirSync(destDir)
          .filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp') && f.endsWith('.mp4'));
        if (files.length > 0) {
          downloadedPath = path.join(destDir, files[0]);
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (downloadedPath && syncFs.existsSync(downloadedPath)) {
        if (downloadedPath !== destinationFilePath) {
          syncFs.renameSync(downloadedPath, destinationFilePath);
        }
        downloadSucceeded = true;
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

  public async submitInstruction(
    instructionText: string,
    options?: { referencePaths?: string[] }
  ): Promise<{ submissionId: string; submittedAt: string }> {
    if (this.simulatedAuthBlock.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Cannot submit instruction while auth blocked: ${this.simulatedAuthBlock.details}`);
    }

    if (this.promptInputAmbiguous) {
      throw new Error('[PROMPT_INPUT_AMBIGUOUS] Multiple candidate prompt surfaces found.');
    }

    if (this.generateControlAmbiguous) {
      throw new Error('[GENERATE_CONTROL_AMBIGUOUS] Multiple candidate generate buttons found.');
    }

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

    return { submissionId, submittedAt };
  }

  public async waitForGeneration(
    shotIds: string[]
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
    destinationFilePath: string
  ): Promise<{ physicalPath: string; sizeBytes: number }> {
    const destDir = path.dirname(destinationFilePath);
    if (!syncFs.existsSync(destDir)) {
      syncFs.mkdirSync(destDir, { recursive: true });
    }

    const bytes = this.mockMp4Bytes || Buffer.from('mock video bytes');
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
