import {
  SceneMap,
  SceneMapSchema,
  SpatialAnchor,
  SpatialAnchorSchema,
} from '../domain/world.js';
import { CameraIntent } from '../domain/director.js';
import { ValidationError } from '../errors/index.js';

export interface SpatialContinuityCheckResult {
  isConsistent: boolean;
  warnings: string[];
  visibleAnchors: SpatialAnchor[];
}

export class SpatialMemory {
  private maps = new Map<string, SceneMap>(); // key: `${seriesId}:${locationId}:${zoneId}`

  private makeKey(seriesId: string, locationId: string, zoneId: string): string {
    return `${seriesId}:${locationId}:${zoneId}`;
  }

  public getOrCreateSceneMap(
    seriesId: string,
    locationId: string,
    zoneId: string,
    name?: string
  ): SceneMap {
    const key = this.makeKey(seriesId, locationId, zoneId);
    let map = this.maps.get(key);
    if (!map) {
      map = SceneMapSchema.parse({
        locationId,
        zoneId,
        name: name ?? `${locationId} ${zoneId}`,
        anchors: [],
        dimensions: { widthMeters: 6.0, lengthMeters: 8.0, heightMeters: 3.0 },
        defaultCameraPositions: {
          master_wide: { x: 0, y: 1.5, z: -3.5, angle: 'eye_level' },
          reverse_angle: { x: 0, y: 1.5, z: 3.5, angle: 'reverse' },
        },
        updatedAt: new Date().toISOString(),
      });
      this.maps.set(key, map);
    }
    return map;
  }

  public addAnchor(
    seriesId: string,
    locationId: string,
    zoneId: string,
    anchor: SpatialAnchor
  ): SpatialAnchor {
    const map = this.getOrCreateSceneMap(seriesId, locationId, zoneId);
    const validated = SpatialAnchorSchema.parse(anchor);

    const existingIndex = map.anchors.findIndex((a) => a.id === validated.id);
    if (existingIndex >= 0) {
      map.anchors[existingIndex] = validated;
    } else {
      map.anchors.push(validated);
    }
    map.updatedAt = new Date().toISOString();
    return validated;
  }

  public getAnchor(
    seriesId: string,
    locationId: string,
    zoneId: string,
    anchorId: string
  ): SpatialAnchor | undefined {
    const map = this.getOrCreateSceneMap(seriesId, locationId, zoneId);
    return map.anchors.find((a) => a.id === anchorId);
  }

  public listAnchors(seriesId: string, locationId: string, zoneId: string): SpatialAnchor[] {
    const map = this.getOrCreateSceneMap(seriesId, locationId, zoneId);
    return [...map.anchors];
  }

  public verifySpatialContinuity(
    sceneMap: SceneMap,
    currentCamera: CameraIntent,
    previousCamera?: CameraIntent
  ): SpatialContinuityCheckResult {
    const warnings: string[] = [];

    // 1. Calculate visible anchors based on current camera angle
    // In normalized set coordinates:
    // angle 'front' / 'eye_level' looks toward +z (north)
    // angle 'reverse' / 'back' looks toward -z (south)
    // angle 'profile_left' looks toward +x (east)
    // angle 'profile_right' looks toward -x (west)
    const visibleAnchors: SpatialAnchor[] = [];

    for (const anchor of sceneMap.anchors) {
      const isVisible = this.isAnchorInFov(anchor, currentCamera.angle);
      if (isVisible) {
        visibleAnchors.push(anchor);
      }
    }

    // 2. Reverse angle check against previous camera
    if (previousCamera) {
      const curAngle = currentCamera.angle as string;
      const prevAngle = previousCamera.angle as string;
      const isReverseCut =
        (curAngle === 'back' && prevAngle === 'front') ||
        (curAngle === 'front' && prevAngle === 'back') ||
        (curAngle === 'birds_eye' && prevAngle === 'worms_eye');

      if (isReverseCut) {
        // If reverse cut, the same landmark cannot be directly in front of both cameras
        const prevVisible = sceneMap.anchors.filter((a) => this.isAnchorInFov(a, previousCamera.angle));
        const sharedForeground = visibleAnchors.filter((a) =>
          prevVisible.some((p) => p.id === a.id && Math.abs(a.position.z) > 1.0)
        );

        if (sharedForeground.length > 0) {
          warnings.push(
            `Spatial contradiction: Landmark(s) [${sharedForeground.map((a) => a.name).join(', ')}] visible in both opposite camera angles across a reverse cut.`
          );
        }
      }
    }

    return {
      isConsistent: warnings.length === 0,
      warnings,
      visibleAnchors,
    };
  }

  private isAnchorInFov(anchor: SpatialAnchor, cameraAngle: string): boolean {
    switch (cameraAngle) {
      case 'front':
      case 'eye_level':
        return anchor.position.z >= 0;
      case 'back':
      case 'reverse':
      case 'over_the_shoulder':
        return anchor.position.z <= 0;
      case 'profile_left':
      case 'three_quarter_left':
        return anchor.position.x >= 0;
      case 'profile_right':
      case 'three_quarter_right':
        return anchor.position.x <= 0;
      default:
        return true; // Wide / establishing encompasses full room
    }
  }
}
