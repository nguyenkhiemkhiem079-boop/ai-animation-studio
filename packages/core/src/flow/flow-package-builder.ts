import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { ShotContract } from '../domain/director.js';
import { SourceTraceability } from '../domain/story.js';
import {
  FlowProductionPackageV1,
  FlowProductionPackageV1Schema,
  FlowReferenceAsset,
  FlowFrameDescriptor,
  FlowCapability,
} from './flow-types.js';
import { FlowPromptCompiler } from './flow-prompt-compiler.js';
import { FlowWorkflowRecommender } from './flow-workflow-recommender.js';

export interface BuildPackageInput {
  projectId: string;
  seriesId: string;
  episodeId?: string;
  sceneId: string;
  shot: ShotContract;
  sourceReferences?: SourceTraceability[];
  references?: FlowReferenceAsset[];
  firstFrame?: FlowFrameDescriptor;
  lastFrame?: FlowFrameDescriptor;
  continuityConstraints?: string[];
  styleGuidelines?: string;
  explicitWorkflow?: FlowCapability;
  modelRecommendation?: string;
  outputBaseDir?: string;
}

export interface BuildPackageResult {
  pkg: FlowProductionPackageV1;
  packageDir: string;
  manifestPath: string;
  promptPath: string;
  readmePath: string;
}

export function canonicalizeJson(value: any): any {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(value).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    if (key === 'createdAt' || key === 'timestamp' || key === 'compiledAt' || key === 'outputBaseDir') {
      continue;
    }
    result[key] = canonicalizeJson(value[key]);
  }
  return result;
}

export function computePackageSemanticHash(input: {
  shot: ShotContract;
  sourceReferences?: SourceTraceability[];
  references?: FlowReferenceAsset[];
  firstFrame?: FlowFrameDescriptor;
  lastFrame?: FlowFrameDescriptor;
  continuityConstraints?: string[];
  styleGuidelines?: string;
  explicitWorkflow?: FlowCapability;
  modelRecommendation?: string;
}): string {
  const semanticPayload = {
    shot: input.shot,
    sourceReferences: input.sourceReferences || [],
    references: input.references || [],
    firstFrame: input.firstFrame,
    lastFrame: input.lastFrame,
    continuityConstraints: input.continuityConstraints || [],
    styleGuidelines: input.styleGuidelines,
    explicitWorkflow: input.explicitWorkflow,
    modelRecommendation: input.modelRecommendation || 'Google Flow / Veo 2 (Advisory)',
  };
  const canonical = canonicalizeJson(semanticPayload);
  return crypto.createHash('sha256').update(JSON.stringify(canonical), 'utf-8').digest('hex');
}

export class FlowProductionPackageBuilder {
  public static readonly VERSION = '1.0.0';
  public static computeSemanticHash = computePackageSemanticHash;

  private promptCompiler: FlowPromptCompiler;
  private workflowRecommender: FlowWorkflowRecommender;

  constructor(
    promptCompiler = new FlowPromptCompiler(),
    workflowRecommender = new FlowWorkflowRecommender()
  ) {
    this.promptCompiler = promptCompiler;
    this.workflowRecommender = workflowRecommender;
  }

  /**
   * Builds and writes a self-contained Google Flow production package to disk.
   */
  public async buildPackage(input: BuildPackageInput): Promise<BuildPackageResult> {
    const semanticHash = FlowProductionPackageBuilder.computeSemanticHash(input);
    const packageId = `flow_pkg_${input.projectId}_${input.shot.id}_${semanticHash.substring(0, 12)}`;
    const baseDir = input.outputBaseDir ?? path.resolve('.studio', 'flow', input.projectId, input.shot.id);

    // 1. Compile prompt
    const compiled = this.promptCompiler.compile(input.shot, {
      references: input.references,
      continuityConstraints: input.continuityConstraints,
      styleGuidelines: input.styleGuidelines,
    });

    // 2. Recommend workflow
    const recommendation = this.workflowRecommender.recommend({
      shot: input.shot,
      references: input.references,
      firstFrame: input.firstFrame,
      lastFrame: input.lastFrame,
      explicitWorkflow: input.explicitWorkflow,
    });

    // 3. Prepare human user instructions
    const userInstructions: string[] = [
      '1. Open Google Flow in your web browser (https://labs.google/flow).',
      '2. Create or open the workspace corresponding to this project.',
      '3. Select "Video Generation" mode.',
      `4. Select recommended workflow: "${recommendation.workflow}" (${recommendation.reason}).`,
      '5. In the Reference Assets drawer, upload the files located in the "references/" subfolder.',
      '6. Assign each uploaded image its designated role (e.g. Identity, Outfit, Location, Prop) as specified in flow-package.json.',
      input.firstFrame ? `7. Set first frame image from "frames/first-frame.*".` : '7. No initial start-frame required.',
      input.lastFrame ? `8. Set concluding last frame image from "frames/last-frame.*".` : '8. No ending keyframe required.',
      '9. Open "prompt.txt" and copy the entire prompt text into the Flow prompt box.',
      `10. Verify aspect ratio is set to "${input.shot.frame.aspectRatio || '16:9'}" and target duration is ~${input.shot.frame.durationSeconds || 4}s.`,
      '11. Click "Generate" and inspect the rendered clip.',
      '12. Download the final rendered MP4 to your local workstation.',
      `13. In AI Animation Studio, run: studio flow import "${input.shot.id}" "<path-to-downloaded-mp4>"`,
      '14. Verify that ArtifactVerifier and Continuity QA pass before approving the candidate into canon.',
    ];

    // 4. Assemble package model
    const rawPkg: FlowProductionPackageV1 = {
      packageVersion: '1.0.0',
      packageId,
      createdAt: new Date().toISOString(),
      projectId: input.projectId,
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      sceneId: input.sceneId,
      shotId: input.shot.id,
      shotContractVersion: '1.0.0',
      shotContractSnapshot: JSON.parse(JSON.stringify(input.shot)),
      sourceReferences: input.sourceReferences || [],
      narrativeIntent: input.shot.acting[0]?.actionPrompt || input.shot.purpose || 'Visual narrative continuation',
      durationTargetSeconds: input.shot.frame.durationSeconds || 4,
      aspectRatio: input.shot.frame.aspectRatio || '16:9',
      recommendedWorkflow: recommendation.workflow,
      workflowReason: recommendation.reason,
      modelRecommendation: input.modelRecommendation || 'Default Google Flow Video Model',
      references: input.references || [],
      firstFrame: input.firstFrame,
      lastFrame: input.lastFrame,
      continuityConstraints: input.continuityConstraints || [],
      flowPrompt: compiled.promptText,
      userInstructions,
      provenance: {
        compilerVersion: FlowPromptCompiler.VERSION,
        packageBuilderVersion: FlowProductionPackageBuilder.VERSION,
        timestamp: new Date().toISOString(),
        semanticHash,
      },
    };

    // Strict validation via Zod
    FlowProductionPackageV1Schema.parse(rawPkg);
    const pkg: FlowProductionPackageV1 = rawPkg;

    // 5. Write physical files to disk
    const referencesDir = path.join(baseDir, 'references');
    const framesDir = path.join(baseDir, 'frames');
    const metadataDir = path.join(baseDir, 'metadata');

    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(referencesDir, { recursive: true });
    await fs.mkdir(framesDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });

    // Manifest
    const manifestPath = path.join(baseDir, 'flow-package.json');
    await fs.writeFile(manifestPath, JSON.stringify(pkg, null, 2), 'utf-8');

    // Prompt
    const promptPath = path.join(baseDir, 'prompt.txt');
    await fs.writeFile(promptPath, pkg.flowPrompt, 'utf-8');

    // README
    const readmeContent = [
      '============================================================',
      `GOOGLE FLOW PRODUCTION PACKAGE — SHOT ${pkg.shotId}`,
      '============================================================',
      `Project ID  : ${pkg.projectId}`,
      `Series ID   : ${pkg.seriesId}`,
      `Scene ID    : ${pkg.sceneId}`,
      `Shot ID     : ${pkg.shotId}`,
      `Workflow    : ${pkg.recommendedWorkflow}`,
      `Reason      : ${pkg.workflowReason}`,
      `Duration    : ${pkg.durationTargetSeconds}s`,
      `Aspect Ratio: ${pkg.aspectRatio}`,
      '',
      'HUMAN OPERATOR INSTRUCTIONS:',
      ...pkg.userInstructions,
      '',
      'REFERENCES INCLUDED:',
      ...(pkg.references.length > 0
        ? pkg.references.map((r) => `- [${r.role}] ${r.label} (${r.uri})`)
        : ['- (None)']),
      '============================================================',
    ].join('\n');

    const readmePath = path.join(baseDir, 'README.txt');
    await fs.writeFile(readmePath, readmeContent, 'utf-8');

    // Copy or write reference descriptors
    for (let i = 0; i < pkg.references.length; i++) {
      const ref = pkg.references[i];
      const refMetaFile = path.join(referencesDir, `ref_${String(i + 1).padStart(2, '0')}_${ref.role.toLowerCase()}.json`);
      await fs.writeFile(refMetaFile, JSON.stringify(ref, null, 2), 'utf-8');

      if (ref.localPath) {
        try {
          const ext = path.extname(ref.localPath) || '.png';
          const destImg = path.join(referencesDir, `ref_${String(i + 1).padStart(2, '0')}_${ref.role.toLowerCase()}${ext}`);
          await fs.copyFile(ref.localPath, destImg);
        } catch {
          // Keep descriptor even if image copy fails
        }
      }
    }

    // Frames
    if (pkg.firstFrame?.path) {
      try {
        const ext = path.extname(pkg.firstFrame.path) || '.png';
        await fs.copyFile(pkg.firstFrame.path, path.join(framesDir, `first-frame${ext}`));
      } catch {
        await fs.writeFile(path.join(framesDir, 'first-frame-info.json'), JSON.stringify(pkg.firstFrame, null, 2), 'utf-8');
      }
    }
    if (pkg.lastFrame?.path) {
      try {
        const ext = path.extname(pkg.lastFrame.path) || '.png';
        await fs.copyFile(pkg.lastFrame.path, path.join(framesDir, `last-frame${ext}`));
      } catch {
        await fs.writeFile(path.join(framesDir, 'last-frame-info.json'), JSON.stringify(pkg.lastFrame, null, 2), 'utf-8');
      }
    }

    // Metadata
    await fs.writeFile(
      path.join(metadataDir, 'shotContractSnapshot.json'),
      JSON.stringify(pkg.shotContractSnapshot, null, 2),
      'utf-8'
    );
    await fs.writeFile(
      path.join(metadataDir, 'provenance.json'),
      JSON.stringify(pkg.provenance, null, 2),
      'utf-8'
    );

    return {
      pkg,
      packageDir: baseDir,
      manifestPath,
      promptPath,
      readmePath,
    };
  }
}
