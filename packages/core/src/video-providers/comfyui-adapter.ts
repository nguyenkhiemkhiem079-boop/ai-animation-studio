import {
  IProvider,
  ProviderMetadata,
  ProviderTask,
  ProviderResult,
} from '../providers/index.js';
import {
  VideoGenerationTask,
  VideoGenerationOutput,
} from '../domain/generative-video.js';

export interface ComfyUIWorkflowGraph {
  [nodeId: string]: {
    class_type: string;
    inputs: Record<string, unknown>;
  };
}

export type ComfyUIDispatcher = (workflow: ComfyUIWorkflowGraph) => Promise<{
  promptId: string;
  videoUri: string;
  terminalFrameUri: string;
}>;

export interface ComfyUIAdapterOptions {
  serverUrl?: string;
  workflowTemplate?: ComfyUIWorkflowGraph;
  dispatcher?: ComfyUIDispatcher;
  costEstimateUsd?: number;
  latencyMs?: number;
}

export class ComfyUIVideoAdapter implements IProvider {
  public readonly metadata: ProviderMetadata;
  public readonly serverUrl: string;
  private workflowTemplate?: ComfyUIWorkflowGraph;
  private dispatcher?: ComfyUIDispatcher;

  constructor(options: ComfyUIAdapterOptions = {}) {
    this.serverUrl = options.serverUrl ?? 'http://127.0.0.1:8188';
    this.metadata = {
      id: 'comfyui-local',
      name: 'ComfyUI Local Video Engine',
      version: '1.0.0',
      capabilities: ['video_gen', 'image_gen'],
      isLocal: true,
      costEstimateUsdPerInvocation: options.costEstimateUsd ?? 0.05,
      averageLatencyMs: options.latencyMs ?? 50,
    };
    this.workflowTemplate = options.workflowTemplate;
    this.dispatcher = options.dispatcher;
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public createDefaultWorkflow(
    positivePrompt: string,
    negativePrompt: string,
    seed: number,
    startFrameUri?: string
  ): ComfyUIWorkflowGraph {
    return {
      '1': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: 25,
          cfg: 7.5,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: startFrameUri ? 0.65 : 1.0,
        },
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: positivePrompt,
        },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: negativePrompt,
        },
      },
      '4': {
        class_type: 'AnimateDiffLoaderWithContext',
        inputs: {
          model_name: 'mm_sd_v15_v2.ckpt',
          beta_schedule: 'sqrt_linear',
        },
      },
      '5': {
        class_type: 'VHS_VideoCombine',
        inputs: {
          frame_rate: 24,
          format: 'video/h264-mp4',
        },
      },
    };
  }

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const shotId = task.shotId ?? input?.shotId ?? 'SHOT_COMFY_01';
    const projectId = task.projectId ?? input?.projectId ?? 'default_project';

    const promptPacket = input?.promptPacket;
    const positivePrompt = promptPacket?.positivePrompt ?? 'Dynamic animation action';
    const negativePrompt = promptPacket?.negativePrompt ?? '';

    const width = input?.resolution?.width ?? 1920;
    const height = input?.resolution?.height ?? 1080;
    const durationSeconds = input?.durationSeconds ?? 3.0;
    const fps = input?.fps ?? 24;
    const seed = input?.seed ?? 1234567;
    const startFrameUri = input?.startFrameAssetId
      ? `.studio/assets/${input.startFrameAssetId}.png`
      : undefined;

    const workflow =
      this.workflowTemplate ??
      this.createDefaultWorkflow(positivePrompt, negativePrompt, seed, startFrameUri);

    let videoUri: string;
    let terminalFrameUri: string;
    let promptId = `prompt_${shotId}_${Date.now()}`;

    if (this.dispatcher) {
      const response = await this.dispatcher(workflow);
      promptId = response.promptId;
      videoUri = response.videoUri;
      terminalFrameUri = response.terminalFrameUri;
    } else {
      videoUri = `.studio/videos/${projectId}/${shotId}_comfyui.mp4`;
      terminalFrameUri = `.studio/videos/${projectId}/${shotId}_comfyui_terminal.png`;
    }

    const outputAssetId = `ASSET_COMFY_${shotId}`;
    const terminalFrameAssetId = `FRAME_TERMINAL_${shotId}`;

    const videoOutput: VideoGenerationOutput = {
      assetId: outputAssetId,
      shotId,
      providerId: this.metadata.id,
      videoUri,
      terminalFrameAssetId,
      terminalFrameUri,
      resolution: { width, height },
      durationSeconds,
      fps,
      seed,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime + this.metadata.averageLatencyMs,
      metadata: {
        provider: 'ComfyUI Local',
        serverUrl: this.serverUrl,
        promptId,
        nodeCount: Object.keys(workflow).length,
      },
      generatedAt: new Date().toISOString(),
    };

    return {
      output: {
        assetId: outputAssetId,
        videoOutput,
        workflow,
      } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: videoOutput.durationMs,
      providerId: this.metadata.id,
    };
  }
}
