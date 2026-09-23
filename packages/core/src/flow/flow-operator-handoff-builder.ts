import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import * as crypto from 'node:crypto';
import { ShotContract } from '../domain/director.js';
import { FlowReferenceAsset, FlowFrameDescriptor } from './flow-types.js';
import { FlowPromptCompiler } from './flow-prompt-compiler.js';

export interface FlowOperatorHandoffInput {
  projectId: string;
  runId: string;
  seriesId: string;
  sceneId?: string;
  shot: ShotContract;
  references?: FlowReferenceAsset[];
  startFrame?: FlowFrameDescriptor;
  continuityConstraints?: string[];
  outputBaseDir?: string;
  createdAt?: string;
}

export interface FlowOperatorHandoffResult {
  handoffDir: string;
  expectedFilename: string;
  manifestPath: string;
  promptPath: string;
  instructionsPath: string;
  manifestSha256: string;
}

export class FlowOperatorHandoffBuilder {
  private promptCompiler: FlowPromptCompiler;

  constructor(promptCompiler = new FlowPromptCompiler()) {
    this.promptCompiler = promptCompiler;
  }

  /**
   * Generates a deterministic Google Flow operator handoff package in:
   * .studio/production/<projectId>/<runId>/handoff/<shotId>/
   */
  public async buildHandoff(input: FlowOperatorHandoffInput): Promise<FlowOperatorHandoffResult> {
    const shotId = input.shot.id;
    const handoffDir = input.outputBaseDir ??
      path.resolve('.studio', 'production', input.projectId, input.runId, 'handoff', shotId);

    const charRefDir = path.join(handoffDir, 'character-reference');
    const locRefDir = path.join(handoffDir, 'location-reference');
    const startFrameDir = path.join(handoffDir, 'start-frame');

    await fs.mkdir(handoffDir, { recursive: true });
    await fs.mkdir(charRefDir, { recursive: true });
    await fs.mkdir(locRefDir, { recursive: true });
    await fs.mkdir(startFrameDir, { recursive: true });

    // 1. Compile flow prompt
    const compiled = this.promptCompiler.compile(input.shot, {
      references: input.references,
      continuityConstraints: input.continuityConstraints,
    });

    const expectedFilename = `${shotId}_FLOW_REAL.mp4`;

    // 2. Write shot-contract.json
    const shotContractPath = path.join(handoffDir, 'shot-contract.json');
    await fs.writeFile(shotContractPath, JSON.stringify(input.shot, null, 2), 'utf-8');

    // 3. Write flow-prompt.txt
    const promptPath = path.join(handoffDir, 'flow-prompt.txt');
    await fs.writeFile(promptPath, compiled.promptText, 'utf-8');

    // 4. Copy / write references
    const referencesList = input.references ?? [];
    const referencesJsonPath = path.join(handoffDir, 'references.json');
    await fs.writeFile(referencesJsonPath, JSON.stringify(referencesList, null, 2), 'utf-8');

    for (let i = 0; i < referencesList.length; i++) {
      const ref = referencesList[i];
      const isChar = ref.role.toLowerCase().includes('identity') ||
                     ref.role.toLowerCase().includes('character') ||
                     ref.role.toLowerCase().includes('outfit');
      const targetSubDir = isChar ? charRefDir : locRefDir;
      const refMetaPath = path.join(targetSubDir, `ref_${String(i + 1).padStart(2, '0')}_${ref.role.toLowerCase()}.json`);
      await fs.writeFile(refMetaPath, JSON.stringify(ref, null, 2), 'utf-8');

      if (ref.localPath && syncFs.existsSync(ref.localPath)) {
        try {
          const ext = path.extname(ref.localPath) || '.png';
          const destImg = path.join(targetSubDir, `ref_${String(i + 1).padStart(2, '0')}_${ref.role.toLowerCase()}${ext}`);
          await fs.copyFile(ref.localPath, destImg);
        } catch {
          // Ignore copy failures
        }
      }
    }

    // 5. Start frame
    if (input.startFrame?.path && syncFs.existsSync(input.startFrame.path)) {
      try {
        const ext = path.extname(input.startFrame.path) || '.png';
        await fs.copyFile(input.startFrame.path, path.join(startFrameDir, `start-frame${ext}`));
      } catch {
        await fs.writeFile(path.join(startFrameDir, 'start-frame.json'), JSON.stringify(input.startFrame, null, 2), 'utf-8');
      }
    } else {
      await fs.writeFile(
        path.join(startFrameDir, 'start-frame.json'),
        JSON.stringify({ status: 'NONE_REQUIRED', shotId }, null, 2),
        'utf-8'
      );
    }

    // 6. Write continuity-context.json
    const continuityContext = {
      shotId,
      sceneId: input.sceneId ?? input.shot.sceneId,
      aspectRatio: input.shot.frame.aspectRatio ?? '16:9',
      durationSeconds: input.shot.frame.durationSeconds ?? 4.0,
      targetFps: input.shot.frame.targetFps ?? 24,
      camera: input.shot.camera,
      lighting: input.shot.lighting,
      acting: input.shot.acting,
      continuityConstraints: input.continuityConstraints ?? [],
    };
    const continuityPath = path.join(handoffDir, 'continuity-context.json');
    await fs.writeFile(continuityPath, JSON.stringify(continuityContext, null, 2), 'utf-8');

    // 7. Write operator-instructions.md
    const instructionsPath = path.join(handoffDir, 'operator-instructions.md');
    const instructionsContent = [
      `# Google Flow Operator Handoff — Shot ${shotId}`,
      '',
      `**Project ID**: \`${input.projectId}\`  `,
      `**Run ID**: \`${input.runId}\`  `,
      `**Series ID**: \`${input.seriesId}\`  `,
      `**Shot ID**: \`${shotId}\`  `,
      `**Target Duration**: \`${input.shot.frame.durationSeconds ?? 4.0}s\`  `,
      `**Aspect Ratio**: \`${input.shot.frame.aspectRatio ?? '16:9'}\`  `,
      `**Expected Output File**: \`${expectedFilename}\`  `,
      '',
      '---',
      '',
      '## Step-by-Step Operator Instructions',
      '',
      '### 1. Open Google Flow Workspace',
      '- Open Google Flow in your web browser: [https://labs.google/flow](https://labs.google/flow)',
      '- Select or create the workspace corresponding to this project.',
      '- Choose **Video Generation** mode.',
      '',
      '### 2. Configure Generation Parameters',
      `- **Aspect Ratio**: \`${input.shot.frame.aspectRatio ?? '16:9'}\``,
      `- **Duration**: \`${input.shot.frame.durationSeconds ?? 4.0} seconds\``,
      `- **Target FPS**: \`${input.shot.frame.targetFps ?? 24} fps\``,
      '',
      '### 3. Copy & Paste the Compiled Flow Prompt',
      'Open `flow-prompt.txt` (in this directory) or copy the prompt text below into the Google Flow prompt field:',
      '',
      '```text',
      compiled.promptText,
      '```',
      '',
      '### 4. Upload Reference Assets',
      referencesList.length > 0
        ? referencesList.map((r, idx) => `- **[${r.role}]** \`${r.label}\` (found in \`character-reference/\` or \`location-reference/\`)`).join('\n')
        : '- No additional reference images required for this shot.',
      '',
      '### 5. Generate & Review Clip',
      '- Click **Generate** in Google Flow.',
      '- Verify: Character visual consistency, environment continuity, camera motion, and absence of severe temporal distortion.',
      '',
      '### 6. Download the Rendered MP4',
      `- Save the downloaded MP4 locally (recommended filename: \`${expectedFilename}\`).`,
      '',
      '### 7. Import into AI Animation Studio',
      'Run the following command to register, verify with FFprobe, and evaluate with Visual QA:',
      '',
      '```bash',
      `studio production import ${input.runId} ${shotId} <path_to_downloaded_mp4> --source google-flow --real-external`,
      '```',
      '',
      '---',
      '*Notice: Filenames alone do not establish trusted provenance. Genuine production verification requires explicit operator declaration (`--real-external`) and SHA-256 evidence binding.*',
    ].join('\n');
    await fs.writeFile(instructionsPath, instructionsContent, 'utf-8');

    // 8. Generate handoff-manifest.json
    const manifestFiles: Record<string, { path: string; sha256: string; sizeBytes: number }> = {};
    const filesToTrack = [
      'shot-contract.json',
      'flow-prompt.txt',
      'references.json',
      'continuity-context.json',
      'operator-instructions.md',
    ];

    for (const f of filesToTrack) {
      const fullP = path.join(handoffDir, f);
      const content = await fs.readFile(fullP);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      manifestFiles[f] = {
        path: f,
        sha256: hash,
        sizeBytes: content.length,
      };
    }

    const manifestWithoutSha = {
      manifestVersion: '1.0.0',
      projectId: input.projectId,
      runId: input.runId,
      shotId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      expectedOutputFilename: expectedFilename,
      files: manifestFiles,
    };
    const manifestJson = JSON.stringify(manifestWithoutSha, null, 2);
    const manifestSha256 = crypto.createHash('sha256').update(manifestJson, 'utf-8').digest('hex');
    const finalManifest = {
      ...manifestWithoutSha,
      manifestSha256,
    };

    const manifestPath = path.join(handoffDir, 'handoff-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(finalManifest, null, 2), 'utf-8');

    return {
      handoffDir,
      expectedFilename,
      manifestPath,
      promptPath,
      instructionsPath,
      manifestSha256,
    };
  }
}
