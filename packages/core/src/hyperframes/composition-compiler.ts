import { ShotContract } from '../domain/director.js';
import { ShotEnvironmentReferencePacket } from '../world/location-reference-resolver.js';
import { HyperFramesComposition, HyperFramesLayer } from '../domain/hyperframes.js';
import { HyperFramesLayerSystem } from './layer-system.js';
import { CinematicSkillCompiler } from './cinematic-skill-compiler.js';

export interface CompilerOptions {
  width?: number;
  height?: number;
  fps?: number;
}

export class HyperFramesCompositionCompiler {
  constructor(
    private layerSystem: HyperFramesLayerSystem = new HyperFramesLayerSystem(),
    private skillCompiler: CinematicSkillCompiler = new CinematicSkillCompiler()
  ) {}

  public compile(
    shot: ShotContract,
    envPacket?: ShotEnvironmentReferencePacket,
    characterAssetMap: Map<string, string> = new Map(),
    options: CompilerOptions = {}
  ): HyperFramesComposition {
    const compositionId = `hf_${shot.id.toLowerCase()}`;
    const width = options.width ?? 1920;
    const height = options.height ?? 1080;
    const fps = options.fps ?? shot.frame.targetFps ?? 24;
    const durationSeconds = shot.frame.durationSeconds;

    // 1. Build Layer Set
    const layers = this.layerSystem.buildLayersForShot(shot, envPacket, characterAssetMap);

    // 2. Gather Semantic Skills
    const semanticSkills = [...(shot.camera.semanticSkills ?? [])];
    if (shot.camera.movement && !semanticSkills.includes(shot.camera.movement)) {
      semanticSkills.push(shot.camera.movement);
    }

    // 3. Compile GSAP Timeline Script
    const gsapTimelineCode = this.skillCompiler.compileSkillsToGsap(
      semanticSkills,
      shot.camera.movement,
      layers,
      durationSeconds
    );

    // 4. Generate HTML Layer DOM
    const layerDomStrings = layers.map((layer, idx) => {
      const trackIndex = idx + 1;
      let innerContent = '';
      if (layer.type === 'image') {
        innerContent = `<img src="${layer.src ?? ''}" alt="${layer.name}" style="width:100%;height:100%;object-fit:cover;" />`;
      } else if (layer.type === 'text') {
        innerContent = `<div class="dialogue-box">${layer.textContent ?? ''}</div>`;
      } else if (layer.type === 'shape') {
        innerContent = `<div style="width:100%;height:100%;background:radial-gradient(ellipse at center, #1b263b 0%, #0d1b2a 100%);"></div>`;
      }

      return `      <!-- Layer: ${layer.name} -->
      <div id="${layer.id}" class="clip ${layer.cssClass ?? ''}" data-track-index="${trackIndex}" style="position:absolute;inset:0;z-index:${layer.zIndex};pointer-events:none;">
        ${innerContent}
      </div>`;
    });

    // 5. Generate Full HyperFrames HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HyperFrames: ${shot.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #${compositionId} {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #050505;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #camera_rig {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .dialogue-box {
      position: absolute;
      bottom: 8%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 15, 25, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f1f5f9;
      font-family: 'Outfit', -apple-system, sans-serif;
      font-size: 28px;
      padding: 12px 32px;
      border-radius: 6px;
      backdrop-filter: blur(8px);
      letter-spacing: 0.5px;
      text-align: center;
      max-width: 80%;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
</head>
<body>
  <div id="${compositionId}" data-composition-id="${compositionId}" data-width="${width}" data-height="${height}" data-duration="${durationSeconds}">
    <div id="camera_rig">
${layerDomStrings.join('\n')}
    </div>
  </div>

  <script>
    (function() {
      // Build seekable HyperFrames timeline
      const tl = gsap.timeline({ paused: true });

${gsapTimelineCode}

      // Register timeline for HyperFrames deterministic seek and render
      window.__timelines = window.__timelines || {};
      window.__timelines["${compositionId}"] = tl;
    })();
  </script>
</body>
</html>`;

    return {
      compositionId,
      shotId: shot.id,
      width,
      height,
      fps,
      durationSeconds,
      layers,
      html,
      semanticSkills,
      compiledAt: new Date().toISOString(),
    };
  }
}
