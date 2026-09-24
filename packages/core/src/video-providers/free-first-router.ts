/**
 * FreeFirstVideoRouter
 *
 * Directs video requests through a free-first strategy:
 *   1. Deterministic / local-renderable prompts → FREE_LOCAL engine (html-motion / hyperframes)
 *   2. Cinematic / generative prompts in FREE_ONLY mode → GOOGLE_FLOW_HANDOFF ($0 API, assisted flow)
 *   3. Only in PAID_ALLOWED mode with explicit authorization does it route to paid Veo API.
 *
 * In FREE_ONLY mode:
 *   - NEVER calls paid video APIs
 *   - $0 estimated paid cost
 *   - Zero live LLM calls required for routing
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import * as crypto from 'node:crypto';
import { VideoCategory, VideoCostClass } from '../engines/video-engine-adapter.js';
import {
  VideoCostMode,
  resolveVideoCostMode,
  isPaidVideoAllowed,
} from './gemini-veo-provider.js';

export type VideoRouteDecision =
  | 'LOCAL_RENDER'
  | 'GOOGLE_FLOW_HANDOFF'
  | 'PAID_VEO_DIRECT';

export interface RouteResolution {
  /** Selected route */
  route: VideoRouteDecision;
  /** Identifier of the chosen engine */
  engineId: string;
  /** Display name of the chosen engine */
  engineName: string;
  /** Cost class of the route */
  costClass: VideoCostClass;
  /** Active cost mode */
  costMode: VideoCostMode;
  /** Whether paid API calls were blocked by policy */
  paidApiBlocked: boolean;
  /** Estimated paid cost in USD */
  estimatedPaidCostUsd: number;
  /** Number of manual operator actions required (0 for automated/local, 1 for flow handoff) */
  manualActionsRequired: number;
  /** Description of required manual action if any */
  manualActionDescription?: string;
  /** Detected or requested category */
  category: VideoCategory;
  /** Selected template ID if applicable */
  templateId?: string;
  /** Clear human-readable explanation of why this engine was chosen */
  rationale: string;
}

export interface RoutePlanRequest {
  prompt: string;
  category?: VideoCategory;
  costMode?: VideoCostMode;
  allowPaidApi?: boolean;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  preferredEngine?: string;
}

export interface FlowClipHandoffResult {
  handoffDir: string;
  promptPath: string;
  instructionsPath: string;
  manifestPath: string;
  clipId: string;
  projectId: string;
}

export class FreeFirstVideoRouter {
  /**
   * Deterministically classifies prompt intent into a VideoCategory without LLM latency or cost.
   */
  public static classifyPrompt(prompt: string): VideoCategory {
    const p = prompt.toLowerCase();

    // 1. Title / Intro / Card
    if (/\b(title|headline|intro|opening card|title card|header)\b/.test(p)) {
      return 'TITLE';
    }

    // 2. Outro / End card
    if (/\b(outro|end card|credits|closing|subscribe|cta|call to action)\b/.test(p)) {
      return 'OUTRO';
    }

    // 3. Chart / Graph
    if (/\b(chart|bar chart|line chart|graph|pie chart|growth|metrics|data viz|analytics)\b/.test(p)) {
      return 'DATA_CHART';
    }

    // 4. Infographic / Big stat
    if (/\b(infographic|statistic|stat|kpi|counter|10x|99%|percentage|callout)\b/.test(p)) {
      return 'INFOGRAPHIC';
    }

    // 5. Explainer / Process
    if (/\b(explainer|tutorial|step 1|step 2|process|how to|workflow|onboarding)\b/.test(p)) {
      return 'EXPLAINER';
    }

    // 6. UI Demo / Software
    if (/\b(ui|interface|window|browser|modal|button|screen|mockup|software|saas|dashboard)\b/.test(p)) {
      return 'UI_DEMO';
    }

    // 7. Motion Graphics / Kinetic
    if (/\b(motion graphic|kinetic|particles|abstract|polygons|shapes|logo animation|geometric)\b/.test(p)) {
      return 'MOTION_GRAPHIC';
    }

    // 8. Cinematic / Generative video
    if (
      /\b(cinematic|character|person|photorealistic|film|movie|actor|drama|slow push|camera moves|drone|lighting|realistic|street|forest|ocean)\b/.test(
        p
      )
    ) {
      return 'CINEMATIC';
    }

    // Default to TITLE if very short text, otherwise GENERAL
    if (prompt.trim().split(/\s+/).length <= 4) {
      return 'TITLE';
    }

    return 'GENERAL';
  }

  /**
   * Evaluates cost mode, prompt characteristics, and engine capabilities to determine routing.
   * Deterministic, zero network calls, zero API expense.
   */
  public static planRoute(request: RoutePlanRequest): RouteResolution {
    const costMode = resolveVideoCostMode(request.costMode);
    const paidAllowed = isPaidVideoAllowed(costMode, request.allowPaidApi);
    const category = request.category ?? this.classifyPrompt(request.prompt);

    const isLocalRenderable = [
      'TITLE',
      'OUTRO',
      'DATA_CHART',
      'INFOGRAPHIC',
      'EXPLAINER',
      'UI_DEMO',
      'MOTION_GRAPHIC',
    ].includes(category);

    // ── Case A: Deterministic / Local-renderable prompt ─────────────────────────
    if (isLocalRenderable) {
      const engineId = ['EXPLAINER', 'UI_DEMO', 'MOTION_GRAPHIC'].includes(category)
        ? 'hyperframes'
        : 'html-motion';
      const engineName =
        engineId === 'hyperframes'
          ? 'HyperFrames Deterministic Engine'
          : 'Local HTML Motion Graphics Engine';

      return {
        route: 'LOCAL_RENDER',
        engineId,
        engineName,
        costClass: 'FREE_LOCAL',
        costMode,
        paidApiBlocked: !paidAllowed,
        estimatedPaidCostUsd: 0,
        manualActionsRequired: 0,
        category,
        rationale: `Deterministic ${category} task rendered locally via ${engineName} at zero API cost.`,
      };
    }

    // ── Case B: Cinematic / Generative prompt in FREE_ONLY mode ─────────────────
    if (!paidAllowed || costMode === 'FREE_ONLY') {
      return {
        route: 'GOOGLE_FLOW_HANDOFF',
        engineId: 'google-flow',
        engineName: 'Google Flow (Assisted Free Handoff)',
        costClass: 'FREE_EXTERNAL',
        costMode,
        paidApiBlocked: true,
        estimatedPaidCostUsd: 0,
        manualActionsRequired: 1,
        manualActionDescription: 'Flow generation required (operator imports video in Flow workspace)',
        category,
        rationale:
          'Cinematic generative prompt routed to Google Flow handoff because paid video generation APIs are disabled (FREE_ONLY mode default).',
      };
    }

    // ── Case C: Cinematic prompt with explicit PAID authorization ──────────────
    return {
      route: 'PAID_VEO_DIRECT',
      engineId: 'gemini-veo-video',
      engineName: 'Google Gemini Veo Video Provider',
      costClass: 'PAID_EXTERNAL',
      costMode: 'PAID_ALLOWED',
      paidApiBlocked: false,
      estimatedPaidCostUsd: 0.35,
      manualActionsRequired: 0,
      category,
      rationale:
        'Cinematic generative prompt routed to direct Veo API with explicit paid authorization.',
    };
  }

  /**
   * Generates a clean, operator-ready Google Flow handoff package for a clip.
   * Zero browser automation or scraping — strictly prepares operator materials.
   */
  public static async createFlowClipHandoff(
    prompt: string,
    options: {
      projectId?: string;
      clipId?: string;
      aspectRatio?: string;
      durationSeconds?: number;
      resolution?: string;
      outputBaseDir?: string;
    } = {}
  ): Promise<FlowClipHandoffResult> {
    const projectId = options.projectId ?? 'default';
    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 8);
    const clipId = options.clipId ?? `clip_${Date.now()}_${promptHash}`;
    const handoffDir = options.outputBaseDir ??
      path.resolve('.studio', 'clips', projectId, clipId, 'flow_handoff');

    await fs.mkdir(handoffDir, { recursive: true });

    const promptPath = path.join(handoffDir, 'prompt.txt');
    const instructionsPath = path.join(handoffDir, 'INSTRUCTIONS.md');
    const manifestPath = path.join(handoffDir, 'flow_handoff.json');

    const aspect = options.aspectRatio ?? '16:9';
    const duration = options.durationSeconds ?? 4;
    const res = options.resolution ?? '720p';

    const promptContent = `${prompt}\n\n[Settings: Aspect=${aspect}, Duration=${duration}s, Resolution=${res}]`;
    await fs.writeFile(promptPath, promptContent, 'utf8');

    const instructionsContent = `# Google Flow Operator Handoff Package

**Clip ID**: \`${clipId}\`
**Project**: \`${projectId}\`
**Generated**: ${new Date().toISOString()}

---

## 🎯 Operator Steps

1. **Open Google Flow Workspace**:
   Navigate to the Google Flow interface in your web browser.

2. **Copy Generation Prompt**:
   Use the compiled prompt from [prompt.txt](./prompt.txt):
   \`\`\`
   ${prompt}
   \`\`\`

3. **Configure Settings**:
   - Aspect Ratio: **${aspect}**
   - Duration: **${duration}s**
   - Quality/Resolution: **${res}**

4. **Generate & Download**:
   Run generation in Flow and download the resulting MP4.

5. **Place Output Media**:
   Save the exported MP4 to:
   \`${path.resolve('.studio', 'clips', projectId, clipId, `${clipId}.mp4`)}\`

   Or import directly via Studio CLI:
   \`studio flow import "${path.resolve('.studio', 'clips', projectId, clipId, `${clipId}.mp4`)}" --clip ${clipId}\`
`;
    await fs.writeFile(instructionsPath, instructionsContent, 'utf8');

    const manifestData = {
      clipId,
      projectId,
      prompt,
      aspectRatio: aspect,
      durationSeconds: duration,
      resolution: res,
      route: 'GOOGLE_FLOW_HANDOFF',
      costMode: 'FREE_ONLY',
      estimatedPaidCostUsd: 0,
      createdAt: new Date().toISOString(),
      promptSha256: crypto.createHash('sha256').update(promptContent).digest('hex'),
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');

    return {
      handoffDir,
      promptPath,
      instructionsPath,
      manifestPath,
      clipId,
      projectId,
    };
  }
}
