/**
 * Template Manifest & Registry
 *
 * Agent-readable template manifest inspired by nexu-io/html-video (Apache-2.0).
 *
 * Copyright (c) 2026 AI Animation Studio contributors.
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import { VideoCategory, VideoCostClass } from '../engines/video-engine-adapter.js';

export interface DurationRange {
  min: number;
  max: number;
  default: number;
}

export interface TemplateInputField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  default?: unknown;
  required?: boolean;
}

export interface VideoTemplateManifest {
  /** Unique template identifier (e.g. 'title-minimal-fade') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Owning engine id (e.g. 'html-motion', 'hyperframes') */
  engine: string;
  /** Primary category */
  category: VideoCategory;
  /** Search and indexing tags */
  tags: string[];
  /** Description of what this template is best suited for */
  bestFor: string[];
  /** Supported aspect ratios (e.g. ['16:9', '9:16', '1:1']) */
  aspectRatios: string[];
  /** Allowed duration range in seconds */
  durationRange: DurationRange;
  /** Declarative input schema for variables */
  inputSchema: Record<string, TemplateInputField>;
  /** Cost class */
  costClass: VideoCostClass;
  /** License for template code/design */
  license: string;
  /** Detailed description for LLM/agent comprehension */
  description: string;
  /** Generator function returning self-contained animated HTML */
  compileHtml: (variables: Record<string, any>, options?: { width: number; height: number; durationSeconds: number; fps: number }) => string;
}

export class TemplateRegistry {
  private static instance: TemplateRegistry;
  private readonly templates = new Map<string, VideoTemplateManifest>();

  public static getInstance(): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry();
    }
    return TemplateRegistry.instance;
  }

  public register(template: VideoTemplateManifest): void {
    this.templates.set(template.id, template);
  }

  public get(id: string): VideoTemplateManifest | undefined {
    return this.templates.get(id);
  }

  public has(id: string): boolean {
    return this.templates.has(id);
  }

  public list(): VideoTemplateManifest[] {
    return Array.from(this.templates.values());
  }

  public listByCategory(category: VideoCategory): VideoTemplateManifest[] {
    return this.list().filter((t) => t.category === category);
  }

  public listByEngine(engine: string): VideoTemplateManifest[] {
    return this.list().filter((t) => t.engine === engine);
  }

  /**
   * Deterministically finds the best matching template for a given category and optional keywords.
   */
  public findBestTemplate(category: VideoCategory, query?: string): VideoTemplateManifest | undefined {
    const candidates = this.listByCategory(category);
    if (candidates.length === 0) return undefined;
    if (!query) return candidates[0];

    const q = query.toLowerCase();
    let bestScore = -1;
    let bestTemplate = candidates[0];

    for (const t of candidates) {
      let score = 0;
      if (t.tags.some((tag) => q.includes(tag.toLowerCase()))) score += 3;
      if (t.bestFor.some((b) => q.includes(b.toLowerCase()))) score += 2;
      if (q.includes(t.name.toLowerCase())) score += 4;
      if (score > bestScore) {
        bestScore = score;
        bestTemplate = t;
      }
    }

    return bestTemplate;
  }
}
