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

export interface SeedanceClientPayload {
  prompt: string;
  negative_prompt?: string;
  motion_strength: number;
  seed: number;
  duration: number;
  fps: number;
  init_image?: string;
  character_bindings?: Array<{ id: string; image_path: string; weight: number }>;
}

export type SeedanceRequestExecutor = (payload: SeedanceClientPayload) => Promise<{
  videoUri: string;
  terminalFrameUri: string;
}>;

export interface SeedanceAdapterOptions {
  apiKey?: string;
  executor?: SeedanceRequestExecutor;
  costEstimateUsd?: number;
  latencyMs?: number;
}

export class SeedanceVideoAdapter implements IProvider {
  public readonly metadata: ProviderMetadata;
  private executor?: SeedanceRequestExecutor;

  constructor(options: SeedanceAdapterOptions = {}) {
    this.metadata = {
      id: 'bytedance-seedance',
      name: 'ByteDance Seedance Video Adapter',
      version: '1.5.0',
      capabilities: ['video_gen'],
      isLocal: false,
      costEstimateUsdPerInvocation: options.costEstimateUsd ?? 0.6,
      averageLatencyMs: options.latencyMs ?? 45,
    };
    this.executor = options.executor;
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const shotId = task.shotId ?? input?.shotId ?? 'SHOT_SEEDANCE_01';
    const projectId = task.projectId ?? input?.projectId ?? 'default_project';

    const promptPacket = input?.promptPacket;
    const positivePrompt = promptPacket?.positivePrompt ?? 'Dynamic animation action';
    const negativePrompt = promptPacket?.negativePrompt ?? '';

    const width = input?.resolution?.width ?? 1920;
    const height = input?.resolution?.height ?? 1080;
    const durationSeconds = input?.durationSeconds ?? 3.0;
    const fps = input?.fps ?? 24;
    const seed = input?.seed ?? 424242;
    const motionStrength = input?.motionStrength ?? 0.75;

    const characterBindings = (input?.referenceBindings ?? [])
      .filter((b: any) => b.role === 'CHARACTER_IDENTITY')
      .map((b: any) => ({
        id: b.assetId,
        image_path: `.studio/assets/${b.assetId}.png`,
        weight: b.weight,
      }));

    const seedancePayload: SeedanceClientPayload = {
      prompt: positivePrompt,
      negative_prompt: negativePrompt,
      motion_strength: motionStrength,
      seed,
      duration: durationSeconds,
      fps,
      init_image: input?.startFrameAssetId
        ? `.studio/assets/${input.startFrameAssetId}.png`
        : undefined,
      character_bindings: characterBindings,
    };

    let videoUri: string;
    let terminalFrameUri: string;

    if (this.executor) {
      const response = await this.executor(seedancePayload);
      videoUri = response.videoUri;
      terminalFrameUri = response.terminalFrameUri;
    } else {
      videoUri = `.studio/videos/${projectId}/${shotId}_seedance.mp4`;
      terminalFrameUri = `.studio/videos/${projectId}/${shotId}_seedance_terminal.png`;
    }

    const outputAssetId = `ASSET_SEEDANCE_${shotId}`;
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
        provider: 'ByteDance Seedance',
        motionStrength,
        characterCount: characterBindings.length,
      },
      generatedAt: new Date().toISOString(),
    };

    return {
      output: {
        assetId: outputAssetId,
        videoOutput,
        seedancePayload,
      } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: videoOutput.durationMs,
      providerId: this.metadata.id,
    };
  }
}
