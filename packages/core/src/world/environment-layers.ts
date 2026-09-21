import {
  EnvironmentLayer,
  EnvironmentLayerSchema,
  LayerType,
} from '../domain/world.js';

export interface ParallaxDisplacement {
  layerId: string;
  type: LayerType;
  offsetXPixels: number;
  offsetYPixels: number;
  scaleFactor: number;
}

export class EnvironmentLayerManager {
  private layers = new Map<string, EnvironmentLayer[]>(); // key: `${seriesId}:${locationId}:${zoneId}`

  private makeKey(seriesId: string, locationId: string, zoneId: string): string {
    return `${seriesId}:${locationId}:${zoneId}`;
  }

  public addLayer(
    seriesId: string,
    locationId: string,
    zoneId: string,
    layer: EnvironmentLayer
  ): EnvironmentLayer {
    const key = this.makeKey(seriesId, locationId, zoneId);
    const validated = EnvironmentLayerSchema.parse(layer);

    const existing = this.layers.get(key) ?? [];
    const index = existing.findIndex((l) => l.id === validated.id);
    if (index >= 0) {
      existing[index] = validated;
    } else {
      existing.push(validated);
    }

    // Sort by depthOrder ascending (0: furthest background, higher: foreground)
    existing.sort((a, b) => a.depthOrder - b.depthOrder);
    this.layers.set(key, existing);
    return validated;
  }

  public getLayers(
    seriesId: string,
    locationId: string,
    zoneId: string
  ): EnvironmentLayer[] {
    const key = this.makeKey(seriesId, locationId, zoneId);
    return [...(this.layers.get(key) ?? [])];
  }

  public getLayersByType(
    seriesId: string,
    locationId: string,
    zoneId: string,
    type: LayerType
  ): EnvironmentLayer[] {
    return this.getLayers(seriesId, locationId, zoneId).filter((l) => l.type === type);
  }

  public computeParallaxDisplacement(
    layers: EnvironmentLayer[],
    cameraMovement: string,
    progress: number // 0.0 to 1.0 through shot duration
  ): ParallaxDisplacement[] {
    const results: ParallaxDisplacement[] = [];
    const clampedProgress = Math.max(0, Math.min(1, progress));

    for (const layer of layers) {
      let offsetXPixels = 0;
      let offsetYPixels = 0;
      let scaleFactor = 1.0;

      const pFactor = layer.parallaxFactor;

      switch (cameraMovement) {
        case 'pan_left':
        case 'truck_left':
          // Camera moving left causes layers to shift right; foreground shifts faster
          offsetXPixels = clampedProgress * 150 * pFactor;
          break;
        case 'pan_right':
        case 'truck_right':
          offsetXPixels = -clampedProgress * 150 * pFactor;
          break;
        case 'tilt_up':
        case 'crane_up':
          offsetYPixels = clampedProgress * 100 * pFactor;
          break;
        case 'tilt_down':
        case 'crane_down':
          offsetYPixels = -clampedProgress * 100 * pFactor;
          break;
        case 'push_in':
        case 'dolly_in':
          // Camera moving forward scales foreground faster than background
          scaleFactor = 1.0 + clampedProgress * 0.25 * pFactor;
          break;
        case 'pull_out':
        case 'dolly_out':
          scaleFactor = Math.max(0.5, 1.0 - clampedProgress * 0.2 * pFactor);
          break;
        case 'static':
        default:
          break;
      }

      results.push({
        layerId: layer.id,
        type: layer.type,
        offsetXPixels,
        offsetYPixels,
        scaleFactor,
      });
    }

    return results;
  }
}
