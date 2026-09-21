import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { TimelineSequence } from '../domain/timeline.js';
import { ExportManifest } from '../domain/export.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { Html5PlayerPackager } from './html5-player-packager.js';
import { NLEInterchangeExporter } from './nle-interchange-exporter.js';
import { VideoRenderer } from './video-renderer.js';

export interface MasterExportStepSummary {
  manifestId: string;
  totalDurationSeconds: number;
  outputFilesCount: number;
  formatsExported: string[];
  [key: string]: unknown;
}

export class MasterExportPipelineStep implements PipelineStep {
  public readonly id = 'master_export_step';
  public readonly name = 'Master Export & Packaging';
  public readonly description =
    'Compiles final production deliverables: standalone HTML5 player, video render manifest, and NLE interchange files (OTIO + EDL).';
  public readonly saveCheckpointAfter = true;

  constructor(private assetRegistry?: IAssetRegistry) {}

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;
    const projectId = (state.projectId as string) || 'default_project';

    logger.info('Starting Master Export & Packaging step...', { projectId });

    const sequence = state.timelineSequence as TimelineSequence | undefined;
    if (!sequence) {
      throw new Error(
        `Cannot run MasterExportPipelineStep: No TimelineSequence found in pipeline state for project "${projectId}".`
      );
    }

    // 1. Generate HTML5 Interactive Player Bundle
    const html5Content = Html5PlayerPackager.package({ sequence });

    // 2. Generate NLE Interchange Files (OTIO & EDL)
    const otioContent = NLEInterchangeExporter.exportOtio(sequence);
    const edlContent = NLEInterchangeExporter.exportEdl(sequence);

    // 3. Compile Video Render Manifest
    const videoManifest = VideoRenderer.compileRenderManifest({ sequence, format: 'mp4_manifest' });

    // 4. Register Assets in AssetRegistry if available
    if (this.assetRegistry) {
      const seriesId = (state.seriesId as string) || 'default_series';

      // HTML5 Player Bundle Asset
      await this.assetRegistry.register({
        id: `ASSET_EXPORT_HTML5_${sequence.sequenceId}`,
        seriesId,
        type: 'export_manifest',
        status: 'approved_canon',
        name: `HTML5 Player Bundle [${projectId}]`,
        contentHash: `hash_html5_${sequence.sequenceId}`,
        storageUri: `.studio/exports/${sequence.sequenceId}_player.html`,
        mimeType: 'text/html',
        sizeBytes: html5Content.length,
        version: 1,
        tags: ['export', 'html5', 'player', projectId],
        metadata: {
          totalDuration: sequence.totalDuration,
          resolution: sequence.resolution,
        },
      });

      // OTIO Asset
      await this.assetRegistry.register({
        id: `ASSET_EXPORT_OTIO_${sequence.sequenceId}`,
        seriesId,
        type: 'export_manifest',
        status: 'approved_canon',
        name: `OpenTimelineIO Interchange [${projectId}]`,
        contentHash: `hash_otio_${sequence.sequenceId}`,
        storageUri: `.studio/exports/${sequence.sequenceId}.otio`,
        mimeType: 'application/json',
        sizeBytes: otioContent.length,
        version: 1,
        tags: ['export', 'nle', 'otio', projectId],
        metadata: { format: 'otio' },
      });

      // EDL Asset
      await this.assetRegistry.register({
        id: `ASSET_EXPORT_EDL_${sequence.sequenceId}`,
        seriesId,
        type: 'export_manifest',
        status: 'approved_canon',
        name: `CMX 3600 EDL [${projectId}]`,
        contentHash: `hash_edl_${sequence.sequenceId}`,
        storageUri: `.studio/exports/${sequence.sequenceId}.edl`,
        mimeType: 'text/plain',
        sizeBytes: edlContent.length,
        version: 1,
        tags: ['export', 'nle', 'edl', projectId],
        metadata: { format: 'edl' },
      });

      // Master Video Render Manifest Asset
      await this.assetRegistry.register({
        id: `ASSET_EXPORT_VIDEO_${sequence.sequenceId}`,
        seriesId,
        type: 'export_manifest',
        status: 'approved_canon',
        name: `Master Video Render Manifest [${projectId}]`,
        contentHash: `hash_video_manifest_${sequence.sequenceId}`,
        storageUri: `.studio/exports/${sequence.sequenceId}_manifest.json`,
        mimeType: 'application/json',
        sizeBytes: JSON.stringify(videoManifest).length,
        version: 1,
        tags: ['export', 'video', 'master', projectId],
        metadata: {
          manifestId: videoManifest.manifestId,
          format: videoManifest.format,
          duration: videoManifest.totalDurationSeconds,
        },
      });
    }

    // 5. Update pipeline state
    state.exportManifest = videoManifest;
    state.exportHtml5 = html5Content;
    state.exportOtio = otioContent;
    state.exportEdl = edlContent;

    const summary: MasterExportStepSummary = {
      manifestId: videoManifest.manifestId,
      totalDurationSeconds: sequence.totalDuration,
      outputFilesCount: 4, // HTML5, OTIO, EDL, MP4 manifest
      formatsExported: ['html5_bundle', 'otio', 'edl', 'mp4_manifest'],
    };

    logger.info('Master Export & Packaging step completed successfully.', summary);

    return {
      manifest: videoManifest,
      summary,
    };
  }
}
