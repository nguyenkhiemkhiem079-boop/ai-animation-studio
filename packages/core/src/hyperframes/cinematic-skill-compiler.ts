import { ParallaxEngine } from './parallax-engine.js';
import { HyperFramesLayer } from '../domain/hyperframes.js';

export class CinematicSkillCompiler {
  constructor(private parallaxEngine: ParallaxEngine = new ParallaxEngine()) {}

  public compileSkillsToGsap(
    skills: string[],
    cameraMovement: string,
    layers: HyperFramesLayer[],
    durationSeconds: number
  ): string {
    const lines: string[] = [];

    // 1. Compile multi-plane layer parallax animations
    for (const layer of layers) {
      if (layer.parallaxFactor > 0) {
        const motion = this.parallaxEngine.computeLayerMotion(
          cameraMovement,
          layer.parallaxFactor,
          durationSeconds
        );

        lines.push(
          `  tl.fromTo("#${layer.id}", ` +
            `{ x: ${motion.from.x}, y: ${motion.from.y}, scale: ${motion.from.scale}, rotation: ${motion.from.rotation} }, ` +
            `{ x: ${motion.to.x}, y: ${motion.to.y}, scale: ${motion.to.scale}, rotation: ${motion.to.rotation}, duration: ${durationSeconds}, ease: "${motion.ease}" }, 0);`
        );
      }
    }

    // 2. Compile semantic skills
    for (const rawSkill of skills) {
      const skill = rawSkill.toLowerCase().replace(/[-_]/g, '');

      if (skill === 'handheld') {
        // Deterministic organic micro-jitter (using fixed sinusoidal keyframes instead of Math.random)
        lines.push(
          `  // Semantic Skill: Handheld Organic Drift`,
          `  tl.to("#camera_rig", { x: 4, y: -3, rotation: 0.2, duration: ${durationSeconds * 0.25}, ease: "sine.inOut" }, 0);`,
          `  tl.to("#camera_rig", { x: -3, y: 4, rotation: -0.2, duration: ${durationSeconds * 0.25}, ease: "sine.inOut" }, ${durationSeconds * 0.25});`,
          `  tl.to("#camera_rig", { x: 2, y: -2, rotation: 0.1, duration: ${durationSeconds * 0.25}, ease: "sine.inOut" }, ${durationSeconds * 0.5});`,
          `  tl.to("#camera_rig", { x: 0, y: 0, rotation: 0.0, duration: ${durationSeconds * 0.25}, ease: "sine.inOut" }, ${durationSeconds * 0.75});`
        );
      } else if (skill === 'vintagefilm') {
        lines.push(
          `  // Semantic Skill: Vintage Film (contrast & subtle flicker)`,
          `  tl.to(".layer-backdrop, .layer-character", { filter: "sepia(0.35) contrast(1.15) brightness(0.95)", duration: ${durationSeconds}, ease: "none" }, 0);`
        );
      } else if (skill === 'motionblur') {
        lines.push(
          `  // Semantic Skill: Motion Blur`,
          `  tl.fromTo(".layer-character", { filter: "blur(0px)" }, { filter: "blur(2px)", duration: ${durationSeconds * 0.4}, ease: "power2.in" }, 0);`,
          `  tl.to(".layer-character", { filter: "blur(0px)", duration: ${durationSeconds * 0.6}, ease: "power2.out" }, ${durationSeconds * 0.4});`
        );
      } else if (skill === 'slowmo') {
        lines.push(
          `  // Semantic Skill: Slow Motion (expanded duration easing)`,
          `  tl.timeScale(0.5);`
        );
      } else if (skill === 'speedramp') {
        lines.push(
          `  // Semantic Skill: Speed Ramp`,
          `  tl.to(tl, { timeScale: 2.0, duration: ${durationSeconds * 0.3}, ease: "power2.in" }, 0);`,
          `  tl.to(tl, { timeScale: 0.5, duration: ${durationSeconds * 0.7}, ease: "power2.out" }, ${durationSeconds * 0.3});`
        );
      }
    }

    return lines.join('\n');
  }
}
