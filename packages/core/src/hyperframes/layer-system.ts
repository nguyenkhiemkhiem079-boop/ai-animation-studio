import { ShotContract } from '../domain/director.js';
import { ShotEnvironmentReferencePacket } from '../world/location-reference-resolver.js';
import { HyperFramesLayer } from '../domain/hyperframes.js';

export class HyperFramesLayerSystem {
  public buildLayersForShot(
    shot: ShotContract,
    envPacket?: ShotEnvironmentReferencePacket,
    characterAssetMap: Map<string, string> = new Map()
  ): HyperFramesLayer[] {
    const layers: HyperFramesLayer[] = [];
    let currentZ = 1;

    // 1. Background / Establishing Backdrop
    if (envPacket?.establishingBackdrop) {
      layers.push({
        id: `layer_${shot.id}_backdrop`,
        type: 'image',
        name: 'Establishing Backdrop',
        src: envPacket.establishingBackdrop.storageUri,
        zIndex: currentZ++,
        parallaxFactor: 0.2, // Deep background moves slowest
        initialTransform: { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 },
        timing: { startSeconds: 0, durationSeconds: shot.frame.durationSeconds },
        cssClass: 'layer-backdrop',
      });
    } else {
      // Fallback ambient color/gradient background
      layers.push({
        id: `layer_${shot.id}_bg_ambient`,
        type: 'shape',
        name: 'Ambient Background',
        zIndex: currentZ++,
        parallaxFactor: 0.1,
        initialTransform: { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 },
        timing: { startSeconds: 0, durationSeconds: shot.frame.durationSeconds },
        cssClass: 'layer-ambient-bg',
      });
    }

    // 2. Multi-plane Environment Depth Layers (from World Studio)
    if (envPacket?.layers) {
      for (const envLayer of envPacket.layers) {
        layers.push({
          id: `layer_${shot.id}_${envLayer.id}`,
          type: 'image',
          name: envLayer.name,
          src: envLayer.assetId ? `assets/environment/${envLayer.assetId}.png` : undefined,
          zIndex: currentZ++,
          parallaxFactor: envLayer.parallaxFactor,
          initialTransform: { x: 0, y: 0, scale: 1.0, opacity: envLayer.opacity ?? 1.0, rotation: 0 },
          timing: { startSeconds: 0, durationSeconds: shot.frame.durationSeconds },
          cssClass: `layer-${envLayer.type}`,
        });
      }
    }

    // 3. Characters in Midground
    for (const act of shot.acting) {
      const charSrc = characterAssetMap.get(act.characterId) ?? `assets/characters/${act.characterId}/turnaround_front.png`;
      layers.push({
        id: `layer_${shot.id}_char_${act.characterId}`,
        type: 'image',
        name: `Character: ${act.characterId}`,
        src: charSrc,
        zIndex: currentZ++,
        parallaxFactor: 1.0, // Primary subject baseline
        initialTransform: { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 },
        timing: { startSeconds: 0, durationSeconds: shot.frame.durationSeconds },
        cssClass: 'layer-character',
      });
    }

    // 4. Subtitle / Dialogue Overlay
    for (const act of shot.acting) {
      if (act.dialogueLine) {
        layers.push({
          id: `layer_${shot.id}_sub_${act.characterId}`,
          type: 'text',
          name: `Subtitle: ${act.characterId}`,
          textContent: `"${act.dialogueLine}"`,
          zIndex: 100,
          parallaxFactor: 0.0, // UI / Subtitles stay fixed on screen
          initialTransform: { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 },
          timing: { startSeconds: 0.5, durationSeconds: Math.max(2.0, shot.frame.durationSeconds - 0.5) },
          cssClass: 'layer-subtitle',
        });
      }
    }

    return layers;
  }
}
