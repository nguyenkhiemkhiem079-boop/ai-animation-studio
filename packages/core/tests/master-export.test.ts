import { describe, it, expect } from 'vitest';
import {
  Html5PlayerPackager,
  NLEInterchangeExporter,
  VideoRenderer,
  MasterExportPipelineStep,
  TimelineSequence,
  PipelineContext,
  InMemoryAssetRegistry,
  defaultLogger,
} from '../src/index.js';

describe('Phase 13 — Master Render, HTML5 Player & NLE Interchange', () => {
  const dummySequence: TimelineSequence = {
    sequenceId: 'seq_master_export_test',
    projectId: 'proj_export_test',
    name: 'Final Master Sequence',
    tracks: [
      {
        trackId: 'track_v1',
        trackType: 'video',
        name: 'Video Track 1',
        order: 0,
        clips: [
          {
            clipId: 'clip_v1_01',
            trackId: 'track_v1',
            name: 'Establishing Shot',
            startTime: 0,
            duration: 3.5,
            sourceAssetId: 'ASSET_VIDEO_01',
            inPoint: 0,
            outPoint: 3.5,
            speedMultiplier: 1,
            volume: 1,
            opacity: 1,
          },
          {
            clipId: 'clip_v1_02',
            trackId: 'track_v1',
            name: 'Dialogue Shot',
            startTime: 3.5,
            duration: 4.0,
            sourceAssetId: 'ASSET_VIDEO_02',
            inPoint: 0,
            outPoint: 4.0,
            speedMultiplier: 1,
            volume: 1,
            opacity: 1,
          },
        ],
        isMuted: false,
        isLocked: false,
        volume: 1,
        pan: 0,
      },
      {
        trackId: 'track_a1',
        trackType: 'audio_dialogue',
        name: 'Dialogue (A1)',
        order: 1,
        clips: [
          {
            clipId: 'clip_a1_01',
            trackId: 'track_a1',
            name: 'Kaito: "Hold your fire."',
            startTime: 3.8,
            duration: 2.0,
            sourceAssetId: 'ASSET_AUDIO_DIAL_01',
            inPoint: 0,
            outPoint: 2.0,
            speedMultiplier: 1,
            volume: 1,
            opacity: 1,
          },
        ],
        isMuted: false,
        isLocked: false,
        volume: 1,
        pan: 0,
      },
    ],
    transitions: [
      {
        transitionId: 'trans_01',
        fromClipId: 'clip_v1_01',
        toClipId: 'clip_v1_02',
        type: 'cross_dissolve',
        duration: 0.5,
        easing: 'ease_in_out',
      },
    ],
    subtitles: [
      {
        id: 'sub_01',
        startTime: 3.8,
        endTime: 5.8,
        speaker: 'kaito',
        text: 'Hold your fire.',
      },
    ],
    totalDuration: 7.5,
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('Html5PlayerPackager', () => {
    it('generates standalone, valid HTML5 player bundle with custom controls', () => {
      const html = Html5PlayerPackager.package({ sequence: dummySequence });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Final Master Sequence — AI Animation Studio Master Player');
      expect(html).toContain('class="studio-player-container"');
      expect(html).toContain('id="btnPlay"');
      expect(html).toContain('id="scrubber"');
      expect(html).toContain('id="subtitleOverlay"');
      expect(html).toContain('Dialogue (A1)');
      expect(html).toContain('1920x1080 @ 24fps');
    });
  });

  describe('NLEInterchangeExporter', () => {
    it('exports standard OpenTimelineIO (.otio) JSON with tracks and clips', () => {
      const otio = NLEInterchangeExporter.exportOtio(dummySequence);
      const parsed = JSON.parse(otio);

      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.name).toBe('Final Master Sequence');
      expect(parsed.tracks.children).toHaveLength(2); // Video and Audio tracks
      expect(parsed.tracks.children[0].kind).toBe('Video');
      expect(parsed.tracks.children[0].children).toHaveLength(2);
      expect(parsed.tracks.children[0].children[0].source_range.duration.value).toBe(84); // 3.5s * 24fps = 84 frames
    });

    it('exports standard CMX 3600 Edit Decision List (.edl)', () => {
      const edl = NLEInterchangeExporter.exportEdl(dummySequence);

      expect(edl).toContain('TITLE: FINAL_MASTER_SEQUENCE');
      expect(edl).toContain('FCM: NON-DROP FRAME');
      expect(edl).toContain('001  AX      V     C');
      expect(edl).toContain('* FROM CLIP NAME: Establishing Shot');
      expect(edl).toContain('002  AX      V     D'); // Dissolve transition
      expect(edl).toContain('* FROM CLIP NAME: Dialogue Shot');
    });
  });

  describe('VideoRenderer', () => {
    it('compiles video render manifests for MP4 and WebM exports', () => {
      const mp4Manifest = VideoRenderer.compileRenderManifest({
        sequence: dummySequence,
        format: 'mp4_manifest',
      });

      expect(mp4Manifest.format).toBe('mp4_manifest');
      expect(mp4Manifest.outputFiles[0].filename).toContain('.mp4');
      expect(mp4Manifest.outputFiles[0].mimeType).toBe('video/mp4');
      expect(mp4Manifest.metadata?.codec).toBe('h264_aac');
      expect(mp4Manifest.metadata?.totalFrames).toBe(180); // 7.5s * 24fps

      const webmManifest = VideoRenderer.compileRenderManifest({
        sequence: dummySequence,
        format: 'webm_manifest',
      });

      expect(webmManifest.format).toBe('webm_manifest');
      expect(webmManifest.outputFiles[0].filename).toContain('.webm');
      expect(webmManifest.outputFiles[0].mimeType).toBe('video/webm');
      expect(webmManifest.metadata?.codec).toBe('vp9_opus');
    });
  });

  describe('MasterExportPipelineStep', () => {
    it('executes in DAG pipeline and registers HTML5, OTIO, EDL, and video manifest assets', async () => {
      const assetRegistry = new InMemoryAssetRegistry();
      const step = new MasterExportPipelineStep(assetRegistry);

      const context: PipelineContext = {
        executionId: 'exec_export_01',
        state: {
          projectId: 'proj_pipeline_export',
          timelineSequence: dummySequence,
        },
        logger: defaultLogger,
      };

      const result = await step.run(context);
      expect(result.manifest).toBeDefined();

      // State updated
      expect(context.state.exportManifest).toBeDefined();
      expect(context.state.exportHtml5).toBeDefined();
      expect(context.state.exportOtio).toBeDefined();
      expect(context.state.exportEdl).toBeDefined();

      // Assets registered in AssetRegistry
      const assets = await assetRegistry.query({ seriesId: 'default_series' });
      expect(assets.some((a) => a.tags.includes('html5'))).toBe(true);
      expect(assets.some((a) => a.tags.includes('otio'))).toBe(true);
      expect(assets.some((a) => a.tags.includes('edl'))).toBe(true);
      expect(assets.some((a) => a.tags.includes('video'))).toBe(true);
    });

    it('PRODUCTION blocks missing visualQASummary', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_01',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/Required Visual QA step has not been evaluated/);
    });

    it('PRODUCTION blocks visualQASummary.overallStatus != PASSED', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_02',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          visualQASummary: {
            overallStatus: 'FAILED',
            notEvaluatedShots: 0,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/Visual QA overall status is "FAILED"/);
    });

    it('PRODUCTION blocks missingArtifacts > 0', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_03',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 0,
            missingArtifacts: 1,
            criticalDefects: 0,
            reports: [],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/1 required shot video artifact\(s\) are missing/);
    });

    it('PRODUCTION blocks notEvaluatedShots > 0', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_04',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 2,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/2 shot\(s\) were not evaluated by Visual QA/);
    });

    it('PRODUCTION blocks character shot when coverage.identityVisual == NOT_EVALUATED (LOCAL_MEDIA_METADATA cannot satisfy)', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_05',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          shotContracts: [
            {
              id: 'clip_v1_01',
              sceneId: 'sc1',
              shotNumber: 1,
              acting: [{ characterId: 'char_kaito' }],
              frame: { durationSeconds: 2 },
            },
          ],
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 0,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [
              {
                shotId: 'clip_v1_01',
                passed: true,
                status: 'PASS',
                evaluationMechanism: 'LOCAL_MEDIA_METADATA',
                coverage: {
                  artifactIntegrity: 'VERIFIED',
                  spatialFormat: 'VERIFIED',
                  identityVisual: 'NOT_EVALUATED', // NOT evaluated!
                  temporalArtifactVisual: 'VERIFIED',
                  semanticAction: 'VERIFIED',
                },
              },
            ],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/Visual semantic identity verification is required/);
    });

    it('PRODUCTION blocks required temporal visual QA when temporalArtifactVisual == NOT_EVALUATED', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_06',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          shotContracts: [
            {
              id: 'clip_v1_01',
              sceneId: 'sc1',
              shotNumber: 1,
              frame: { durationSeconds: 2 },
            },
          ],
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 0,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [
              {
                shotId: 'clip_v1_01',
                passed: true,
                status: 'PASS',
                coverage: {
                  artifactIntegrity: 'VERIFIED',
                  spatialFormat: 'VERIFIED',
                  identityVisual: 'NOT_EVALUATED',
                  temporalArtifactVisual: 'NOT_EVALUATED',
                  semanticAction: 'VERIFIED',
                },
              },
            ],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/temporal visual artifact coverage/);
    });

    it('PRODUCTION blocks acting shot when semanticAction == NOT_EVALUATED', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_07',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          shotContracts: [
            {
              id: 'clip_v1_01',
              sceneId: 'sc1',
              shotNumber: 1,
              acting: [{ characterId: 'char_kaito', actionPrompt: 'Kaito aims blaster' }],
              frame: { durationSeconds: 2 },
            },
          ],
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 0,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [
              {
                shotId: 'clip_v1_01',
                passed: true,
                status: 'PASS',
                coverage: {
                  artifactIntegrity: 'VERIFIED',
                  spatialFormat: 'VERIFIED',
                  identityVisual: 'VERIFIED',
                  temporalArtifactVisual: 'VERIFIED',
                  semanticAction: 'NOT_EVALUATED',
                },
              },
            ],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/semanticAction coverage is "NOT_EVALUATED"/);
    });

    it('PRODUCTION blocks pending critical retakes', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_08',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 0,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [
              {
                shotId: 'clip_v1_01',
                retakeRecommendations: [
                  { recommendationId: 'rec_1', shotId: 'clip_v1_01', priority: 'high', rationale: 'Defect' },
                ],
              },
            ],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/retake recommendation\(s\) are pending execution/);
    });

    it('PRODUCTION blocks unresolved critical continuity issues', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_09',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 0,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [],
          },
          continuityReport: {
            overallPassed: false,
            issues: [
              { issueId: 'iss_1', severity: 'critical', message: 'Critical 180 break' },
            ],
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/Continuity QA has 1 unresolved critical defect\(s\)/);
    });

    it('PRODUCTION blocks missing authoritative shot video artifact in shotVideoMap', async () => {
      const step = new MasterExportPipelineStep();
      const context: PipelineContext = {
        executionId: 'exec_prod_10',
        state: {
          projectId: 'proj_prod',
          executionMode: 'PRODUCTION',
          timelineSequence: dummySequence,
          visualQASummary: {
            overallStatus: 'PASSED',
            notEvaluatedShots: 0,
            missingArtifacts: 0,
            criticalDefects: 0,
            reports: [
              {
                shotId: 'clip_v1_01',
                coverage: {
                  artifactIntegrity: 'VERIFIED',
                  spatialFormat: 'VERIFIED',
                  identityVisual: 'VERIFIED',
                  temporalArtifactVisual: 'VERIFIED',
                  semanticAction: 'VERIFIED',
                },
              },
              {
                shotId: 'clip_v1_02',
                coverage: {
                  artifactIntegrity: 'VERIFIED',
                  spatialFormat: 'VERIFIED',
                  identityVisual: 'VERIFIED',
                  temporalArtifactVisual: 'VERIFIED',
                  semanticAction: 'VERIFIED',
                },
              },
            ],
          },
          shotVideoMap: {
            // Missing clip_v1_01 and clip_v1_02!
          },
        },
        logger: defaultLogger,
      };

      await expect(step.run(context)).rejects.toThrowError(/missing verified physical video artifact/);
    });
  });
});
