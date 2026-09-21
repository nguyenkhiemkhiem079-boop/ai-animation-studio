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

export interface MockVideoProviderOptions {
  id?: string;
  name?: string;
  costUsd?: number;
  latencyMs?: number;
  shouldFail?: boolean;
  failAttempts?: number;
}

export class MockVideoProvider implements IProvider {
  public readonly metadata: ProviderMetadata;
  private shouldFail: boolean;
  private failAttempts: number;
  private currentAttempts = 0;

  constructor(options: MockVideoProviderOptions = {}) {
    this.metadata = {
      id: options.id ?? 'mock-video-provider',
      name: options.name ?? 'Mock Generative Video Provider',
      version: '1.0.0',
      capabilities: ['video_gen', 'image_gen'],
      isLocal: true,
      costEstimateUsdPerInvocation: options.costUsd ?? 0.5,
      averageLatencyMs: options.latencyMs ?? 30,
    };
    this.shouldFail = options.shouldFail ?? false;
    this.failAttempts = options.failAttempts ?? 0;
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public setFailureMode(shouldFail: boolean, failAttempts = 1): void {
    this.shouldFail = shouldFail;
    this.failAttempts = failAttempts;
    this.currentAttempts = 0;
  }

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();

    if (this.shouldFail) {
      this.currentAttempts++;
      if (this.currentAttempts <= this.failAttempts) {
        throw new Error(
          `[${this.metadata.id}] Mock provider simulated failure (attempt ${this.currentAttempts}/${this.failAttempts})`
        );
      }
    }

    const input = task.input as any;
    const shotId = task.shotId ?? input?.shotId ?? 'SHOT_MOCK_01';
    const projectId = task.projectId ?? input?.projectId ?? 'default_project';

    // Extract seed or calculate deterministic hash
    const seed = input?.seed ?? this.hashString(shotId + (input?.promptPacket?.positivePrompt ?? ''));
    const durationSeconds = input?.durationSeconds ?? 3.5;
    const fps = input?.fps ?? 24;
    const resolution = input?.resolution ?? { width: 1920, height: 1080 };

    const outputAssetId = `ASSET_GEN_VIDEO_${shotId}`;
    const terminalFrameAssetId = `FRAME_TERMINAL_${shotId}`;

    const videoOutput: VideoGenerationOutput = {
      assetId: outputAssetId,
      shotId,
      providerId: this.metadata.id,
      videoUri: `.studio/videos/${projectId}/${shotId}_gen.mp4`,
      terminalFrameAssetId,
      terminalFrameUri: `.studio/videos/${projectId}/${shotId}_terminal.png`,
      resolution,
      durationSeconds,
      fps,
      seed,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: Date.now() - startTime + this.metadata.averageLatencyMs,
      metadata: {
        taskType: task.taskType,
        hasStartFrame: Boolean(input?.startFrameAssetId),
        referenceCount: (input?.referenceBindings ?? []).length,
        retakeLineage: input?.retakeLineage,
      },
      generatedAt: new Date().toISOString(),
    };

    return {
      output: {
        assetId: outputAssetId,
        videoOutput,
      } as unknown as TOutput,
      actualCostUsd: this.metadata.costEstimateUsdPerInvocation,
      durationMs: videoOutput.durationMs,
      providerId: this.metadata.id,
    };
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
