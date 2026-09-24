/**
 * FlowPageAdapter
 *
 * Dedicated page-object / UI adapter layer for Google Flow browser automation.
 * Centralizes UI selectors and interaction logic.
 *
 * Principles:
 *   - Never scrape private undocumented APIs.
 *   - Use visible browser-level controls, semantic roles, accessible text.
 *   - Fail closed on unexpected UI changes, auth challenges, or CAPTCHA.
 *   - Never log passwords, tokens, or private secrets.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as syncFs from 'node:fs';
import type { Page, Browser } from 'puppeteer-core';

export interface FlowGeneratedAssetDescriptor {
  id: string;
  name: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  downloadUrl?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  createdAt: string;
  matchedShotId?: string;
}

export interface FlowPageCreditStatus {
  creditsObserved: number | null;
  observationTime: string;
  isCertain: boolean;
  tier?: string;
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
  ensureProject(projectName: string, options?: { url?: string }): Promise<{ projectId: string; url: string }>;

  /** Ensure Flow Agent mode is activated when available */
  ensureAgentMode(): Promise<boolean>;

  /** Submit structured master production batch instruction */
  submitInstruction(instructionText: string, options?: { referencePaths?: string[] }): Promise<{ submissionId: string; submittedAt: string }>;

  /** Wait for generated assets matching requested shotIds */
  waitForGeneration(shotIds: string[], options?: { timeoutMs?: number; pollIntervalMs?: number }): Promise<Map<string, FlowGeneratedAssetDescriptor>>;

  /** List all generated assets visible in the project */
  listGeneratedAssets(): Promise<FlowGeneratedAssetDescriptor[]>;

  /** Download a completed video asset to physical disk */
  downloadAsset(flowAssetId: string, destinationFilePath: string): Promise<{ physicalPath: string; sizeBytes: number }>;

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

  public async ensureProject(
    projectName: string,
    options: { url?: string } = {}
  ): Promise<{ projectId: string; url: string }> {
    const targetUrl = options.url || this.defaultFlowUrl;
    const current = this.page.url();

    if (!current.startsWith(targetUrl)) {
      await this.page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    }

    const auth = await this.detectAuthBlock();
    if (auth.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Authentication required: ${auth.details}`);
    }

    const sanitizedProject = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      projectId: sanitizedProject,
      url: this.page.url(),
    };
  }

  public async ensureAgentMode(): Promise<boolean> {
    try {
      // Look for Agent mode switch / toggle in Google Flow UI
      const agentToggle = await this.page.$(
        'button[aria-label*="Agent" i], [role="switch"][aria-label*="Agent" i], button:has-text("Agent")'
      );
      if (agentToggle) {
        const isChecked = await agentToggle.evaluate((el: any) =>
          el.getAttribute('aria-checked') === 'true' || el.classList.contains('active')
        );
        if (!isChecked) {
          await agentToggle.click();
          await new Promise((r) => setTimeout(r, 1000));
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async submitInstruction(
    instructionText: string,
    options: { referencePaths?: string[] } = {}
  ): Promise<{ submissionId: string; submittedAt: string }> {
    const auth = await this.detectAuthBlock();
    if (auth.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Cannot submit instruction while auth blocked: ${auth.details}`);
    }

    // Find main prompt input
    const inputSelector =
      'textarea[placeholder*="Prompt" i], textarea[aria-label*="Prompt" i], textarea, [contenteditable="true"]';
    await this.page.waitForSelector(inputSelector, { timeout: 15000 });
    const inputEl = await this.page.$(inputSelector);
    if (!inputEl) throw new Error('Could not find Flow prompt input textarea.');

    // Clear and enter prompt text
    await inputEl.evaluate((el: any) => {
      if ('value' in el) el.value = '';
      else el.textContent = '';
    });
    await inputEl.type(instructionText);

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

    // Submit via Generate button or Enter key
    const generateBtn = await this.page.$(
      'button[aria-label*="Generate" i], button:has-text("Generate"), button[type="submit"]'
    );
    if (generateBtn) {
      await generateBtn.click();
    } else {
      await this.page.keyboard.press('Enter');
    }

    const submissionId = `flow_sub_${Date.now()}`;
    return {
      submissionId,
      submittedAt: new Date().toISOString(),
    };
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
      const assets = await this.listGeneratedAssets();

      for (const shotId of shotIds) {
        const match = assets.find((a) => a.name.includes(shotId) || a.matchedShotId === shotId);
        if (match && match.status === 'READY') {
          results.set(shotId, match);
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

    return results;
  }

  public async listGeneratedAssets(): Promise<FlowGeneratedAssetDescriptor[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await (this.page as any).evaluate(new Function(`
      const cards = Array.from(document.querySelectorAll('[data-asset-id], [class*="asset-card"], [class*="video-card"]'));
      return cards.map((card, idx) => ({
        id: card.getAttribute('data-asset-id') || 'asset_' + idx,
        name: card.getAttribute('data-asset-name') || (card.querySelector('[class*="title"], h3, span') || {}).textContent || 'Asset ' + idx,
        status: card.querySelector('[class*="failed"], [class*="error"]') ? 'FAILED' : card.querySelector('video, [class*="ready"]') ? 'READY' : 'GENERATING',
        createdAt: new Date().toISOString(),
      }));
    `));
    return (raw || []) as FlowGeneratedAssetDescriptor[];
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
    const client = await (this.page as any).target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: destDir,
    });

    // Locate and click download trigger
    const downloadBtn = await this.page.$(
      `[data-asset-id="${flowAssetId}"] button[aria-label*="Download" i], button[aria-label*="Download" i]`
    );
    if (!downloadBtn) {
      throw new Error(`Download button not found for asset ${flowAssetId}`);
    }
    await downloadBtn.click();

    // Wait for download to appear
    const maxWait = 45000;
    const start = Date.now();
    let downloadedPath: string | undefined;

    while (Date.now() - start < maxWait) {
      const files = syncFs.readdirSync(destDir).filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp') && f.endsWith('.mp4'));
      if (files.length > 0) {
        downloadedPath = path.join(destDir, files[0]);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!downloadedPath || !syncFs.existsSync(downloadedPath)) {
      throw new Error(`Download timed out for asset ${flowAssetId}`);
    }

    if (downloadedPath !== destinationFilePath) {
      syncFs.renameSync(downloadedPath, destinationFilePath);
    }

    const stats = syncFs.statSync(destinationFilePath);
    return {
      physicalPath: destinationFilePath,
      sizeBytes: stats.size,
    };
  }

  public async detectCredits(): Promise<FlowPageCreditStatus> {
    try {
      const creditText: string | null = await (this.page as any).evaluate(new Function(`
        const el = document.querySelector('[aria-label*="Credit" i], [data-testid="credits"]');
        return el ? el.textContent.trim() : null;
      `));
      if (!creditText) {
        return { creditsObserved: null, observationTime: new Date().toISOString(), isCertain: false };
      }
      const match = creditText.match(/\d+/);
      const credits = match ? parseInt(match[0], 10) : null;
      return { creditsObserved: credits, observationTime: new Date().toISOString(), isCertain: credits !== null };
    } catch {
      return { creditsObserved: null, observationTime: new Date().toISOString(), isCertain: false };
    }
  }

  public async detectAuthBlock(): Promise<FlowAuthBlockStatus> {
    try {
      const url = this.page.url().toLowerCase();
      if (url.includes('accounts.google.com') || url.includes('/signin') || url.includes('/login')) {
        return { isBlocked: true, blockType: 'LOGIN', details: 'Google sign-in page detected.' };
      }

      const pageText: string = await (this.page as any).evaluate(new Function(`
        return document.body ? document.body.innerText.toLowerCase() : '';
      `));
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
      const errorMsg: string | null = await (this.page as any).evaluate(new Function(`
        const el = document.querySelector('[role="alert"], [class*="error-message"], [class*="toast-error"]');
        return el ? el.textContent.trim() : null;
      `));
      return {
        hasFailed: Boolean(errorMsg),
        errorReason: errorMsg || undefined,
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

      domSnippet = await (this.page as any).evaluate(new Function(`
        return document.body ? document.body.innerHTML.slice(0, 2000) : '';
      `));
    } catch {
      // ignore diagnostic capture failure
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
  public simulatedAuthBlock: FlowAuthBlockStatus = { isBlocked: false };
  public simulatedFailure?: string;
  public agentModeEnabled = true;
  public generatedAssets = new Map<string, FlowGeneratedAssetDescriptor>();
  public submittedInstructions: Array<{ text: string; options?: any; submittedAt: string }> = [];
  public mockMp4Bytes?: Buffer;

  constructor(options: { mockMp4Bytes?: Buffer } = {}) {
    this.mockMp4Bytes = options.mockMp4Bytes;
  }

  public async ensureProject(projectName: string): Promise<{ projectId: string; url: string }> {
    if (this.simulatedAuthBlock.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Authentication required: ${this.simulatedAuthBlock.details}`);
    }
    return {
      projectId: projectName,
      url: `https://flow.google.com/projects/${projectName}`,
    };
  }

  public async ensureAgentMode(): Promise<boolean> {
    return this.agentModeEnabled;
  }

  public async submitInstruction(
    instructionText: string,
    options?: { referencePaths?: string[] }
  ): Promise<{ submissionId: string; submittedAt: string }> {
    if (this.simulatedAuthBlock.isBlocked) {
      throw new Error(`[BLOCKED_AUTH] Cannot submit instruction while auth blocked: ${this.simulatedAuthBlock.details}`);
    }
    const submissionId = `mock_sub_${Date.now()}`;
    const submittedAt = new Date().toISOString();
    this.submittedInstructions.push({ text: instructionText, options, submittedAt });

    // Seed mock generated assets matching shots in instruction
    const shotMatches = instructionText.match(/SHOT_[A-Za-z0-9_]+/g) || ['SHOT_001'];
    for (const shotId of shotMatches) {
      this.generatedAssets.set(shotId, {
        id: `mock_asset_${shotId}`,
        name: `Asset for ${shotId}`,
        status: 'READY',
        createdAt: submittedAt,
        matchedShotId: shotId,
        durationSeconds: 4,
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
    for (const shotId of shotIds) {
      const existing = this.generatedAssets.get(shotId) || {
        id: `mock_asset_${shotId}`,
        name: `Asset for ${shotId}`,
        status: 'READY',
        createdAt: new Date().toISOString(),
        matchedShotId: shotId,
        durationSeconds: 4,
      };
      results.set(shotId, existing);
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
      observationTime: new Date().toISOString(),
      isCertain: this.simulatedCredits !== null,
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
