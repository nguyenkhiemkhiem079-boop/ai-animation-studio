/**
 * Starter Video Templates
 *
 * Deterministic HTML/CSS animation templates for 7 core categories:
 * TITLE, OUTRO, DATA_CHART, INFOGRAPHIC, EXPLAINER, UI_DEMO, MOTION_GRAPHIC.
 *
 * Designed to render via HeadlessFrameCapture with window.__hyperframesSeek(t) support.
 */

import { VideoTemplateManifest, TemplateRegistry } from './template-manifest.js';

export const STARTER_TEMPLATES: VideoTemplateManifest[] = [
  // ─── 1. TITLE ─────────────────────────────────────────────────────────────
  {
    id: 'title-minimal',
    name: 'Minimal Clean Title',
    engine: 'html-motion',
    category: 'TITLE',
    tags: ['title', 'intro', 'typography', 'clean', 'header', 'headline'],
    bestFor: ['Video openers', 'Title cards', 'Documentary headlines', 'Chapter intros'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationRange: { min: 2, max: 10, default: 4 },
    inputSchema: {
      title: { name: 'title', type: 'string', description: 'Main title text', default: 'AI Animation Studio', required: true },
      subtitle: { name: 'subtitle', type: 'string', description: 'Subtitle or tag', default: 'Production-Grade Deterministic Engine' },
      accentColor: { name: 'accentColor', type: 'string', description: 'Accent hex color', default: '#38bdf8' },
    },
    costClass: 'FREE_LOCAL',
    license: 'Apache-2.0',
    description: 'Clean typographic title reveal with subtle glow, letter spacing expansion, and backdrop vignette.',
    compileHtml: (vars, opts) => {
      const title = vars.title ?? 'AI Animation Studio';
      const subtitle = vars.subtitle ?? 'Production-Grade Deterministic Engine';
      const accent = vars.accentColor ?? '#38bdf8';
      const duration = opts?.durationSeconds ?? 4;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 100vw; height: 100vh;
    background: #090d16;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .bg-glow {
    position: absolute; width: 600px; height: 600px;
    background: radial-gradient(circle, ${accent}22 0%, transparent 70%);
    border-radius: 50%; pointer-events: none;
  }
  .container {
    position: relative; z-index: 2; text-align: center; padding: 40px;
  }
  h1 {
    font-size: 56px; font-weight: 800; letter-spacing: -0.02em;
    margin-bottom: 16px;
    background: linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    opacity: var(--title-opacity, 0);
    transform: translateY(var(--title-y, 20px));
  }
  .line {
    width: var(--line-width, 0px); height: 3px;
    background: ${accent};
    margin: 0 auto 20px auto; border-radius: 2px;
    box-shadow: 0 0 12px ${accent};
  }
  p {
    font-size: 22px; font-weight: 400; color: #94a3b8; letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: var(--sub-opacity, 0);
    transform: translateY(var(--sub-y, 15px));
  }
</style>
</head>
<body>
<div class="bg-glow"></div>
<div class="container">
  <h1 id="title">${title}</h1>
  <div class="line" id="line"></div>
  <p id="subtitle">${subtitle}</p>
</div>
<script>
  const DURATION = ${duration};
  window.__hyperframesSeek = function(t) {
    const p = Math.max(0, Math.min(1, t / DURATION));
    // Ease out animation
    const titleP = Math.min(1, p / 0.4);
    const lineP = Math.max(0, Math.min(1, (p - 0.2) / 0.4));
    const subP = Math.max(0, Math.min(1, (p - 0.4) / 0.4));

    document.documentElement.style.setProperty('--title-opacity', titleP);
    document.documentElement.style.setProperty('--title-y', ((1 - titleP) * 25) + 'px');
    document.documentElement.style.setProperty('--line-width', (lineP * 120) + 'px');
    document.documentElement.style.setProperty('--sub-opacity', subP);
    document.documentElement.style.setProperty('--sub-y', ((1 - subP) * 15) + 'px');
  };
  window.__hyperframesSeek(0);
</script>
</body>
</html>`;
    },
  },

  // ─── 2. OUTRO ─────────────────────────────────────────────────────────────
  {
    id: 'outro-card',
    name: 'Social Outro End Card',
    engine: 'html-motion',
    category: 'OUTRO',
    tags: ['outro', 'end-card', 'credits', 'call-to-action', 'social', 'subscribe'],
    bestFor: ['Video conclusions', 'YouTube end cards', 'Social media CTA'],
    aspectRatios: ['16:9', '9:16'],
    durationRange: { min: 3, max: 15, default: 5 },
    inputSchema: {
      headline: { name: 'headline', type: 'string', description: 'Closing headline', default: 'Thanks for Watching' },
      callToAction: { name: 'callToAction', type: 'string', description: 'CTA button or text', default: 'Explore More at ai-studio.org' },
    },
    costClass: 'FREE_LOCAL',
    license: 'Apache-2.0',
    description: 'Dynamic animated outro card with pulse action and branded call-to-action box.',
    compileHtml: (vars, opts) => {
      const headline = vars.headline ?? 'Thanks for Watching';
      const cta = vars.callToAction ?? 'Explore More at ai-studio.org';
      const duration = opts?.durationSeconds ?? 5;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 100vw; height: 100vh; background: #0b0f19; color: #fff;
    font-family: sans-serif; display: flex; align-items: center; justify-content: center;
  }
  .card {
    text-align: center; padding: 60px; border-radius: 20px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1);
    transform: scale(var(--scale, 0.9)); opacity: var(--opacity, 0);
  }
  h2 { font-size: 48px; margin-bottom: 24px; font-weight: 700; }
  .btn {
    display: inline-block; padding: 16px 36px; border-radius: 30px;
    background: #6366f1; color: #fff; font-size: 20px; font-weight: 600;
  }
</style>
</head>
<body>
<div class="card">
  <h2>${headline}</h2>
  <div class="btn">${cta}</div>
</div>
<script>
  const DURATION = ${duration};
  window.__hyperframesSeek = function(t) {
    const p = Math.max(0, Math.min(1, t / DURATION));
    const cardP = Math.min(1, p / 0.5);
    document.documentElement.style.setProperty('--opacity', cardP);
    document.documentElement.style.setProperty('--scale', 0.9 + (cardP * 0.1));
  };
  window.__hyperframesSeek(0);
</script>
</body>
</html>`;
    },
  },

  // ─── 3. DATA_CHART ────────────────────────────────────────────────────────
  {
    id: 'data-chart-bar',
    name: 'Animated Data Bar Chart',
    engine: 'html-motion',
    category: 'DATA_CHART',
    tags: ['chart', 'bar-chart', 'data', 'analytics', 'statistics', 'graph'],
    bestFor: ['Metric showcases', 'Financial reports', 'Comparative stats'],
    aspectRatios: ['16:9', '9:16'],
    durationRange: { min: 3, max: 12, default: 4 },
    inputSchema: {
      chartTitle: { name: 'chartTitle', type: 'string', description: 'Title of the chart', default: 'Performance Growth' },
    },
    costClass: 'FREE_LOCAL',
    license: 'Apache-2.0',
    description: 'Animated vertical bar chart with ease-out growth and numerical labels.',
    compileHtml: (vars, opts) => {
      const title = vars.chartTitle ?? 'Performance Growth';
      const duration = opts?.durationSeconds ?? 4;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 100vw; height: 100vh; background: #0f172a; color: #f8fafc;
    font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  h2 { font-size: 40px; margin-bottom: 40px; }
  .chart {
    display: flex; gap: 40px; align-items: flex-end; height: 300px; width: 600px;
    border-bottom: 2px solid #334155; padding-bottom: 10px;
  }
  .bar-group { display: flex; flex-direction: column; align-items: center; flex: 1; height: 100%; justify-content: flex-end; }
  .bar {
    width: 60px; background: linear-gradient(180deg, #38bdf8 0%, #0284c7 100%);
    border-radius: 8px 8px 0 0; height: calc(var(--growth, 0) * var(--target-h));
  }
  .label { margin-top: 12px; color: #94a3b8; font-size: 18px; }
</style>
</head>
<body>
<h2>${title}</h2>
<div class="chart">
  <div class="bar-group"><div class="bar" style="--target-h: 120px;"></div><span class="label">Q1</span></div>
  <div class="bar-group"><div class="bar" style="--target-h: 180px;"></div><span class="label">Q2</span></div>
  <div class="bar-group"><div class="bar" style="--target-h: 220px;"></div><span class="label">Q3</span></div>
  <div class="bar-group"><div class="bar" style="--target-h: 280px;"></div><span class="label">Q4</span></div>
</div>
<script>
  const DURATION = ${duration};
  window.__hyperframesSeek = function(t) {
    const p = Math.max(0, Math.min(1, t / DURATION));
    const growth = 1 - Math.pow(1 - Math.min(1, p / 0.6), 3);
    document.documentElement.style.setProperty('--growth', growth);
  };
  window.__hyperframesSeek(0);
</script>
</body>
</html>`;
    },
  },

  // ─── 4. INFOGRAPHIC ───────────────────────────────────────────────────────
  {
    id: 'infographic-stat',
    name: 'Stat Callout Infographic',
    engine: 'html-motion',
    category: 'INFOGRAPHIC',
    tags: ['infographic', 'stat', 'metrics', 'big-number', 'kpi'],
    bestFor: ['Key metric highlight', 'Product milestone', 'Impact summary'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationRange: { min: 2, max: 8, default: 4 },
    inputSchema: {
      value: { name: 'value', type: 'string', description: 'Stat value (e.g. 10x, 99.9%)', default: '10x' },
      label: { name: 'label', type: 'string', description: 'Stat description', default: 'Faster Rendering Speed' },
    },
    costClass: 'FREE_LOCAL',
    license: 'Apache-2.0',
    description: 'High-impact stat counter infographic with counting effect and accent backdrop.',
    compileHtml: (vars, opts) => {
      const val = vars.value ?? '10x';
      const label = vars.label ?? 'Faster Rendering Speed';
      const duration = opts?.durationSeconds ?? 4;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 100vw; height: 100vh; background: #030712; color: #fff;
    font-family: sans-serif; display: flex; align-items: center; justify-content: center;
  }
  .box { text-align: center; transform: scale(var(--s, 0.8)); opacity: var(--o, 0); }
  .val {
    font-size: 120px; font-weight: 900; line-height: 1;
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .lbl { font-size: 28px; color: #9ca3af; margin-top: 16px; }
</style>
</head>
<body>
<div class="box">
  <div class="val">${val}</div>
  <div class="lbl">${label}</div>
</div>
<script>
  const DURATION = ${duration};
  window.__hyperframesSeek = function(t) {
    const p = Math.max(0, Math.min(1, t / DURATION));
    const smooth = Math.min(1, p / 0.5);
    document.documentElement.style.setProperty('--o', smooth);
    document.documentElement.style.setProperty('--s', 0.8 + (smooth * 0.2));
  };
  window.__hyperframesSeek(0);
</script>
</body>
</html>`;
    },
  },

  // ─── 5. EXPLAINER ─────────────────────────────────────────────────────────
  {
    id: 'explainer-step',
    name: 'Three-Step Process Explainer',
    engine: 'hyperframes',
    category: 'EXPLAINER',
    tags: ['explainer', 'tutorial', 'steps', 'process', 'how-to', 'workflow'],
    bestFor: ['Workflow walk-throughs', 'Onboarding', 'Documentation explainers'],
    aspectRatios: ['16:9'],
    durationRange: { min: 4, max: 15, default: 6 },
    inputSchema: {
      topic: { name: 'topic', type: 'string', description: 'Overall process title', default: 'Production Workflow' },
    },
    costClass: 'FREE_LOCAL',
    license: 'Apache-2.0',
    description: 'Sequenced 3-step timeline reveal showing progressive workflow items.',
    compileHtml: (vars, opts) => {
      const topic = vars.topic ?? 'Production Workflow';
      const duration = opts?.durationSeconds ?? 6;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 100vw; height: 100vh; background: #0f172a; color: #f8fafc;
    font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  h2 { font-size: 40px; margin-bottom: 50px; }
  .steps { display: flex; gap: 40px; }
  .step {
    width: 220px; padding: 30px 20px; background: #1e293b; border-radius: 12px; text-align: center;
    border-top: 4px solid #6366f1; transform: translateY(calc((1 - var(--step-p)) * 30px)); opacity: var(--step-p);
  }
  .num { font-size: 24px; font-weight: bold; color: #818cf8; margin-bottom: 10px; }
</style>
</head>
<body>
<h2>${topic}</h2>
<div class="steps">
  <div class="step" id="s1" style="--step-p: 0;"><div class="num">01</div><div>Story & Beats</div></div>
  <div class="step" id="s2" style="--step-p: 0;"><div class="num">02</div><div>Local Render</div></div>
  <div class="step" id="s3" style="--step-p: 0;"><div class="num">03</div><div>Master QA</div></div>
</div>
<script>
  const DURATION = ${duration};
  window.__hyperframesSeek = function(t) {
    const p = Math.max(0, Math.min(1, t / DURATION));
    const p1 = Math.max(0, Math.min(1, p / 0.3));
    const p2 = Math.max(0, Math.min(1, (p - 0.25) / 0.3));
    const p3 = Math.max(0, Math.min(1, (p - 0.5) / 0.3));
    document.getElementById('s1').style.setProperty('--step-p', p1);
    document.getElementById('s2').style.setProperty('--step-p', p2);
    document.getElementById('s3').style.setProperty('--step-p', p3);
  };
  window.__hyperframesSeek(0);
</script>
</body>
</html>`;
    },
  },

  // ─── 6. UI_DEMO ───────────────────────────────────────────────────────────
  {
    id: 'ui-demo-window',
    name: 'Browser Window UI Demo',
    engine: 'hyperframes',
    category: 'UI_DEMO',
    tags: ['ui', 'demo', 'window', 'app', 'product-demo', 'software'],
    bestFor: ['SaaS product teasers', 'Feature highlights', 'UI mockups'],
    aspectRatios: ['16:9'],
    durationRange: { min: 3, max: 12, default: 5 },
    inputSchema: {
      appName: { name: 'appName', type: 'string', description: 'Application title', default: 'AI Animation Studio' },
    },
    costClass: 'FREE_LOCAL',
    license: 'Apache-2.0',
    description: 'Realistic desktop application frame with simulated content and camera glide.',
    compileHtml: (vars, opts) => {
      const appName = vars.appName ?? 'AI Animation Studio';
      const duration = opts?.durationSeconds ?? 5;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 100vw; height: 100vh; background: #111827; color: #fff;
    font-family: sans-serif; display: flex; align-items: center; justify-content: center;
  }
  .window {
    width: 750px; height: 450px; background: #1f2937; border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); overflow: hidden;
    transform: translateY(calc((1 - var(--win-p, 0)) * 40px)); opacity: var(--win-p, 0);
  }
  .header { height: 40px; background: #374151; display: flex; align-items: center; padding: 0 16px; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .red { background: #ef4444; } .yellow { background: #f59e0b; } .green { background: #10b981; }
  .title { margin-left: 12px; font-size: 14px; color: #9ca3af; }
  .body { padding: 40px; display: flex; flex-direction: column; gap: 16px; }
  .skeleton-line { height: 16px; background: #374151; border-radius: 4px; width: 80%; }
  .skeleton-line.short { width: 50%; }
</style>
</head>
<body>
<div class="window">
  <div class="header">
    <div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div>
    <span class="title">${appName}</span>
  </div>
  <div class="body">
    <h3 style="font-size: 24px; margin-bottom: 8px;">Workspace Dashboard</h3>
    <div class="skeleton-line"></div>
    <div class="skeleton-line short"></div>
    <div class="skeleton-line"></div>
  </div>
</div>
<script>
  const DURATION = ${duration};
  window.__hyperframesSeek = function(t) {
    const p = Math.max(0, Math.min(1, t / DURATION));
    const winP = Math.min(1, p / 0.5);
    document.documentElement.style.setProperty('--win-p', winP);
  };
  window.__hyperframesSeek(0);
</script>
</body>
</html>`;
    },
  },

  // ─── 7. MOTION_GRAPHIC ────────────────────────────────────────────────────
  {
    id: 'motion-kinetic',
    name: 'Kinetic Particle Accent',
    engine: 'hyperframes',
    category: 'MOTION_GRAPHIC',
    tags: ['motion-graphic', 'kinetic', 'particles', 'shapes', 'abstract', 'geometry'],
    bestFor: ['Bumper animations', 'Visual accents', 'Background motion'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationRange: { min: 2, max: 10, default: 4 },
    inputSchema: {
      headline: { name: 'headline', type: 'string', description: 'Center text', default: 'MOTION' },
    },
    costClass: 'FREE_LOCAL',
    license: 'Apache-2.0',
    description: 'Kinetic rotating geometric polygons with pulsating central typography.',
    compileHtml: (vars, opts) => {
      const text = vars.headline ?? 'MOTION';
      const duration = opts?.durationSeconds ?? 4;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 100vw; height: 100vh; background: #050505; color: #fff;
    font-family: sans-serif; display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .ring {
    position: absolute; border: 2px dashed #4f46e5; border-radius: 50%;
    width: 350px; height: 350px; transform: rotate(var(--rot, 0deg));
  }
  .text { font-size: 64px; font-weight: 900; letter-spacing: 0.15em; z-index: 2; }
</style>
</head>
<body>
<div class="ring"></div>
<div class="text">${text}</div>
<script>
  const DURATION = ${duration};
  window.__hyperframesSeek = function(t) {
    const p = Math.max(0, Math.min(1, t / DURATION));
    document.documentElement.style.setProperty('--rot', (p * 360) + 'deg');
  };
  window.__hyperframesSeek(0);
</script>
</body>
</html>`;
    },
  },
];

// Automatically register starter templates into the singleton registry
export function initializeStarterTemplates(registry: TemplateRegistry = TemplateRegistry.getInstance()): void {
  for (const t of STARTER_TEMPLATES) {
    if (!registry.has(t.id)) {
      registry.register(t);
    }
  }
}

// Auto-initialize default registry
initializeStarterTemplates();
