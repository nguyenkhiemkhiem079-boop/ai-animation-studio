/**
 * ChromeFlowSessionBridge
 *
 * Implements Phase 27C Real Chrome Session Bridge:
 *   - Attaches to real system Chrome instances via Chrome DevTools Protocol (CDP).
 *   - Uses dedicated, isolated browser profile (.studio/browser-profiles/google-flow).
 *   - Human logs into Google ONCE in real visible system Chrome (no automated login / no bypass).
 *   - Studio attaches to the authenticated session via puppeteer.connect({ browserURL }).
 *   - Subsequent runs (studio create, browser-probe, etc.) reuse authenticated session zero-touch.
 *   - Local-only security boundary (127.0.0.1 / localhost only).
 *   - Tracks process ownership: never closes user's pre-existing Chrome instance.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { spawn, ChildProcess } from 'node:child_process';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { FlowContractProbe, FlowPageState } from './flow-contract-probe.js';
import { FlowAuthBlockStatus } from './flow-page-adapter.js';

export interface ChromeFlowBridgeConfig {
  cdpPort?: number;
  cdpHost?: string;
  userDataDir?: string;
  flowUrl?: string;
  chromeExecutablePath?: string;
  autoLaunch?: boolean;
  headless?: boolean;
}

export interface ChromeSessionStatus {
  systemChromeFound: boolean;
  chromePath?: string;
  cdpPort: number;
  cdpEndpoint: string;
  cdpConnected: boolean;
  flowTabFound: boolean;
  authenticated: boolean;
  flowUiFound: boolean;
  pageState: FlowPageState;
  profilePath: string;
  isStudioOwned: boolean;
  details?: string;
}

export interface ConnectedChromeSession {
  browser: Browser;
  page: Page;
  isStudioOwned: boolean;
  cdpEndpoint: string;
  cdpPort: number;
}

export class ChromeFlowSessionBridge {
  public static readonly DEFAULT_PORT = 9222;
  public static readonly DEFAULT_HOST = '127.0.0.1';
  public static readonly DEFAULT_FLOW_URL = 'https://flow.google.com';

  private readonly config: Required<ChromeFlowBridgeConfig>;
  private spawnedProcess?: ChildProcess;

  constructor(config: ChromeFlowBridgeConfig = {}) {
    const defaultUserDataDir = path.resolve(
      process.cwd(),
      '.studio',
      'browser-profiles',
      'google-flow'
    );

    const configuredPort =
      config.cdpPort ||
      (process.env.FLOW_CDP_PORT ? parseInt(process.env.FLOW_CDP_PORT, 10) : undefined) ||
      ChromeFlowSessionBridge.DEFAULT_PORT;

    this.config = {
      cdpPort: configuredPort,
      cdpHost: config.cdpHost || process.env.FLOW_CDP_HOST || ChromeFlowSessionBridge.DEFAULT_HOST,
      userDataDir: config.userDataDir || defaultUserDataDir,
      flowUrl: config.flowUrl || ChromeFlowSessionBridge.DEFAULT_FLOW_URL,
      chromeExecutablePath: config.chromeExecutablePath || ChromeFlowSessionBridge.findSystemChrome() || '',
      autoLaunch: config.autoLaunch ?? true,
      headless: config.headless ?? false,
    };

    // Security Guard: Fail closed on non-local CDP hosts
    ChromeFlowSessionBridge.assertLocalHostOnly(this.config.cdpHost);
  }

  /**
   * Enforces security policy: only 127.0.0.1 or localhost are allowable CDP hosts.
   */
  public static assertLocalHostOnly(host: string): void {
    const clean = host.toLowerCase().trim();
    if (clean !== '127.0.0.1' && clean !== 'localhost') {
      throw new Error(
        `[SECURITY_VIOLATION] Non-local CDP host "${host}" is strictly forbidden. Only 127.0.0.1 or localhost allowed.`
      );
    }
  }

  /**
   * Resolves the real system Google Chrome or Chromium executable.
   */
  public static findSystemChrome(): string | undefined {
    const additionalWindowsPaths: string[] = [];
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      additionalWindowsPaths.push(
        path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      );
    }

    for (const p of additionalWindowsPaths) {
      if (fs.existsSync(p)) return p;
    }

    return MediaToolchainDoctor.getBrowserExecutablePath();
  }

  /**
   * Checks whether the local CDP endpoint is active and serving JSON version data.
   */
  public static async isCdpActive(
    port = ChromeFlowSessionBridge.DEFAULT_PORT,
    host = ChromeFlowSessionBridge.DEFAULT_HOST
  ): Promise<boolean> {
    ChromeFlowSessionBridge.assertLocalHostOnly(host);

    return new Promise((resolve) => {
      const req = http.get(
        {
          host,
          port,
          path: '/json/version',
          timeout: 1000,
        },
        (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Polls local CDP endpoint until ready or timeout reached.
   */
  public static async waitForDebuggerEndpoint(
    port = ChromeFlowSessionBridge.DEFAULT_PORT,
    host = ChromeFlowSessionBridge.DEFAULT_HOST,
    timeoutMs = 15000
  ): Promise<string> {
    ChromeFlowSessionBridge.assertLocalHostOnly(host);

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const isOpen = await ChromeFlowSessionBridge.isCdpActive(port, host);
      if (isOpen) {
        return `http://${host}:${port}`;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    throw new Error(
      `[CDP_TIMEOUT] Chrome remote debugger did not respond on http://${host}:${port} after ${timeoutMs}ms.`
    );
  }

  /**
   * Launches real system Chrome process with dedicated profile and remote debugging enabled.
   * NEVER uses Puppeteer automation flags.
   */
  public launchSystemChrome(options: {
    port?: number;
    userDataDir?: string;
    url?: string;
  } = {}): { process: ChildProcess; port: number; profilePath: string } {
    const chromePath = this.config.chromeExecutablePath || ChromeFlowSessionBridge.findSystemChrome();
    if (!chromePath || !fs.existsSync(chromePath)) {
      throw new Error(
        'Google Chrome was not found on this system. Please install Google Chrome or specify its executable path.'
      );
    }

    const port = options.port || this.config.cdpPort;
    const profilePath = options.userDataDir || this.config.userDataDir;
    const targetUrl = options.url || this.config.flowUrl;

    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }

    const chromeArgs = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profilePath}`,
      '--no-first-run',
      '--no-default-browser-check',
      targetUrl,
    ];

    const child = spawn(chromePath, chromeArgs, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();
    this.spawnedProcess = child;

    return {
      process: child,
      port,
      profilePath,
    };
  }

  /**
   * Connects to the authenticated system Chrome session via CDP.
   * Auto-launches Chrome with dedicated profile if not already running.
   */
  public async connect(options: {
    autoLaunch?: boolean;
    timeoutMs?: number;
  } = {}): Promise<ConnectedChromeSession> {
    const { cdpPort, cdpHost, userDataDir, flowUrl } = this.config;
    const autoLaunch = options.autoLaunch ?? this.config.autoLaunch;

    let isStudioOwned = false;
    let isRunning = await ChromeFlowSessionBridge.isCdpActive(cdpPort, cdpHost);

    if (!isRunning) {
      if (!autoLaunch) {
        throw new Error(
          `[FLOW_SESSION_UNAVAILABLE] Google Flow Chrome session is not running on port ${cdpPort}.\nRun "studio flow login" to launch interactive setup.`
        );
      }

      // Auto-launch system Chrome with dedicated profile
      this.launchSystemChrome({ port: cdpPort, userDataDir, url: flowUrl });
      isStudioOwned = true;
      await ChromeFlowSessionBridge.waitForDebuggerEndpoint(cdpPort, cdpHost, options.timeoutMs ?? 20000);
    }

    const endpoint = `http://${cdpHost}:${cdpPort}`;
    const browser = await puppeteer.connect({
      browserURL: endpoint,
      defaultViewport: null,
    });

    const page = await this.findOrOpenFlowPage(browser, flowUrl);

    return {
      browser,
      page,
      isStudioOwned,
      cdpEndpoint: endpoint,
      cdpPort,
    };
  }

  /**
   * Discovers existing Google Flow tab across open browser tabs or opens a new tab.
   */
  public async findOrOpenFlowPage(browser: Browser, targetUrl = this.config.flowUrl): Promise<Page> {
    const pages = await browser.pages();

    // 1. Look for existing Google Flow tab
    for (const p of pages) {
      const url = p.url();
      if (url.includes('flow.google.com') || (targetUrl && url.startsWith(targetUrl))) {
        await p.bringToFront().catch(() => {});
        return p;
      }
    }

    // 2. If an empty/new tab exists, navigate it
    for (const p of pages) {
      const url = p.url();
      if (url === 'about:blank' || url === 'chrome://newtab/') {
        await p.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await p.bringToFront().catch(() => {});
        return p;
      }
    }

    // 3. Open new tab
    const newPage = await browser.newPage();
    await newPage.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await newPage.bringToFront().catch(() => {});
    return newPage;
  }

  /**
   * Disconnects from the Chrome session without killing pre-existing user browser windows.
   */
  public async disconnect(
    browser?: Browser,
    options: { closeIfStudioOwned?: boolean; isStudioOwned?: boolean } = {}
  ): Promise<void> {
    if (!browser) return;

    try {
      if (options.closeIfStudioOwned && options.isStudioOwned) {
        await browser.close().catch(() => {});
      } else {
        await browser.disconnect().catch(() => {});
      }
    } catch {
      // Disconnect error ignored
    }
  }

  /**
   * Diagnoses full Chrome session status without credentials or secret leakage.
   */
  public async getSessionStatus(): Promise<{
    status: ChromeSessionStatus;
    formatted: string;
  }> {
    const { cdpPort, cdpHost, userDataDir, flowUrl, chromeExecutablePath } = this.config;
    const systemChromeFound = Boolean(chromeExecutablePath && fs.existsSync(chromeExecutablePath));
    const endpoint = `http://${cdpHost}:${cdpPort}`;

    const isRunning = await ChromeFlowSessionBridge.isCdpActive(cdpPort, cdpHost);

    if (!isRunning) {
      const status: ChromeSessionStatus = {
        systemChromeFound,
        chromePath: chromeExecutablePath,
        cdpPort,
        cdpEndpoint: endpoint,
        cdpConnected: false,
        flowTabFound: false,
        authenticated: false,
        flowUiFound: false,
        pageState: 'UNKNOWN_PAGE',
        profilePath: userDataDir,
        isStudioOwned: false,
        details: 'CDP Chrome instance is not running on configured port',
      };
      return { status, formatted: ChromeFlowSessionBridge.formatSessionStatus(status) };
    }

    let browser: Browser | undefined;
    try {
      browser = await puppeteer.connect({
        browserURL: endpoint,
        defaultViewport: null,
      });

      const pages = await browser.pages();
      let flowPage: Page | undefined;
      for (const p of pages) {
        if (p.url().includes('flow.google.com')) {
          flowPage = p;
          break;
        }
      }

      const flowTabFound = Boolean(flowPage);
      let authenticated = false;
      let pageState: FlowPageState = 'UNKNOWN_PAGE';
      let flowUiFound = false;

      if (flowPage) {
        const url = flowPage.url();
        const text = await flowPage.evaluate(() => (document.body ? document.body.innerText.slice(0, 2000) : '')).catch(() => '');
        pageState = FlowContractProbe.categorizePageState(url, text);

        // Check authentication
        const isAuthBlocked =
          url.includes('accounts.google.com') ||
          url.includes('/signin') ||
          text.toLowerCase().includes('sign in with google') ||
          text.toLowerCase().includes('choose an account');

        authenticated = !isAuthBlocked;
        flowUiFound = pageState === 'FLOW_PROJECT' || pageState === 'FLOW_HOME';
      }

      const status: ChromeSessionStatus = {
        systemChromeFound,
        chromePath: chromeExecutablePath,
        cdpPort,
        cdpEndpoint: endpoint,
        cdpConnected: true,
        flowTabFound,
        authenticated,
        flowUiFound,
        pageState,
        profilePath: userDataDir,
        isStudioOwned: false,
        details: authenticated ? 'Authenticated session active' : 'Google sign-in required in browser window',
      };

      return { status, formatted: ChromeFlowSessionBridge.formatSessionStatus(status) };
    } catch (err: any) {
      const status: ChromeSessionStatus = {
        systemChromeFound,
        chromePath: chromeExecutablePath,
        cdpPort,
        cdpEndpoint: endpoint,
        cdpConnected: false,
        flowTabFound: false,
        authenticated: false,
        flowUiFound: false,
        pageState: 'UNKNOWN_PAGE',
        profilePath: userDataDir,
        isStudioOwned: false,
        details: `Connection failed: ${err?.message || String(err)}`,
      };
      return { status, formatted: ChromeFlowSessionBridge.formatSessionStatus(status) };
    } finally {
      if (browser) {
        await browser.disconnect().catch(() => {});
      }
    }
  }

  /**
   * Formats sanitized session status output conforming to Phase 27C contract.
   */
  public static formatSessionStatus(status: ChromeSessionStatus): string {
    const lines: string[] = [];
    lines.push('============================================================');
    lines.push('CHROME FLOW SESSION STATUS');
    lines.push('============================================================');
    lines.push(`SYSTEM_CHROME_FOUND : ${status.systemChromeFound ? 'YES' : 'NO'}`);
    lines.push(`CDP_ENDPOINT        : ${status.cdpEndpoint}`);
    lines.push(`CDP_CONNECTED       : ${status.cdpConnected ? 'YES' : 'NO'}`);
    lines.push(`FLOW_TAB_FOUND      : ${status.flowTabFound ? 'YES' : 'NO'}`);
    lines.push(`AUTHENTICATED       : ${status.authenticated ? 'YES' : 'NO'}`);
    lines.push(`FLOW_UI_FOUND       : ${status.flowUiFound ? 'YES' : 'NO'}`);
    lines.push(`PROFILE_PATH        : ${status.profilePath}`);
    if (status.details) {
      lines.push(`DETAILS             : ${status.details}`);
    }
    lines.push('============================================================');
    return lines.join('\n');
  }
}
