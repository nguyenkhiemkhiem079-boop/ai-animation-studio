import * as crypto from 'node:crypto';
import { ShotContract } from '../domain/director.js';
import { FlowReferenceAsset } from './flow-types.js';

export interface FlowPromptCompilerOptions {
  references?: FlowReferenceAsset[];
  continuityConstraints?: string[];
  styleGuidelines?: string;
  negativeDirectives?: string[];
}

export interface FlowCompiledPrompt {
  promptText: string;
  promptHash: string;
  promptVersion: string;
  structuredSections: {
    subject: string;
    action: string;
    environment: string;
    camera: string;
    composition: string;
    motion: string;
    lighting: string;
    style: string;
    continuity: string;
    referenceUsage: string;
    doNotChange: string;
  };
}

/**
 * Maps semantic cinematic skills to natural Flow camera and movement directions.
 */
const CINEMATIC_SKILL_MAP: Record<string, string> = {
  '/pushin': 'Smooth cinematic push-in towards the subject',
  '/pullout': 'Steady camera pull-out revealing the broader scene',
  '/orbit': 'Smooth 360-degree orbital arc around the focal point',
  '/panleft': 'Graceful camera pan to the left',
  '/panright': 'Graceful camera pan to the right',
  '/tiltup': 'Slow dramatic camera tilt upward',
  '/tiltdown': 'Controlled camera tilt downward',
  '/tracking': 'Dynamic tracking shot moving alongside the subject',
  '/follow': 'Close follow shot maintaining steady subject tracking',
  '/pov': 'First-person point-of-view perspective with natural head motion',
  '/slowmo': 'High-framerate slow motion capture emphasizing weight and texture',
  '/handheld': 'Subtle natural handheld camera sway, organic and grounded',
  '/craneup': 'Majestic vertical crane ascent surveying the staging',
  '/aerial': 'Elevated high-angle overview tracking environmental space',
  '/dollyout': 'Smooth dolly backward shot maintaining focal distance',
  '/macro': 'Extreme close-up macro focus capturing intricate surface detail',
  '/lowangle': 'Low-angle perspective creating scale and dramatic presence',
  '/highangle': 'High-angle perspective emphasizing vulnerability and spatial context',
};

export class FlowPromptCompiler {
  public static readonly VERSION = '1.0.0';

  /**
   * Compiles a provider-neutral ShotContract into a production prompt formatted for Google Flow.
   * Does NOT mutate the input ShotContract.
   */
  public compile(
    shot: ShotContract,
    options: FlowPromptCompilerOptions = {}
  ): FlowCompiledPrompt {
    // 1. Subject & Character references
    const characterRefs = (options.references || []).filter(
      (r) => r.role === 'CHARACTER_IDENTITY' || r.role === 'CHARACTER_OUTFIT'
    );
    const actingSummary = shot.acting
      .map((a) => a.actionPrompt || `${a.characterId} in ${a.pose} pose with ${a.expression} expression`)
      .join(', ');
    let subject = actingSummary || shot.purpose || 'Primary subject in the scene';
    if (characterRefs.length > 0) {
      const charDetails = characterRefs
        .map((c) => `${c.label}${c.instructions ? ` (${c.instructions})` : ''}`)
        .join(', ');
      subject += `. Anchored by character references: [${charDetails}]`;
    }

    // 2. Action & Narrative Intent
    const action = actingSummary || shot.purpose || 'Natural character motion and presence';

    // 3. Environment & Location references
    const locRefs = (options.references || []).filter((r) => r.role === 'LOCATION');
    let environment = `${shot.lighting.mood} lighting environment`;
    if (locRefs.length > 0) {
      const locNames = locRefs.map((l) => l.label).join(', ');
      environment = `Location: [${locNames}]. Consistent architectural geometry, textures, and spatial layout.`;
    } else if (shot.environmentLocationId) {
      environment = `Location: ${shot.environmentLocationId} (${shot.environmentZoneId || 'main zone'}).`;
    }

    // 4. Camera & Cinematic Skills
    const cameraParts: string[] = [];
    if (shot.camera.movement) cameraParts.push(`Camera Movement: ${shot.camera.movement}`);
    if (shot.camera.angle) cameraParts.push(`Angle: ${shot.camera.angle}`);
    if (shot.camera.shotSize) cameraParts.push(`Framing: ${shot.camera.shotSize}`);

    // Map semantic skills
    if (shot.camera.semanticSkills && shot.camera.semanticSkills.length > 0) {
      for (const skill of shot.camera.semanticSkills) {
        const lower = skill.toLowerCase();
        if (CINEMATIC_SKILL_MAP[lower]) {
          cameraParts.push(CINEMATIC_SKILL_MAP[lower]);
        } else {
          // Clean custom skill tag
          const clean = skill.startsWith('/') ? skill.slice(1) : skill;
          cameraParts.push(`Cinematic motion style: ${clean}`);
        }
      }
    }
    const camera = cameraParts.join('. ') || 'Steady eye-level cinematic framing';

    // 5. Composition
    const composition = `Rule: ${shot.composition.rule}, Placement: ${shot.composition.subjectPlacement}`;

    // 6. Motion
    let motion = 'Natural physically coherent movement adhering to camera and acting choreography';
    if (shot.camera.semanticSkills?.some((s) => s.toLowerCase() === '/slowmo' || s.toLowerCase() === 'slowmo')) {
      motion += '. High-framerate slow motion capture emphasizing weight and texture.';
    }

    // 7. Lighting
    const lighting = `Mood: ${shot.lighting.mood}, Key Light: ${shot.lighting.keyLightDirection}, Color Temp: ${shot.lighting.colorTemperature}${shot.lighting.fogAtmosphere ? ', Atmosphere: Foggy' : ''}`;

    // 8. Style
    const styleRefs = (options.references || []).filter((r) => r.role === 'STYLE');
    let style = options.styleGuidelines || 'Cinematic animated aesthetic with rich color fidelity';
    if (styleRefs.length > 0) {
      style += `. Reference styles: [${styleRefs.map((s) => s.label).join(', ')}]`;
    }

    // 9. Continuity & Constraints
    const continuityList = [...(options.continuityConstraints || [])];
    const continuity = continuityList.length > 0
      ? continuityList.join('. ')
      : 'Maintain persistent character identity, costume, spatial geometry, and lighting direction';

    // 10. Reference Usage
    const allRefs = options.references || [];
    const referenceUsage = allRefs.length > 0
      ? allRefs.map((r) => `- [${r.role}] ${r.label}: ${r.instructions || r.uri}`).join('\n')
      : 'No external reference images provided. Adhere strictly to narrative description.';

    // 11. Do Not Change / Negative Directives
    const lockDirectives: string[] = [];
    if (shot.directorLocks?.isCameraLocked) {
      lockDirectives.push('LOCKED CAMERA MOTION: Do not modify camera trajectory or angle.');
    }
    if (shot.directorLocks?.isFramingLocked) {
      lockDirectives.push('LOCKED FRAMING: Strictly maintain shot composition framing.');
    }
    if (shot.directorLocks?.isRendererLocked) {
      lockDirectives.push('LOCKED RENDERER INTENT: Render intent locked by director.');
    }
    if (shot.directorLocks?.isActingLocked) {
      lockDirectives.push('LOCKED ACTING CHOREOGRAPHY: Maintain exact acting beats.');
    }

    const negative = [
      'Do not change character facial structure, hair color, or clothing.',
      'Do not introduce unsupported characters, dialogue, or events.',
      'Do not jump camera position abruptly.',
      ...lockDirectives,
      ...(options.negativeDirectives || []),
    ].join(' ');

    // Assemble structured sections
    const sections = {
      subject,
      action,
      environment,
      camera,
      composition,
      motion,
      lighting,
      style,
      continuity,
      referenceUsage,
      doNotChange: negative,
    };

    const promptText = [
      `[SUBJECT]: ${sections.subject}`,
      `[ACTION]: ${sections.action}`,
      `[ENVIRONMENT]: ${sections.environment}`,
      `[CAMERA]: ${sections.camera}`,
      `[COMPOSITION]: ${sections.composition}`,
      `[MOTION]: ${sections.motion}`,
      `[LIGHTING]: ${sections.lighting}`,
      `[STYLE]: ${sections.style}`,
      `[CONTINUITY]: ${sections.continuity}`,
      `[REFERENCE USAGE]:\n${sections.referenceUsage}`,
      `[DO NOT CHANGE]: ${sections.doNotChange}`,
    ].join('\n\n');

    const promptHash = crypto.createHash('sha256').update(promptText, 'utf-8').digest('hex');

    return {
      promptText,
      promptHash,
      promptVersion: FlowPromptCompiler.VERSION,
      structuredSections: sections,
    };
  }
}
