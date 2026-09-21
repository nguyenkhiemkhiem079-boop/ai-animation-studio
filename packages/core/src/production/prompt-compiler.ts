import { ShotContract } from '../domain/director.js';
import {
  CompiledPromptPacket,
  ReferenceBinding,
  ReferenceRole,
} from '../domain/production.js';

export interface PromptCompilerOptions {
  characterDescriptions?: Map<string, string>;
  locationDescriptions?: Map<string, string>;
  negativePromptBase?: string;
}

export class PromptCompiler {
  private characterDescriptions: Map<string, string>;
  private locationDescriptions: Map<string, string>;
  private negativePromptBase: string;

  constructor(options: PromptCompilerOptions = {}) {
    this.characterDescriptions = options.characterDescriptions ?? new Map();
    this.locationDescriptions = options.locationDescriptions ?? new Map();
    this.negativePromptBase =
      options.negativePromptBase ??
      'bad anatomy, blurry, low quality, distorted face, extra limbs, mutated hands, disfigured, oversaturated, text, watermark, logo, identity bleed, mismatched clothing';
  }

  public compile(
    shot: ShotContract,
    referenceBindings: ReferenceBinding[] = []
  ): CompiledPromptPacket {
    // 1. Build Subject & Acting Directives
    const subjectDirectives: string[] = [];
    for (const act of shot.acting) {
      const charDesc = this.characterDescriptions.get(act.characterId) ?? act.characterId;
      let actPrompt = `Character: ${charDesc}`;
      if (act.pose) actPrompt += `, pose: ${act.pose}`;
      if (act.expression) actPrompt += `, expression: ${act.expression}`;
      if (act.gazeDirection) actPrompt += `, gaze: ${act.gazeDirection.replace('_', ' ')}`;
      if (act.actionPrompt) actPrompt += `, action: ${act.actionPrompt}`;
      subjectDirectives.push(actPrompt);
    }
    const actingDirective = subjectDirectives.join('; ');

    // 2. Build Camera Directive
    let cameraDirective = `Camera: ${shot.camera.shotSize.replace('_', ' ')} shot at ${shot.camera.angle.replace('_', ' ')}`;
    if (shot.camera.focalLength) cameraDirective += `, focal length ${shot.camera.focalLength}`;
    if (shot.camera.movement && shot.camera.movement !== 'static') {
      cameraDirective += `, camera motion ${shot.camera.movement.replace('_', ' ')}`;
    }

    // 3. Build Lighting & Environment Directive
    const locDesc = shot.environmentLocationId
      ? this.locationDescriptions.get(shot.environmentLocationId) ?? shot.environmentLocationId
      : '';
    let lightingDirective = `Lighting: ${shot.lighting.keyLightDirection} key light, ${shot.lighting.colorTemperature} temperature, mood: ${shot.lighting.mood}`;
    if (shot.lighting.fogAtmosphere) {
      lightingDirective += ', atmospheric fog / haze present';
    }
    if (locDesc) {
      lightingDirective += `, setting: ${locDesc}`;
      if (shot.environmentZoneId) {
        lightingDirective += ` (${shot.environmentZoneId})`;
      }
    }

    // 4. Synthesize Full Positive Prompt
    const promptParts: string[] = [];
    if (locDesc) promptParts.push(locDesc);
    if (actingDirective) promptParts.push(actingDirective);
    promptParts.push(cameraDirective);
    promptParts.push(lightingDirective);

    // Composition details
    if (shot.composition?.rule) {
      promptParts.push(`composition: ${shot.composition.rule.replace(/_/g, ' ')}, subject at ${shot.composition.subjectPlacement.replace(/_/g, ' ')}`);
    }

    const positivePrompt = promptParts.join('. ') + '.';

    // 5. Synthesize Negative Prompt with Anti-Bleed Rules
    const negativeDirectives = [this.negativePromptBase];
    for (const binding of referenceBindings) {
      if (binding.antiBleedRules.length > 0) {
        negativeDirectives.push(...binding.antiBleedRules);
      }
    }
    const negativePrompt = Array.from(new Set(negativeDirectives)).join(', ');

    return {
      positivePrompt,
      negativePrompt,
      referenceBindings,
      cameraDirective,
      lightingDirective,
      actingDirective,
      compiledAt: new Date().toISOString(),
    };
  }

  public registerCharacterDescription(characterId: string, description: string): void {
    this.characterDescriptions.set(characterId, description);
  }

  public registerLocationDescription(locationId: string, description: string): void {
    this.locationDescriptions.set(locationId, description);
  }
}
