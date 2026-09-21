import { LayerTransform } from '../domain/hyperframes.js';

export interface ParallaxMotionResult {
  from: LayerTransform;
  to: LayerTransform;
  ease: string;
}

export class ParallaxEngine {
  public computeLayerMotion(
    movement: string,
    parallaxFactor: number,
    durationSeconds: number
  ): ParallaxMotionResult {
    const baseDistance = 100; // pixels
    const move = movement.toLowerCase();

    // Default static
    let from: LayerTransform = { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
    let to: LayerTransform = { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
    let ease = 'power1.inOut';

    if (move.includes('push_in') || move.includes('pushin')) {
      // Scale deeper layers less, closer layers more
      const scaleDelta = 0.12 * parallaxFactor;
      from = { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
      to = { x: 0, y: 0, scale: 1.0 + scaleDelta, opacity: 1.0, rotation: 0 };
      ease = 'power2.out';
    } else if (move.includes('pull_out') || move.includes('pullout')) {
      const scaleDelta = 0.12 * parallaxFactor;
      from = { x: 0, y: 0, scale: 1.0 + scaleDelta, opacity: 1.0, rotation: 0 };
      to = { x: 0, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
      ease = 'power2.inOut';
    } else if (move.includes('pan_left') || move.includes('panleft') || move.includes('truck_left') || move.includes('truckleft')) {
      // Camera moves left -> scenery shifts right with differential speed
      const xOffset = baseDistance * parallaxFactor;
      from = { x: -xOffset * 0.5, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
      to = { x: xOffset * 0.5, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
      ease = 'power1.inOut';
    } else if (move.includes('pan_right') || move.includes('panright') || move.includes('truck_right') || move.includes('truckright')) {
      // Camera moves right -> scenery shifts left with differential speed
      const xOffset = baseDistance * parallaxFactor;
      from = { x: xOffset * 0.5, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
      to = { x: -xOffset * 0.5, y: 0, scale: 1.0, opacity: 1.0, rotation: 0 };
      ease = 'power1.inOut';
    } else if (move.includes('tilt_up') || move.includes('tiltup') || move.includes('crane_up') || move.includes('craneup')) {
      // Camera tilts up -> scenery shifts down
      const yOffset = baseDistance * 0.6 * parallaxFactor;
      from = { x: 0, y: -yOffset * 0.5, scale: 1.0, opacity: 1.0, rotation: 0 };
      to = { x: 0, y: yOffset * 0.5, scale: 1.0, opacity: 1.0, rotation: 0 };
      ease = 'power1.inOut';
    } else if (move.includes('tilt_down') || move.includes('tiltdown')) {
      const yOffset = baseDistance * 0.6 * parallaxFactor;
      from = { x: 0, y: yOffset * 0.5, scale: 1.0, opacity: 1.0, rotation: 0 };
      to = { x: 0, y: -yOffset * 0.5, scale: 1.0, opacity: 1.0, rotation: 0 };
      ease = 'power1.inOut';
    } else if (move.includes('orbit')) {
      // Slight lateral arc and tilt
      const xOffset = baseDistance * 0.8 * parallaxFactor;
      from = { x: -xOffset * 0.4, y: -10 * parallaxFactor, scale: 1.0, opacity: 1.0, rotation: -1.5 * parallaxFactor };
      to = { x: xOffset * 0.4, y: 10 * parallaxFactor, scale: 1.02, opacity: 1.0, rotation: 1.5 * parallaxFactor };
      ease = 'sine.inOut';
    }

    return { from, to, ease };
  }
}
