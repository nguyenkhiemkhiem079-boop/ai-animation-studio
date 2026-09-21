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

export interface VeoClientPayload {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: string;
  duration_seconds: number;
  fps: number;
  seed?: number;
  input_image_uri?: string;
  reference_images?: Array<{ uri: string; role: string; weight: number }>;
  camera_motion?: {
    type: string;
    speed: number;
    intensity: number;
  };
}

export type VeoRequestExecutor = (payload: VeoClientPayload) => Promise<{
  videoUri: string;
  terminalFrameUri: string;
  seed: number;
}>;

export interface VeoAdapterOptions {
  apiKey?: string;
  apiEndpoint?: string;
  executor?: VeoRequestExecutor;
  costEstimateUsd?: number;
  latencyMs?: number;
}

export class VeoVideoAdapter implements IProvider {
  public readonly metadata: ProviderMetadata;
  private executor?: VeoRequestExecutor;
  private apiKey?: string;
  private apiEndpoint?: string;

  constructor(options: VeoAdapterOptions = {}) {
    this.metadata = {
      id: 'google-veo',
      name: 'Google Veo Video Adapter',
      version: '2.0.0',
      capabilities: ['video_gen'],
      isLocal: false,
      costEstimateUsdPerInvocation: options.costEstimateUsd ?? 0.75,
      averageLatencyMs: options.latencyMs ?? 50,
    };
    this.executor = options.executor;
    this.apiKey = options.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.VEO_API_KEY;
    this.apiEndpoint = options.apiEndpoint;
  }

  public async healthCheck(): Promise<boolean> {
    return !!(this.executor || this.apiKey);
  }

  public async diagnoseHealth(): Promise<any> {
    const isConfigured = !!(this.executor || this.apiKey);
    return {
      providerId: this.metadata.id,
      name: this.metadata.name,
      status: isConfigured ? 'AVAILABLE' : 'NOT_CONFIGURED',
      isLocal: false,
      capabilities: this.metadata.capabilities,
      details: isConfigured ? 'Veo credentials configured' : 'Google Cloud / Veo credentials not configured',
    };
  }

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const shotId = task.shotId ?? input?.shotId ?? 'SHOT_VEO_01';
    const projectId = task.projectId ?? input?.projectId ?? 'default_project';

    const promptPacket = input?.promptPacket;
    const positivePrompt = promptPacket?.positivePrompt ?? 'Cinematic shot';
    const negativePrompt = promptPacket?.negativePrompt ?? '';

    // Calculate aspect ratio string
    const width = input?.resolution?.width ?? 1920;
    const height = input?.resolution?.height ?? 1080;
    const aspectRatio = width === height ? '1:1' : width > height ? '16:9' : '9:16';

    const durationSeconds = input?.durationSeconds ?? 3.5;
    const fps = input?.fps ?? 24;
    const seed = input?.seed ?? Math.floor(Math.random() * 1000000);

    // Build references
    const referenceImages = (input?.referenceBindings ?? []).map((b: any) => ({
      uri: `.studio/assets/${b.assetId}.png`,
      role: b.role,
      weight: b.weight,
    }));

    // Build Veo request payload
    const veoPayload: VeoClientPayload = {
      prompt: positivePrompt,
      negative_prompt: negativePrompt,
      aspect_ratio: aspectRatio,
      duration_seconds: durationSeconds,
      fps,
      seed,
      input_image_uri: input?.startFrameAssetId
        ? `.studio/assets/${input.startFrameAssetId}.png`
        : undefined,
      reference_images: referenceImages,
      camera_motion: input?.cameraTrajectory
        ? {
            type: input.cameraTrajectory.movement,
            speed: input.cameraTrajectory.speed,
            intensity: input.cameraTrajectory.intensity,
          }
        : undefined,
    };

    let videoUri: string;
    let terminalFrameUri: string;
    let finalSeed = seed;

    if (this.executor) {
      const response = await this.executor(veoPayload);
      videoUri = response.videoUri;
      terminalFrameUri = response.terminalFrameUri;
      finalSeed = response.seed;
    } else {
      // Deterministic simulation
      videoUri = `.studio/videos/${projectId}/${shotId}_veo.mp4`;
      terminalFrameUri = `.studio/videos/${projectId}/${shotId}_veo_terminal.png`;
    }

    const outputAssetId = `ASSET_VEO_${shotId}`;
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
      seed: finalSeed,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime + this.metadata.averageLatencyMs,
      metadata: {
        provider: 'Google Veo',
        hasStartFrame: Boolean(input?.startFrameAssetId),
        referenceCount: referenceImages.length,
        aspectRatio,
      },
      generatedAt: new Date().toISOString(),
    };

    return {
      output: {
        assetId: outputAssetId,
        videoOutput,
        veoPayload,
      } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: videoOutput.durationMs,
      providerId: this.metadata.id,
    };
  }
}
