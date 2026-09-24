/**
 * HyperFramesEngineAdapter
 *
 * Conforms HyperFrames deterministic animation system to the common
 * VideoEngineAdapter capability contract.
 *
 * Cost class: FREE_LOCAL ($0 API cost, 100% offline).
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import {
  VideoEngineAdapter,
  EngineCapabilities,
  VideoEngineRenderRequest,
  VideoEngineRenderResult,
  VideoEnginePreviewResult,
  VideoEngineValidationResult,
} from './video-engine-adapter.js';
import { TemplateRegistry } from '../templates/template-manifest.js';
import { HyperFramesVideoBridge } from '../hyperframes/hyperframes-video-bridge.js';
import { HyperFramesComposition } from '../domain/hyperframes.js';

export class HyperFramesEngineAdapter implements VideoEngineAdapter {
  public readonly id = 'hyperframes';
  public readonly name = 'HyperFrames Deterministic Engine';

  public readonly capabilities: EngineCapabilities = {
    id: this.id,
    name: this.name,
    costClass: 'FREE_LOCAL',
    bestFor: ['MOTION_GRAPHIC', 'EXPLAINER', 'UI_DEMO', 'TITLE'],
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

    const composition: HyperFramesComposition = {
      compositionId: `hf_${clipId}`,
      shotId: clipId,
      width,
      height,
      fps,
      durationSeconds: duration,
      layers: [],
      html,
      semanticSkills: [],
      compiledAt: new Date().toISOString(),
    };

    const bridgeResult = await HyperFramesVideoBridge.renderToMp4(composition, outputPath, {
      fps,
      width,
      height,
    });

    const fileBuffer = fs.readFileSync(outputPath);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    return {
      engineId: this.id,
      physicalPath: outputPath,
      sha256,
      sizeBytes: fileBuffer.length,
      durationSeconds: bridgeResult.durationSeconds,
      width,
      height,
      fps,
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
    if (req.variables?.rawHtml && typeof req.variables.rawHtml === 'string') {
      return req.variables.rawHtml;
    }

    let template = req.templateId ? this.registry.get(req.templateId) : undefined;
    if (!template) {
      const category = req.category ?? 'MOTION_GRAPHIC';
      template = this.registry.findBestTemplate(category, req.prompt);
    }
    if (!template) {
      template = this.registry.get('motion-kinetic') ?? this.registry.list()[0];
    }

    const mergedVars = {
      headline: req.prompt,
      topic: req.prompt,
      appName: req.prompt,
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
