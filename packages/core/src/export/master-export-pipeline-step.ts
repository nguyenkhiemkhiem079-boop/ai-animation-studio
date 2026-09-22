import * as fs from 'node:fs';
import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { TimelineSequence } from '../domain/timeline.js';
import { ShotContract } from '../domain/director.js';
import { ExportManifest } from '../domain/export.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { ProductionSafetyError } from '../domain/execution-mode.js';
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

    const executionMode = (state.executionMode as string) || 'MOCK';

    // Step 18: Quality Gate inspection in PRODUCTION mode
    if (executionMode === 'PRODUCTION') {
      const visualQASummary = state.visualQASummary as any;
      const continuityReport = state.continuityReport as any;

      // 1. Check if required visual QA step evaluated
      if (!visualQASummary) {
        throw new ProductionSafetyError(
          `Master export blocked in PRODUCTION mode: Required Visual QA step has not been evaluated.`
        );
      }

      // 2. Check visualQASummary.overallStatus === 'PASSED'
      if (visualQASummary.overallStatus !== 'PASSED') {
        throw new ProductionSafetyError(
          `Master export blocked in PRODUCTION mode: Visual QA overall status is "${visualQASummary.overallStatus}". Expected "PASSED".`
        );
      }

      // 3. Check for not evaluated shots
      if (visualQASummary.notEvaluatedShots > 0) {
        throw new ProductionSafetyError(
          `Master export blocked in PRODUCTION mode: ${visualQASummary.notEvaluatedShots} shot(s) were not evaluated by Visual QA.`
        );
      }

      // 4. Check for missing required video artifacts
      if (visualQASummary.missingArtifacts > 0) {
        throw new ProductionSafetyError(
          `Master export blocked in PRODUCTION mode: ${visualQASummary.missingArtifacts} required shot video artifact(s) are missing.`
        );
      }

      // 5. Check for unresolved critical visual defects
      if (visualQASummary.criticalDefects > 0) {
        throw new ProductionSafetyError(
          `Master export blocked in PRODUCTION mode: ${visualQASummary.criticalDefects} unresolved critical visual defect(s) detected.`
        );
      }

      // 6. Check for pending retakes
      const pendingRetakes = visualQASummary.reports?.flatMap((r: any) => r.retakeRecommendations ?? []) ?? [];
      if (pendingRetakes.length > 0) {
        throw new ProductionSafetyError(
          `Master export blocked in PRODUCTION mode: ${pendingRetakes.length} retake recommendation(s) are pending execution.`
        );
      }

      // 7. Verify required coverage dimensions on every shot report
      const shotContracts = (state.shotContracts as ShotContract[]) || [];
      const productionScenes = state.productionScenes as any[] | undefined;
      const allShots: ShotContract[] = [...shotContracts];
      if (productionScenes) {
        for (const sc of productionScenes) {
          if (sc.shots) {
            for (const s of sc.shots) {
              if (!allShots.some((existing) => existing.id === s.id)) {
                allShots.push(s);
              }
            }
          }
        }
      }

      const reports = visualQASummary.reports ?? [];
      for (const report of reports) {
        const shot = allShots.find((s) => s.id === report.shotId);
        const hasCharacters = Boolean(
          (shot?.acting && shot.acting.length > 0) ||
          (report.missingIdentityAnchors && report.missingIdentityAnchors.length > 0) ||
          typeof report.identityConsistencyScore === 'number'
        );

        if (hasCharacters) {
          if (report.coverage?.identityVisual !== 'VERIFIED') {
            throw new ProductionSafetyError(
              `Master export blocked in PRODUCTION mode: Shot "${report.shotId}" contains character(s) but identityVisual coverage is "${report.coverage?.identityVisual ?? 'NOT_EVALUATED'}". Visual semantic identity verification is required.`
            );
          }
        }

        // Visible rendered motion / temporal artifact QA
        if (report.coverage?.temporalArtifactVisual !== 'VERIFIED') {
          throw new ProductionSafetyError(
            `Master export blocked in PRODUCTION mode: Shot "${report.shotId}" requires temporal visual artifact coverage, but temporalArtifactVisual is "${report.coverage?.temporalArtifactVisual ?? 'NOT_EVALUATED'}".`
          );
        }

        // Acting / action requirements
        const hasAction = Boolean(shot?.acting && shot.acting.some((a: any) => a.actionPrompt || a.pose));
        if (hasAction && report.coverage?.semanticAction !== 'VERIFIED') {
          throw new ProductionSafetyError(
            `Master export blocked in PRODUCTION mode: Shot "${report.shotId}" contains action requirements, but semanticAction coverage is "${report.coverage?.semanticAction ?? 'NOT_EVALUATED'}".`
          );
        }
      }

      // 8. Check continuity report for unresolved critical defects
      if (continuityReport) {
        const unresolvedCritical = continuityReport.issues?.filter((i: any) => i.severity === 'critical') ?? [];
        if (unresolvedCritical.length > 0 || continuityReport.overallPassed === false) {
          throw new ProductionSafetyError(
            `Master export blocked in PRODUCTION mode: Continuity QA has ${unresolvedCritical.length} unresolved critical defect(s).`
          );
        }
      }

      // 9. Verify authoritative shotVideoMap
      if (!state.shotVideoMap) {
        throw new ProductionSafetyError(
          `Master export blocked in PRODUCTION mode: Authoritative shotVideoMap is missing from pipeline state.`
        );
      }
      const shotVideoMap = state.shotVideoMap as Record<string, string>;
      const videoClips = sequence.tracks.filter((t) => t.trackType === 'video').flatMap((t) => t.clips);
      for (const clip of videoClips) {
        const shotId = clip.clipId.replace(/_clip$/, '');
        const videoPath = shotVideoMap[shotId] || shotVideoMap[clip.clipId] || shotVideoMap[clip.sourceAssetId];
        if (!videoPath || !fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
          throw new ProductionSafetyError(
            `Master export blocked in PRODUCTION mode: Authoritative shotVideoMap is missing verified physical video artifact for shot "${shotId}".`
          );
        }
      }
    }

    // 1. Generate HTML5 Interactive Player Bundle
    const html5Content = Html5PlayerPackager.package({ sequence });

    // 2. Generate NLE Interchange Files (OTIO & EDL)
    const otioContent = NLEInterchangeExporter.exportOtio(sequence);
    const edlContent = NLEInterchangeExporter.exportEdl(sequence);

    // 3. Compile or Render Master Video
    let videoManifest: ExportManifest;
    let masterVideoPath: string | undefined;

    if ((executionMode === 'LOCAL' || executionMode === 'PRODUCTION') && state.shotVideoMap) {
      logger.info('Executing real video rendering with FFmpeg in LOCAL/PRODUCTION mode...');
      const renderResult = await VideoRenderer.render({
        sequence,
        shotVideoMap: state.shotVideoMap as any,
        masterAudioPath: state.masterAudioPath as string | undefined,
      });
      videoManifest = renderResult.manifest;
      masterVideoPath = renderResult.outputPath;
      state.masterVideoPath = masterVideoPath;
    } else {
      videoManifest = VideoRenderer.compileRenderManifest({ sequence, format: 'mp4_manifest' });
    }

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
