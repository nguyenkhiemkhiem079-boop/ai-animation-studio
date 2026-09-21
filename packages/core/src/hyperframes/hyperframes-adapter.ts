import {
  IProvider,
  ProviderMetadata,
  ProviderTask,
  ProviderResult,
} from '../providers/index.js';
import { IStorageProvider } from '../storage/index.js';
import { ShotContract } from '../domain/director.js';
import { ShotEnvironmentReferencePacket } from '../world/location-reference-resolver.js';
import { HyperFramesCompositionCompiler } from './composition-compiler.js';
import { HyperFramesRenderResult } from '../domain/hyperframes.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';

export class HyperFramesAdapter implements IProvider {
  public readonly metadata: ProviderMetadata = {
    id: 'hyperframes-local',
    name: 'HyperFrames Deterministic Engine',
    version: '1.0.0',
    capabilities: ['deterministic_anim'],
    isLocal: true,
    costEstimateUsdPerInvocation: 0.0,
    averageLatencyMs: 25,
  };

  constructor(
    private compiler: HyperFramesCompositionCompiler = new HyperFramesCompositionCompiler(),
    private storage?: IStorageProvider
  ) {}

  public async healthCheck(): Promise<boolean> {
    const diag = MediaToolchainDoctor.diagnose();
    return diag.browser.available && diag.ffmpeg.available;
  }

  public async execute<TInput = unknown, TOutput = unknown>(
    task: ProviderTask<TInput>
  ): Promise<ProviderResult<TOutput>> {
    const startTime = Date.now();
    const input = task.input as any;
    const shot = input?.shot as ShotContract | undefined;

    if (!shot) {
      throw new Error('HyperFramesAdapter requires a ShotContract in task.input.shot');
    }

    const envPacket = input?.envPacket as ShotEnvironmentReferencePacket | undefined;
    const characterAssetMap = input?.characterAssetMap ?? new Map<string, string>();

    // Compile composition
    const composition = this.compiler.compile(shot, envPacket, characterAssetMap);

    // Save to storage if available
    let htmlPath: string | undefined;
    if (this.storage) {
      htmlPath = `compositions/${composition.compositionId}.html`;
      await this.storage.write(htmlPath, composition.html);
    }

    const durationMs = Date.now() - startTime;
    const outputAssetId = `ASSET_HF_${shot.id}`;

    const renderResult: HyperFramesRenderResult = {
      shotId: shot.id,
      compositionId: composition.compositionId,
      outputAssetId,
      format: 'html_bundle',
      durationMs,
      actualCostUsd: 0.0,
      htmlPath,
      renderedAt: new Date().toISOString(),
    };

    return {
      output: {
        assetId: outputAssetId,
        composition,
        renderResult,
      } as unknown as TOutput,
      actualCostUsd: 0.0,
      durationMs,
      providerId: this.metadata.id,
    };
  }
}
