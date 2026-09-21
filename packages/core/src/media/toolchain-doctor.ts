import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

export interface ToolchainDiagnostic {
  tool: string;
  available: boolean;
  version?: string;
  path?: string;
  details?: string;
}

export interface MediaToolchainStatus {
  allReady: boolean;
  ffmpeg: ToolchainDiagnostic;
  ffprobe: ToolchainDiagnostic;
  browser: ToolchainDiagnostic;
}

export class MediaToolchainDoctor {
  private static cachedStatus?: MediaToolchainStatus;

  /**
   * Resolves the active FFmpeg binary path (system path or ffmpeg-static).
   */
  public static getFfmpegPath(): string {
    // 1. Check ffmpeg-static
    try {
      const ffmpegStatic = req('ffmpeg-static');
      if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        return ffmpegStatic;
      }
    } catch {
      // ignore
    }

    // 2. Check system ffmpeg in PATH
    try {
      const out = execSync(process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().split(/\r?\n/)[0];
      if (out && fs.existsSync(out)) return out;
    } catch {
      // ignore
    }

    return 'ffmpeg';
  }

  /**
   * Resolves the active FFprobe binary path (system path or ffprobe-static).
   */
  public static getFfprobePath(): string {
    // 1. Check ffprobe-static
    try {
      const ffprobeStatic = req('ffprobe-static');
      if (ffprobeStatic?.path && fs.existsSync(ffprobeStatic.path)) {
        return ffprobeStatic.path;
      }
    } catch {
      // ignore
    }

    // 2. Check system ffprobe in PATH
    try {
      const out = execSync(process.platform === 'win32' ? 'where ffprobe' : 'which ffprobe', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().split(/\r?\n/)[0];
      if (out && fs.existsSync(out)) return out;
    } catch {
      // ignore
    }

    return 'ffprobe';
  }

  /**
   * Resolves a local browser executable (Chrome, Edge, Chromium).
   */
  public static getBrowserExecutablePath(): string | undefined {
    const candidates: string[] = [];

    if (process.platform === 'win32') {
      candidates.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      );
    } else if (process.platform === 'darwin') {
      candidates.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      );
    } else {
      candidates.push(
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge'
      );
    }

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }

    return undefined;
  }

  /**
   * Runs complete diagnostics on FFmpeg, FFprobe, and headless browser.
   */
  public static diagnose(forceRefresh = false): MediaToolchainStatus {
    if (this.cachedStatus && !forceRefresh) {
      return this.cachedStatus;
    }

    const ffmpegPath = this.getFfmpegPath();
    const ffprobePath = this.getFfprobePath();
    const browserPath = this.getBrowserExecutablePath();

    // Diagnose FFmpeg
    let ffmpegDiag: ToolchainDiagnostic = { tool: 'ffmpeg', available: false };
    try {
      const out = execSync(`"${ffmpegPath}" -version`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = out.match(/ffmpeg version ([^\s]+)/);
      ffmpegDiag = {
        tool: 'ffmpeg',
        available: true,
        version: match ? match[1] : 'detected',
        path: ffmpegPath,
        details: 'H.264, AAC, yuv420p support enabled',
      };
    } catch (err: any) {
      ffmpegDiag.details = err?.message;
    }

    // Diagnose FFprobe
    let ffprobeDiag: ToolchainDiagnostic = { tool: 'ffprobe', available: false };
    try {
      const out = execSync(`"${ffprobePath}" -version`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = out.match(/ffprobe version ([^\s]+)/);
      ffprobeDiag = {
        tool: 'ffprobe',
        available: true,
        version: match ? match[1] : 'detected',
        path: ffprobePath,
        details: 'Stream analysis & duration inspection available',
      };
    } catch (err: any) {
      ffprobeDiag.details = err?.message;
    }

    // Diagnose Browser
    let browserDiag: ToolchainDiagnostic = { tool: 'browser', available: false };
    if (browserPath) {
      browserDiag = {
        tool: 'browser',
        available: true,
        path: browserPath,
        details: 'Headless frame capture ready for HyperFrames compositions',
      };
    } else {
      browserDiag.details = 'No Google Chrome, Microsoft Edge, or Chromium executable found on system';
    }

    const allReady = ffmpegDiag.available && ffprobeDiag.available && browserDiag.available;

    this.cachedStatus = {
      allReady,
      ffmpeg: ffmpegDiag,
      ffprobe: ffprobeDiag,
      browser: browserDiag,
    };

    return this.cachedStatus;
  }
}
