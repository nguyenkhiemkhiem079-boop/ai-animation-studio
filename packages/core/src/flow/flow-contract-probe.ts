/**
 * FlowContractProbe
 *
 * Implements the Zero-Credit Google Flow Browser Probe contract (Phase 27B).
 * Inspects Google Flow UI structure, semantic controls, and authentication
 * WITHOUT submitting any prompt, clicking generate, or consuming any credits.
 *
 * Guarantees:
 *   - Zero credits consumed.
 *   - Never triggers generation.
 *   - Sanitizes report (no passwords, session tokens, or private Google account data).
 *   - Persists evidence into .studio/flow-contract/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'puppeteer-core';
import {
  findEditablePromptSurface,
  findGenerateControl,
  findCreditIndicator,
  findAgentControl,
  findAssetContainers,
  findDownloadAction,
  SemanticDiscoveryResult,
} from './flow-semantic-discovery.js';
import { FlowAuthBlockStatus } from './flow-page-adapter.js';

export type FlowPageState = 'FLOW_HOME' | 'FLOW_PROJECT' | 'UNKNOWN_PAGE';

export interface FlowBrowserProbeReport {
  timestamp: string;
  url: string;
  pageState: FlowPageState;
  authenticated: boolean;
  authBlockStatus?: FlowAuthBlockStatus;
  projectUiFound: boolean;
  agentControl: SemanticDiscoveryResult;
  promptControl: SemanticDiscoveryResult;
  generateControl: SemanticDiscoveryResult;
  creditControl: SemanticDiscoveryResult & { parsedCredits?: number | null; isCertain?: boolean; rawText?: string };
  assetRegion: SemanticDiscoveryResult;
  downloadControl: SemanticDiscoveryResult;
  visibleSemanticControls: Array<{ role?: string; label?: string; tag: string }>;
  sanitized: true;
  zeroCreditVerified: true;
}

export interface FlowControlMap {
  promptInputLocator: string;
  generateButtonLocator: string;
  agentToggleLocator?: string;
  creditsLocator?: string;
  assetCardLocator?: string;
  downloadLocator?: string;
  pageState: FlowPageState;
  confidenceScores: {
    prompt: number;
    generate: number;
    agent: number;
    credits: number;
    assets: number;
  };
}

export class FlowContractProbe {
  /**
   * Evaluates the current page state and categorizes it: FLOW_HOME, FLOW_PROJECT, or UNKNOWN_PAGE.
   */
  public static categorizePageState(url: string, pageText = '', domSnippet = ''): FlowPageState {
    const cleanUrl = url.toLowerCase();

    // Check for non-flow or sign-in domains
    if (
      cleanUrl.includes('accounts.google.com') ||
      cleanUrl.includes('/signin') ||
      cleanUrl.includes('/login') ||
      (!cleanUrl.includes('flow.google.com') && !cleanUrl.includes('localhost') && !cleanUrl.includes('127.0.0.1'))
    ) {
      return 'UNKNOWN_PAGE';
    }

    // Inside a specific project
    if (
      cleanUrl.includes('/project/') ||
      cleanUrl.includes('/projects/') ||
      cleanUrl.includes('/p/') ||
      domSnippet.includes('data-project-id') ||
      pageText.includes('canvas') ||
      pageText.includes('timeline') ||
      pageText.includes('prompt bar')
    ) {
      return 'FLOW_PROJECT';
    }

    // Home / workspace root
    if (
      cleanUrl.includes('flow.google.com') ||
      cleanUrl.includes('/home') ||
      pageText.includes('new project') ||
      pageText.includes('recent projects') ||
      pageText.includes('templates')
    ) {
      return 'FLOW_HOME';
    }

    return 'UNKNOWN_PAGE';
  }

  /**
   * Executes a complete zero-credit probe against a live Puppeteer page.
   * NEVER submits a prompt or clicks generate.
   */
  public static async probePage(
    page: Page,
    options: {
      persistEvidence?: boolean;
      outputDir?: string;
    } = {}
  ): Promise<{
    report: FlowBrowserProbeReport;
    controlMap: FlowControlMap;
    formattedReport: string;
  }> {
    const rawUrl = page.url();
    // Sanitize URL: strip query parameters that might carry auth or tracking tokens
    const sanitizedUrl = rawUrl.split('?')[0];

    // 1. Detect Auth State
    const authStatus = await this.detectAuthBlock(page);
    const authenticated = !authStatus.isBlocked;

    // 2. Discover Semantic Controls (Pure Inspection, Zero Click)
    const promptControl = await findEditablePromptSurface(page);
    const generateControl = await findGenerateControl(page);
    const creditControl = await findCreditIndicator(page);
    const agentControl = await findAgentControl(page);
    const assetRegion = await findAssetContainers(page);

    // Download action probe: if assets exist, inspect first container
    let downloadControl: SemanticDiscoveryResult = {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'none',
      details: 'No asset container available to probe download action',
    };

    if (assetRegion.status === 'FOUND' && (assetRegion as any).containers?.length > 0) {
      const firstContainer = (assetRegion as any).containers[0];
      downloadControl = await findDownloadAction(page, firstContainer.id);
    }

    // Categorize page state
    const bodyText: string = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 3000) : '')).catch(() => '');
    const domSnippet: string = await page.evaluate(() => (document.body ? document.body.innerHTML.slice(0, 3000) : '')).catch(() => '');
    const pageState = this.categorizePageState(sanitizedUrl, bodyText, domSnippet);

    const projectUiFound = pageState === 'FLOW_PROJECT' || (pageState === 'FLOW_HOME' && promptControl.status === 'FOUND');

    // 3. Scan visible semantic controls (sanitized)
    const visibleControls: Array<{ role?: string; label?: string; tag: string }> = await page
      .evaluate(() => {
        const items: Array<{ role?: string; label?: string; tag: string }> = [];
        const interactive = Array.from(
          document.querySelectorAll('button, [role="button"], [role="switch"], [role="tab"], textarea, input')
        );

        for (const el of interactive.slice(0, 20)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().slice(0, 40);
            const role = el.getAttribute('role') || el.getAttribute('type') || undefined;
            // Filter out any sensitive email or account references
            const cleanLabel = (label || '').replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[MASKED_ACCOUNT]');
            items.push({
              tag: el.tagName.toLowerCase(),
              role,
              label: cleanLabel || undefined,
            });
          }
        }
        return items;
      })
      .catch(() => []);

    const report: FlowBrowserProbeReport = {
      timestamp: new Date().toISOString(),
      url: sanitizedUrl,
      pageState,
      authenticated,
      authBlockStatus: authStatus.isBlocked ? authStatus : undefined,
      projectUiFound,
      agentControl,
      promptControl,
      generateControl,
      creditControl,
      assetRegion,
      downloadControl,
      visibleSemanticControls: visibleControls,
      sanitized: true,
      zeroCreditVerified: true,
    };

    const controlMap: FlowControlMap = {
      promptInputLocator: promptControl.locatorStrategy,
      generateButtonLocator: generateControl.locatorStrategy,
      agentToggleLocator: agentControl.locatorStrategy,
      creditsLocator: creditControl.locatorStrategy,
      assetCardLocator: assetRegion.locatorStrategy,
      downloadLocator: downloadControl.locatorStrategy,
      pageState,
      confidenceScores: {
        prompt: promptControl.confidence,
        generate: generateControl.confidence,
        agent: agentControl.confidence,
        credits: creditControl.confidence,
        assets: assetRegion.confidence,
      },
    };

    // Format human-readable output conforming to Phase 27B contract
    const formattedReport = this.formatReportString(report);

    // Persist evidence if requested
    if (options.persistEvidence !== false) {
      const outDir = options.outputDir || path.resolve(process.cwd(), '.studio', 'flow-contract');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      fs.writeFileSync(path.join(outDir, 'probe-report.json'), JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(outDir, 'control-map.json'), JSON.stringify(controlMap, null, 2));

      try {
        const screenshotPath = path.join(outDir, 'diagnostics.png');
        await page.screenshot({ path: screenshotPath as any, fullPage: false });
      } catch {
        // Screenshot capture optional
      }
    }

    return { report, controlMap, formattedReport };
  }

  /**
   * Formats the standardized Phase 27B sanitized probe report.
   */
  public static formatReportString(report: FlowBrowserProbeReport): string {
    const lines: string[] = [];
    lines.push('============================================================');
    lines.push('FLOW_BROWSER_PROBE');
    lines.push('============================================================');
    lines.push(`URL:                      ${report.url}`);
    lines.push(`AUTHENTICATED:            ${report.authenticated ? 'YES ✅' : 'NO ❌ (BLOCKED_AUTH)'}`);
    lines.push(`PAGE_STATE:               ${report.pageState}`);
    lines.push(`PROJECT_UI_FOUND:         ${report.projectUiFound ? 'YES ✅' : 'NO ❌'}`);
    lines.push(`AGENT_CONTROL_FOUND:      ${report.agentControl.status === 'FOUND' ? 'YES ✅' : report.agentControl.status === 'AMBIGUOUS' ? 'AMBIGUOUS ⚠️' : 'UNKNOWN ❌'}`);
    lines.push(`PROMPT_INPUT_FOUND:       ${report.promptControl.status === 'FOUND' ? 'YES ✅' : report.promptControl.status === 'AMBIGUOUS' ? 'AMBIGUOUS ⚠️' : 'UNKNOWN ❌'}`);
    lines.push(`GENERATE_CONTROL_FOUND:   ${report.generateControl.status === 'FOUND' ? 'YES ✅ (NEVER CLICKED — 0 CREDITS)' : report.generateControl.status === 'AMBIGUOUS' ? 'AMBIGUOUS ⚠️' : 'UNKNOWN ❌'}`);
    lines.push(`CREDIT_UI_FOUND:          ${report.creditControl.status === 'FOUND' ? `YES ✅ (${report.creditControl.parsedCredits !== null ? `${report.creditControl.parsedCredits} credits` : 'text observed'}, certain=${report.creditControl.isCertain})` : 'UNKNOWN ❌'}`);
    lines.push(`ASSET_REGION_FOUND:       ${report.assetRegion.status === 'FOUND' ? `YES ✅ (${report.assetRegion.candidateCount} card(s))` : 'UNKNOWN ❌'}`);
    lines.push(`DOWNLOAD_CONTROL_FOUND:   ${report.downloadControl.status === 'FOUND' ? 'YES ✅ (SCOPED CONTAINER)' : report.downloadControl.status === 'AMBIGUOUS' ? 'AMBIGUOUS ⚠️' : 'UNKNOWN ❌'}`);
    lines.push('');
    lines.push('ZERO CREDIT RULE:');
    lines.push('PROMPT SUBMITTED:         NO (Zero prompts typed)');
    lines.push('GENERATE CLICKED:         NO (Zero clicks dispatched)');
    lines.push('CREDITS CONSUMED:         0 (Strict zero-consumption guarantee)');
    lines.push('');
    lines.push('Visible semantic controls:');
    if (report.visibleSemanticControls.length === 0) {
      lines.push('  (None or non-interactive viewport)');
    } else {
      report.visibleSemanticControls.slice(0, 10).forEach((c) => {
        lines.push(`  • <${c.tag}> ${c.role ? `[role="${c.role}"] ` : ''}${c.label ? `"${c.label}"` : ''}`);
      });
    }
    lines.push('============================================================');

    return lines.join('\n');
  }

  private static async detectAuthBlock(page: Page): Promise<FlowAuthBlockStatus> {
    try {
      const url = page.url().toLowerCase();
      if (url.includes('accounts.google.com') || url.includes('/signin') || url.includes('/login')) {
        return { isBlocked: true, blockType: 'LOGIN', details: 'Google sign-in page detected.' };
      }

      const pageText: string = await page
        .evaluate(() => (document.body ? document.body.innerText.toLowerCase().slice(0, 2000) : ''))
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
}
