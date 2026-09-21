import * as path from 'node:path';
import * as fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';

export interface FrameCaptureOptions {
  htmlContent: string;
  outputDir: string;
  durationSeconds: number;
  fps: number;
  width?: number;
  height?: number;
}

export interface FrameCaptureResult {
  totalFrames: number;
  framePaths: string[];
  outputDir: string;
  durationMs: number;
}

export class HeadlessFrameCapture {
  /**
   * Deterministically captures a sequence of PNG frames from a HyperFrames HTML composition
   * using a local headless browser.
   */
  public static async captureFrames(options: FrameCaptureOptions): Promise<FrameCaptureResult> {
    const startTime = Date.now();
    const {
      htmlContent,
      outputDir,
      durationSeconds,
      fps,
      width = 1280,
      height = 720,
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const browserPath = MediaToolchainDoctor.getBrowserExecutablePath();
    if (!browserPath) {
      throw new Error(
        'Headless frame capture requires Google Chrome, Microsoft Edge, or Chromium installed locally.'
      );
    }

    const browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const framePaths: string[] = [];
    const totalFrames = Math.max(1, Math.round(durationSeconds * fps));

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

      for (let frame = 0; frame < totalFrames; frame++) {
        const timeSeconds = frame / fps;

        // Evaluate frame seek in the HyperFrames DOM environment
        await page.evaluate((t) => {
          if (typeof (globalThis as any).__hyperframesSeek === 'function') {
            (globalThis as any).__hyperframesSeek(t);
          }
        }, timeSeconds);

        const frameFileName = `frame_${String(frame).padStart(4, '0')}.png`;
        const frameFilePath = path.join(outputDir, frameFileName);

        const buffer = await page.screenshot({ type: 'png' });
        fs.writeFileSync(frameFilePath, buffer);
        framePaths.push(frameFilePath);
      }
    } finally {
      await browser.close();
    }

    return {
      totalFrames,
      framePaths,
      outputDir,
      durationMs: Date.now() - startTime,
    };
  }
}
