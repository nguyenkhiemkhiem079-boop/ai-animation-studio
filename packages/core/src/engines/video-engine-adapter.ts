/**
 * Video Engine Adapter Abstraction & Capabilities
 *
 * Design adapted and selectively conceptualized from nexu-io/html-video (Apache-2.0).
 * Preserves AI Animation Studio provider-independent, deterministic tenets.
 *
 * Copyright (c) 2026 AI Animation Studio contributors.
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

export type VideoCostClass = 'FREE_LOCAL' | 'FREE_EXTERNAL' | 'PAID_EXTERNAL';

export type VideoCategory =
  | 'TITLE'
  | 'OUTRO'
  | 'DATA_CHART'
  | 'INFOGRAPHIC'
  | 'EXPLAINER'
  | 'UI_DEMO'
  | 'MOTION_GRAPHIC'
  | 'CINEMATIC'
  | 'CHARACTER_SCENE'
  | 'GENERAL';

export interface EngineCapabilities {
  /** Identifier of the engine */
  id: string;
  /** Display name of the engine */
  name: string;
  /** Cost class: FREE_LOCAL, FREE_EXTERNAL, or PAID_EXTERNAL */
  costClass: VideoCostClass;
  /** Categories this engine specializes in */
  bestFor: VideoCategory[];
  /** Supported output formats, e.g. ['mp4', 'webm'] */
  outputFormats: string[];
  /** Maximum output resolution, e.g. '1080p', '4k' */
  maxResolution: string;
  /** Whether the engine natively outputs or mixes audio */
  supportsAudio: boolean;
  /** Physical execution target */
  renderTarget: 'headless-browser' | 'local-process' | 'cloud-api' | 'manual-workspace';
  /** Supported aspect ratios, e.g. ['16:9', '9:16', '1:1'] */
  supportedAspectRatios: string[];
}

export interface VideoEngineRenderRequest {
  prompt: string;
  category?: VideoCategory;
  templateId?: string;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  fps?: number;
  outputPath?: string;
  projectId?: string;
  clipId?: string;
  variables?: Record<string, unknown>;
}

export interface VideoEngineRenderResult {
  engineId: string;
  physicalPath: string;
  sha256: string;
  sizeBytes: number;
  durationSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
  costClass: VideoCostClass;
  estimatedCostUsd: number;
  previewHtml?: string;
  renderedAt: string;
}

export interface VideoEnginePreviewResult {
  engineId: string;
  html: string;
  durationSeconds: number;
  aspectRatio: string;
  variables: Record<string, unknown>;
}

export interface VideoEngineValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Common VideoEngineAdapter interface.
 * Implemented by local deterministic engines (HTML motion, HyperFrames)
 * and external providers (Google Flow handoff, Veo adapter).
 */
export interface VideoEngineAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: EngineCapabilities;

  /** Validate incoming render request against engine capabilities */
  validate(request: VideoEngineRenderRequest): VideoEngineValidationResult;

  /** Render deterministic output MP4 */
  render(request: VideoEngineRenderRequest): Promise<VideoEngineRenderResult>;

  /** Return HTML/CSS preview representation without rendering physical video */
  preview(request: VideoEngineRenderRequest): Promise<VideoEnginePreviewResult>;
}
