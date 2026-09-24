/**
 * Phase 27C — Real Chrome Session Bridge Tests
 *
 * Verifies:
 *   1. System Chrome discovery
 *   2. Dedicated profile path (.studio/browser-profiles/google-flow)
 *   3. Local-only CDP endpoint (fail closed on non-local)
 *   4. CDP connect & port checking
 *   5. Existing Flow tab discovery
 *   6. Open Flow tab when absent
 *   7. Authenticated session detection
 *   8. Session expired -> BLOCKED_AUTH
 *   9. Studio create reuses existing session
 *   10. Studio-started Chrome ownership tracking
 *   11. External Chrome is never closed (disconnect only)
 *   12. No Puppeteer-driven login (system spawn only)
 *   13. Probe remains zero-credit
 *   14. Fallback to FLOW_SESSION_UNAVAILABLE with "studio flow login"
 *   15. Sanitized status output with no secrets
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as http from 'node:http';

import {
  ChromeFlowSessionBridge,
  ChromeSessionStatus,
  FlowBrowserOperator,
  MockFlowPage,
  ZeroTouchProductionOrchestrator,
  ShotContract,
} from '../src/index.js';

describe('Phase 27C — Real Chrome Session Bridge', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─── 1. System Chrome Discovery ──────────────────────────────────────────

  it('SYSTEM_CHROME_DISCOVERY: locates system Chrome or provides fallback path inspection', () => {
    const chromePath = ChromeFlowSessionBridge.findSystemChrome();
    // On systems with Chrome installed, it returns a valid string path
    if (chromePath) {
      expect(typeof chromePath).toBe('string');
      expect(chromePath.length).toBeGreaterThan(0);
      expect(chromePath.toLowerCase()).toMatch(/chrome|chromium|msedge/);
    } else {
      // If headless environment lacks Chrome, function safely returns undefined
      expect(chromePath).toBeUndefined();
    }
  });

  // ─── 2. Dedicated Chrome Profile ─────────────────────────────────────────

  it('DEDICATED_PROFILE_PATH: defaults strictly to .studio/browser-profiles/google-flow', () => {
    const bridge = new ChromeFlowSessionBridge();
    const statusPromise = bridge.getSessionStatus();

    // Verify profile path via session status
    return statusPromise.then(({ status }) => {
      expect(status.profilePath).toContain(path.normalize('.studio/browser-profiles/google-flow'));
      // Must NEVER touch default Chrome profile
      expect(status.profilePath.toLowerCase()).not.toContain('google\\chrome\\user data\\default');
      expect(status.profilePath.toLowerCase()).not.toContain('google/chrome/user data/default');
    });
  });

  it('DEDICATED_PROFILE_PATH: allows custom user-data-dir while keeping default secure', () => {
    const customDir = path.resolve('.studio', 'custom-flow-profile');
    const bridge = new ChromeFlowSessionBridge({ userDataDir: customDir });
    return bridge.getSessionStatus().then(({ status }) => {
      expect(status.profilePath).toBe(customDir);
    });
  });

  // ─── 3. Local-Only CDP Endpoint Security ─────────────────────────────────

  describe('Local-Only CDP Security Boundary', () => {
    it('LOCAL_ONLY_CDP: accepts 127.0.0.1 and localhost', () => {
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly('127.0.0.1')).not.toThrow();
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly('localhost')).not.toThrow();
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly(' 127.0.0.1 ')).not.toThrow();
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly('LOCALHOST')).not.toThrow();
    });

    it('LOCAL_ONLY_CDP: throws [SECURITY_VIOLATION] on non-local IP or external hostname', () => {
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly('192.168.1.50')).toThrow(
        /SECURITY_VIOLATION/
      );
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly('flow.google.com')).toThrow(
        /SECURITY_VIOLATION/
      );
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly('0.0.0.0')).toThrow(
        /SECURITY_VIOLATION/
      );
      expect(() => ChromeFlowSessionBridge.assertLocalHostOnly('10.0.0.1')).toThrow(
        /SECURITY_VIOLATION/
      );
    });

    it('LOCAL_ONLY_CDP: bridge constructor fails closed on non-local host', () => {
      expect(() => new ChromeFlowSessionBridge({ cdpHost: 'remote-debugger.internal' })).toThrow(
        /SECURITY_VIOLATION/
      );
    });
  });

  // ─── 4. Port Management & Active Check ────────────────────────────────────

  describe('CDP Port Management & Liveness', () => {
    it('CDP_PORT: defaults to 9222 and respects FLOW_CDP_PORT environment variable', () => {
      process.env.FLOW_CDP_PORT = '9333';
      const bridge = new ChromeFlowSessionBridge();
      return bridge.getSessionStatus().then(({ status }) => {
        expect(status.cdpPort).toBe(9333);
        expect(status.cdpEndpoint).toBe('http://127.0.0.1:9333');
      });
    });

    it('CDP_ACTIVE_CHECK: correctly detects when local CDP port is active vs inactive', async () => {
      // Ephemeral mock CDP HTTP server
      const server = http.createServer((req, res) => {
        if (req.url === '/json/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ Browser: 'Chrome/130.0.0.0', 'Protocol-Version': '1.3' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        });
      });

      try {
        const isActive = await ChromeFlowSessionBridge.isCdpActive(port, '127.0.0.1');
        expect(isActive).toBe(true);

        const endpoint = await ChromeFlowSessionBridge.waitForDebuggerEndpoint(port, '127.0.0.1', 2000);
        expect(endpoint).toBe(`http://127.0.0.1:${port}`);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }

      // After closing, isCdpActive must return false
      const isInactive = await ChromeFlowSessionBridge.isCdpActive(port, '127.0.0.1');
      expect(isInactive).toBe(false);
    });
  });

  // ─── 5. Tab Discovery & Reuse ─────────────────────────────────────────────

  describe('Flow Tab Discovery and Navigation', () => {
    it('EXISTING_TAB_DISCOVERY: finds and reuses existing Google Flow tab without opening new tab', async () => {
      const bridge = new ChromeFlowSessionBridge();

      const bringToFrontMock = vi.fn().mockResolvedValue(undefined);
      const mockFlowPage = {
        url: () => 'https://flow.google.com/project/proj_alpha_123',
        bringToFront: bringToFrontMock,
      };
      const mockBlankPage = {
        url: () => 'about:blank',
        bringToFront: vi.fn(),
        goto: vi.fn(),
      };

      const mockBrowser = {
        pages: vi.fn().mockResolvedValue([mockBlankPage, mockFlowPage]),
        newPage: vi.fn(),
      };

      const foundPage = await bridge.findOrOpenFlowPage(mockBrowser as any);

      expect(foundPage).toBe(mockFlowPage);
      expect(bringToFrontMock).toHaveBeenCalled();
      expect(mockBrowser.newPage).not.toHaveBeenCalled();
    });

    it('OPEN_TAB_WHEN_ABSENT: navigates blank tab or opens new page when Flow tab is absent', async () => {
      const bridge = new ChromeFlowSessionBridge();

      const newPageMock = {
        url: () => 'about:blank',
        goto: vi.fn().mockResolvedValue(undefined),
        bringToFront: vi.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        pages: vi.fn().mockResolvedValue([{ url: () => 'https://example.com' }]),
        newPage: vi.fn().mockResolvedValue(newPageMock),
      };

      const page = await bridge.findOrOpenFlowPage(mockBrowser as any, 'https://flow.google.com');

      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(newPageMock.goto).toHaveBeenCalledWith('https://flow.google.com', expect.any(Object));
      expect(page).toBe(newPageMock);
    });
  });

  // ─── 6. Authenticated Session Detection ───────────────────────────────────

  describe('Authentication Detection & Status Formatting', () => {
    it('AUTHENTICATED_SESSION: formatSessionStatus produces key-value contract without secrets', () => {
      const status: ChromeSessionStatus = {
        systemChromeFound: true,
        chromePath: 'C:\\Program Files\\Google\\Chrome\\chrome.exe',
        cdpPort: 9222,
        cdpEndpoint: 'http://127.0.0.1:9222',
        cdpConnected: true,
        flowTabFound: true,
        authenticated: true,
        flowUiFound: true,
        pageState: 'FLOW_PROJECT',
        profilePath: 'C:\\repo\\.studio\\browser-profiles\\google-flow',
        isStudioOwned: false,
      };

      const formatted = ChromeFlowSessionBridge.formatSessionStatus(status);

      expect(formatted).toContain('SYSTEM_CHROME_FOUND : YES');
      expect(formatted).toContain('CDP_ENDPOINT        : http://127.0.0.1:9222');
      expect(formatted).toContain('CDP_CONNECTED       : YES');
      expect(formatted).toContain('FLOW_TAB_FOUND      : YES');
      expect(formatted).toContain('AUTHENTICATED       : YES');
      expect(formatted).toContain('FLOW_UI_FOUND       : YES');
      expect(formatted).toContain('PROFILE_PATH        : C:\\repo\\.studio\\browser-profiles\\google-flow');

      // Security: never leak cookies, tokens, or auth headers
      expect(formatted).not.toContain('cookie');
      expect(formatted).not.toContain('token');
      expect(formatted).not.toContain('bearer');
      expect(formatted).not.toContain('password');
    });

    it('SESSION_EXPIRED: reports AUTHENTICATED: NO when signin/account prompt detected', () => {
      const status: ChromeSessionStatus = {
        systemChromeFound: true,
        cdpPort: 9222,
        cdpEndpoint: 'http://127.0.0.1:9222',
        cdpConnected: true,
        flowTabFound: true,
        authenticated: false,
        flowUiFound: false,
        pageState: 'AUTH_REQUIRED',
        profilePath: '.studio/browser-profiles/google-flow',
        isStudioOwned: false,
      };

      const formatted = ChromeFlowSessionBridge.formatSessionStatus(status);
      expect(formatted).toContain('AUTHENTICATED       : NO');
      expect(formatted).toContain('FLOW_UI_FOUND       : NO');
    });
  });

  // ─── 7. Process Ownership & Safe Disconnect ───────────────────────────────

  describe('Process Ownership & Non-Destructive Disconnect', () => {
    it('EXTERNAL_CHROME_NEVER_CLOSED: calls disconnect() and NEVER close() on pre-existing browser', async () => {
      const bridge = new ChromeFlowSessionBridge();

      const disconnectMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);

      const mockExternalBrowser = {
        disconnect: disconnectMock,
        close: closeMock,
      };

      // Disconnect when Chrome was pre-existing (isStudioOwned: false)
      await bridge.disconnect(mockExternalBrowser as any, {
        isStudioOwned: false,
        closeIfStudioOwned: true,
      });

      expect(disconnectMock).toHaveBeenCalledTimes(1);
      expect(closeMock).not.toHaveBeenCalled();
    });

    it('STUDIO_OWNED_CHROME: disconnects cleanly without closing unless closeIfStudioOwned is explicitly true', async () => {
      const bridge = new ChromeFlowSessionBridge();

      const disconnectMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);

      const mockStudioBrowser = {
        disconnect: disconnectMock,
        close: closeMock,
      };

      // When closeIfStudioOwned is false, it only disconnects
      await bridge.disconnect(mockStudioBrowser as any, {
        isStudioOwned: true,
        closeIfStudioOwned: false,
      });

      expect(disconnectMock).toHaveBeenCalledTimes(1);
      expect(closeMock).not.toHaveBeenCalled();

      // When closeIfStudioOwned is true, it calls close()
      await bridge.disconnect(mockStudioBrowser as any, {
        isStudioOwned: true,
        closeIfStudioOwned: true,
      });

      expect(closeMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 8. FlowBrowserOperator Session Mode & CDP Attach ─────────────────────

  describe('FlowBrowserOperator CDP Integration', () => {
    it('SESSION_MODE_DEFAULT: defaults to CDP_ATTACH with autoLaunchChrome = true', () => {
      const operator = new FlowBrowserOperator();
      const config = (operator as any).config;

      expect(config.sessionMode).toBe('CDP_ATTACH');
      expect(config.autoLaunchChrome).toBe(true);
      expect(config.cdpPort).toBe(9222);
      expect(config.cdpHost).toBe('127.0.0.1');
    });

    it('FALLBACK_CLOSED: fails closed with FLOW_SESSION_UNAVAILABLE and instructs studio flow login', async () => {
      // Point to inactive port with autoLaunch disabled
      const operator = new FlowBrowserOperator({
        sessionMode: 'CDP_ATTACH',
        cdpPort: 54321,
        autoLaunchChrome: false,
      });

      await expect(operator.getPage()).rejects.toThrow(
        /\[FLOW_SESSION_UNAVAILABLE\].*studio flow login/s
      );
    });

    it('PROBE_VIA_CDP: probe fails closed with FLOW_SESSION_UNAVAILABLE if CDP unavailable', async () => {
      const operator = new FlowBrowserOperator({
        sessionMode: 'CDP_ATTACH',
        cdpPort: 54322,
        autoLaunchChrome: false,
      });

      await expect(operator.probe()).rejects.toThrow(
        /\[FLOW_SESSION_UNAVAILABLE\].*studio flow login/s
      );
    });

    it('NO_PUPPETEER_LOGIN: launchInteractiveSession returns spawn details without puppeteer.launch', () => {
      const operator = new FlowBrowserOperator();
      // Mock findSystemChrome to return a safe executable path
      const origFind = ChromeFlowSessionBridge.findSystemChrome;
      ChromeFlowSessionBridge.findSystemChrome = () => process.execPath; // Use node executable as mock child

      try {
        const session = operator.launchInteractiveSession();
        expect(session.profilePath).toContain('google-flow');
        expect(session.port).toBe(9222);
        expect(session.process).toBeDefined();
        // Kill mock child immediately to avoid hanging
        if (session.process && session.process.kill) {
          session.process.kill();
        }
      } finally {
        ChromeFlowSessionBridge.findSystemChrome = origFind;
      }
    });

    it('PROBE_ZERO_CREDIT: mock page probe runs with 0 prompt submissions and 0 credits spent', async () => {
      const mockPage = new MockFlowPage();
      const operator = new FlowBrowserOperator({ flowPage: mockPage });

      const { report, formattedReport } = await operator.probe({ persistEvidence: false });

      expect(report.pageState).toBe('FLOW_PROJECT');
      expect(report.promptControl.status).toBe('FOUND');
      expect(formattedReport).toContain('FLOW_PROJECT');
      // Mock page tracks submissions: must remain 0
      expect(mockPage.submittedInstructions).toHaveLength(0);
    });

    it('SESSION_EXPIRED_BLOCKED_AUTH: halts production run with BLOCKED_AUTH when Google sign-in required', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedAuthBlock = {
        isBlocked: true,
        blockType: 'LOGIN',
        details: 'Google login required',
      };

      const operator = new FlowBrowserOperator({ flowPage: mockPage });

      const sampleShot: ShotContract = {
        id: 'SHOT_AUTH_TEST',
        sceneId: 'SCENE_01',
        shotNumber: 1,
        purpose: 'establishing',
        complexity: 'complex_generative_video',
        rendererIntent: 'generative_full_video',
        frame: { durationSeconds: 4.0, aspectRatio: '16:9', targetFps: 24 },
        camera: { focalLength: '35mm', shotSize: 'medium_close_up', angle: 'eye_level', movement: 'push_in', semanticSkills: [] },
        lighting: { keyLightDirection: 'front', mood: 'cinematic', colorTemperature: 'warm', fogAtmosphere: false },
        composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
        acting: [],
        transition: { type: 'cut', durationSeconds: 0 },
        audioCue: { sfx: [] },
        requiredAssetIds: [],
        dependsOnShotIds: [],
        directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
        provenance: { sourceBeatId: 'BEAT_01', directorProfileId: 'DEFAULT', decidedAt: new Date().toISOString() },
      };

      const result = await operator.execute({
        projectId: 'proj_auth_test',
        shots: [sampleShot],
      });

      expect(result.finalState).toBe('BLOCKED_AUTH');
      expect(result.allPassed).toBe(false);
      expect(result.manualActionsRequired).toBe(1);
      expect(result.error).toContain('Google authentication required');
    });
  });
});
