/**
 * FlowBatchCompiler
 *
 * Compiles a set of ShotContracts, characters, and environments into
 * ONE structured, unambiguous master production instruction for the Google Flow Agent.
 */

import { ShotContract } from '../domain/director.js';
import { CharacterDNA } from '../domain/universe.js';
import { FlowReferenceAsset } from './flow-types.js';

export interface FlowBatchCompilerInput {
  projectId: string;
  seriesId?: string;
  globalStyle?: string;
  aspectRatio?: string;
  shots: ShotContract[];
  characters?: CharacterDNA[];
  environments?: any[];
  references?: FlowReferenceAsset[];
}

export interface FlowBatchCompilerResult {
  batchInstructionText: string;
  shotIds: string[];
  referencePaths: string[];
  instructionSha256: string;
}

import * as crypto from 'node:crypto';

export class FlowBatchCompiler {
  /**
   * Compiles production shots into a unified structured Flow Agent instruction.
   */
  public static compile(input: FlowBatchCompilerInput): FlowBatchCompilerResult {
    const lines: string[] = [];
    const aspect = input.aspectRatio ?? '16:9';
    const style = input.globalStyle ?? 'Cinematic 3D animation, high production value, consistent lighting, photorealistic textures.';

    lines.push(`============================================================`);
    lines.push(`MASTER PRODUCTION INSTRUCTION — GOOGLE FLOW AGENT`);
    lines.push(`============================================================`);
    lines.push(``);
    lines.push(`PROJECT: ${input.projectId}`);
    if (input.seriesId) lines.push(`SERIES : ${input.seriesId}`);
    lines.push(`ASPECT : ${aspect}`);
    lines.push(`STYLE  : ${style}`);
    lines.push(``);

    // Characters
    if (input.characters && input.characters.length > 0) {
      lines.push(`------------------------------------------------------------`);
      lines.push(`CHARACTER CONTINUITY MATRIX`);
      lines.push(`------------------------------------------------------------`);
      for (const char of input.characters) {
        lines.push(`CHARACTER: ${char.name} (ID: ${char.id})`);
        if (char.visualAnchorPrompt) lines.push(`  Visuals : ${char.visualAnchorPrompt}`);
        if (char.traits && char.traits.length > 0) lines.push(`  Traits  : ${char.traits.join(', ')}`);
        if (char.description) lines.push(`  Notes   : ${char.description}`);
        lines.push(``);
      }
    }

    // Environments
    if (input.environments && input.environments.length > 0) {
      lines.push(`------------------------------------------------------------`);
      lines.push(`LOCATION CONTINUITY MATRIX`);
      lines.push(`------------------------------------------------------------`);
      for (const env of input.environments) {
        lines.push(`LOCATION: ${env.name || env.id}`);
        if (env.architecturalStyle) lines.push(`  Architecture: ${env.architecturalStyle}`);
        if (env.lightingPalette) lines.push(`  Lighting    : ${JSON.stringify(env.lightingPalette)}`);
        lines.push(``);
      }
    }

    // Shot Contracts
    lines.push(`------------------------------------------------------------`);
    lines.push(`SHOT CONTRACTS (${input.shots.length} SHOTS)`);
    lines.push(`------------------------------------------------------------`);
    const shotIds: string[] = [];

    for (let i = 0; i < input.shots.length; i++) {
      const shot = input.shots[i];
      shotIds.push(shot.id);
      const duration = shot.frame.durationSeconds ?? 4;
      const cameraMove = shot.camera.movement ?? 'static';
      const shotSize = shot.camera.shotSize ?? 'medium';
      const prompt = (shot as any).promptPacket?.positivePrompt ?? (shot as any).prompt ?? shot.acting[0]?.actionPrompt ?? 'Cinematic shot';

      lines.push(`SHOT: ${shot.id}`);
      lines.push(`  Duration: ${duration}s`);
      lines.push(`  Framing : ${shotSize}, Camera: ${cameraMove}`);
      lines.push(`  Prompt  : ${prompt}`);
      if (shot.requiredAssetIds && shot.requiredAssetIds.length > 0) {
        lines.push(`  Assets: ${shot.requiredAssetIds.join('; ')}`);
      }
      lines.push(``);
    }

    // Output Requirements
    lines.push(`------------------------------------------------------------`);
    lines.push(`OUTPUT REQUIREMENTS:`);
    lines.push(`1. Generate EXACTLY ONE video asset per requested shot contract.`);
    lines.push(`2. Label/name each generated asset matching its Shot ID (e.g. SHOT_SCENE_01_SH01).`);
    lines.push(`3. Maintain strict character facial, costume, and lighting continuity across all shots.`);
    lines.push(`4. Do NOT invent new characters or alter specified camera motions.`);
    lines.push(`5. Generate videos in ${aspect} aspect ratio.`);
    lines.push(`============================================================`);

    const batchInstructionText = lines.join('\n');
    const instructionSha256 = crypto.createHash('sha256').update(batchInstructionText).digest('hex');

    const referencePaths: string[] = [];
    if (input.references) {
      for (const ref of input.references) {
        if (ref.localPath) referencePaths.push(ref.localPath);
      }
    }

    return {
      batchInstructionText,
      shotIds,
      referencePaths,
      instructionSha256,
    };
  }
}
