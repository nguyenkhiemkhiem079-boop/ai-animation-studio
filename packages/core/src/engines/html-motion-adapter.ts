/**
 * HtmlMotionEngineAdapter
 *
 * Deterministic local HTML/CSS/JS motion rendering engine.
 * Renders HTML compositions to MP4 via headless browser frame capture and FFmpeg.
 *
 * Cost class: FREE_LOCAL ($0 API cost, 100% offline).
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  VideoEngineAdapter,
  EngineCapabilities,
  VideoEngineRenderRequest,
  VideoEngineRenderResult,
  VideoEnginePreviewResult,
  VideoEngineValidationResult,
} from './video-engine-adapter.js';
import { TemplateRegistry } from '../templates/template-manifest.js';
import { HeadlessFrameCapture } from '../hyperframes/headless-frame-capture.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';

export class HtmlMotionEngineAdapter implements VideoEngineAdapter {
  public readonly id = 'html-motion';
  public readonly name = 'Local HTML Motion Graphics Engine';

  public readonly capabilities: EngineCapabilities = {
    id: this.id,
    name: this.name,
    costClass: 'FREE_LOCAL',
    bestFor: ['TITLE', 'OUTRO', 'DATA_CHART', 'INFOGRAPHIC', 'GENERAL'],
    outputFormats: ['mp4'],
    maxResolution: '1080p',
    supportsAudio: false,
    renderTarget: 'headless-browser',
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  };

  private readonly registry: TemplateRegistry;

  constructor(registry: TemplateRegistry = TemplateRegistry.getInstance()) {
    this.registry = registry;
  }

  public validate(request: VideoEngineRenderRequest): VideoEngineValidationResult {
    const errors: string[] = [];
    if (!request.prompt && !request.templateId) {
      errors.push('Either a prompt or templateId must be specified.');
    }
    if (request.aspectRatio && !this.capabilities.supportedAspectRatios.includes(request.aspectRatio)) {
      errors.push(`Unsupported aspect ratio "${request.aspectRatio}". Allowed: ${this.capabilities.supportedAspectRatios.join(', ')}`);
    }
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public async preview(request: VideoEngineRenderRequest): Promise<VideoEnginePreviewResult> {
    const html = this._compileHtml(request);
    const duration = request.durationSeconds ?? 4;
    return {
      engineId: this.id,
      html,
      durationSeconds: duration,
      aspectRatio: request.aspectRatio ?? '16:9',
      variables: request.variables ?? {},
    };
  }

  public async render(request: VideoEngineRenderRequest): Promise<VideoEngineRenderResult> {
    const validation = this.validate(request);
    if (!validation.valid) {
      throw new Error(`Validation failed for ${this.id}: ${validation.errors.join('; ')}`);
    }

    const projectId = request.projectId ?? 'default';
    const clipId = request.clipId ?? `clip_${Date.now()}`;
    const outputDir = request.outputPath
      ? path.dirname(request.outputPath)
      : path.resolve('.studio', 'clips', projectId, clipId);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = request.outputPath ?? path.join(outputDir, `${clipId}.mp4`);
    const duration = request.durationSeconds ?? 4;
    const fps = request.fps ?? 24;

    const { width, height } = this._resolveDimensions(request.aspectRatio ?? '16:9', request.resolution ?? '720p');
    const html = this._compileHtml(request, { width, height, durationSeconds: duration, fps });

    // Step 1: Capture frames deterministically via headless browser
    const framesDir = path.join(outputDir, `.frames_${clipId}`);
    if (fs.existsSync(framesDir)) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(framesDir, { recursive: true });

    try {
      await HeadlessFrameCapture.captureFrames({
        htmlContent: html,
        outputDir: framesDir,
        durationSeconds: duration,
        fps,
        width,
        height,
      });

      // Step 2: Encode PNG sequence to MP4 with FFmpeg
      const ffmpegPath = MediaToolchainDoctor.getFfmpegPath();
      const inputPattern = path.join(framesDir, 'frame_%04d.png');

      const ffmpegArgs = [
        '-y',
        '-framerate',
        fps.toString(),
        '-i',
        inputPattern,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath,
      ];

      execFileSync(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
    } finally {
      if (fs.existsSync(framesDir)) {
        try {
          fs.rmSync(framesDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }

    // Step 3: Physically verify output
    const verification = ArtifactVerifier.verify(outputPath, {
      requireVideoStream: true,
      requireValidMedia: true,
    });

    const fileBuffer = fs.readFileSync(outputPath);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    return {
      engineId: this.id,
      physicalPath: outputPath,
      sha256,
      sizeBytes: fileBuffer.length,
      durationSeconds: verification.durationSeconds ?? duration,
      width: verification.width ?? width,
      height: verification.height ?? height,
      fps: verification.fps ?? fps,
      costClass: 'FREE_LOCAL',
      estimatedCostUsd: 0,
      previewHtml: html,
      renderedAt: new Date().toISOString(),
    };
  }

  private _compileHtml(
    req: VideoEngineRenderRequest,
    opts?: { width: number; height: number; durationSeconds: number; fps: number }
  ): string {
    // If request provided raw HTML variable, use it directly
    if (req.variables?.rawHtml && typeof req.variables.rawHtml === 'string') {
      return req.variables.rawHtml;
    }

    // Lookup template
    let template = req.templateId ? this.registry.get(req.templateId) : undefined;
    if (!template) {
      const category = req.category ?? 'TITLE';
      template = this.registry.findBestTemplate(category, req.prompt);
    }
    if (!template) {
      // Fallback to title template
      template = this.registry.get('title-minimal') ?? this.registry.list()[0];
    }

    const mergedVars = {
      title: req.prompt,
      headline: req.prompt,
      chartTitle: req.prompt,
      value: '100%',
      label: req.prompt,
      ...req.variables,
    };

    return template.compileHtml(mergedVars, opts);
  }

  private _resolveDimensions(aspect: string, res: string): { width: number; height: number } {
    const is1080 = res.toLowerCase() === '1080p';
    if (aspect === '9:16') {
      return is1080 ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
    }
    if (aspect === '1:1') {
      return is1080 ? { width: 1080, height: 1080 } : { width: 720, height: 720 };
    }
    return is1080 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  }
}
