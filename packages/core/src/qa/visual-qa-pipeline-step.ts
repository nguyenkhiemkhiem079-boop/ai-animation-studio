import * as fs from 'node:fs';
import * as path from 'node:path';
import { PipelineContext, PipelineStep } from '../pipeline/index.js';
import { ProductionScene, ShotContract } from '../domain/director.js';
import { CharacterDNA, LocationDNA } from '../domain/universe.js';
import { VisualSemanticQAReport } from '../domain/visual-qa.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { LLMProvider } from '../llm/llm-provider.js';
import { VisualSemanticQAEvaluator } from './visual-semantic-qa-evaluator.js';

export interface VisualQAStepSummary {
  totalShots: number;
  evaluatedShots: number;
  evaluatedShotsCount: number; // alias for backwards compatibility
  missingArtifacts: number;
  notEvaluatedShots: number;
  passedShots: number;
  passedShotsCount: number; // alias for backwards compatibility
  failedShots: number;
  failedShotsCount: number; // alias for backwards compatibility
  totalDefects: number;
  criticalDefects: number;
  averageVisualScore: number | null;
  overallStatus: 'PASSED' | 'FAILED' | 'INCOMPLETE';
  reports: VisualSemanticQAReport[];
}

function resolveAssetData(asset: any): { base64Data?: string; uri?: string; mimeType: string } {
  const mimeType = asset.mimeType || 'image/png';
  if (asset.metadata && typeof (asset.metadata as any).base64 === 'string') {
    return { base64Data: (asset.metadata as any).base64, mimeType };
  }
  if (asset.metadata && typeof (asset.metadata as any).base64Data === 'string') {
    return { base64Data: (asset.metadata as any).base64Data, mimeType };
  }
  if (asset.storageUri) {
    if (fs.existsSync(asset.storageUri)) {
      try {
        const buf = fs.readFileSync(asset.storageUri);
        return { base64Data: buf.toString('base64'), mimeType, uri: asset.storageUri };
      } catch {
        return { uri: asset.storageUri, mimeType };
      }
    }
    const resolvedPath = path.resolve(asset.storageUri);
    if (fs.existsSync(resolvedPath)) {
      try {
        const buf = fs.readFileSync(resolvedPath);
        return { base64Data: buf.toString('base64'), mimeType, uri: resolvedPath };
      } catch {
        return { uri: resolvedPath, mimeType };
      }
    }
    return { uri: asset.storageUri, mimeType };
  }
  return { mimeType };
}

export class VisualSemanticQAPipelineStep implements PipelineStep {
  public readonly id = 'visual_semantic_qa_step';
  public readonly name = 'Visual Semantic QA & Multimodal Continuity';
  public readonly description =
    'Audits rendered video keyframes for character identity drift, spatial perspective consistency, and visual defects against Canon DNA.';
  public readonly saveCheckpointAfter = true;

  private evaluator: VisualSemanticQAEvaluator;

  constructor(
    private llm?: LLMProvider,
    private assetRegistry?: IAssetRegistry
  ) {
    this.evaluator = new VisualSemanticQAEvaluator(llm);
  }

  public async run(context: PipelineContext): Promise<Record<string, unknown>> {
    const { state, logger } = context;
    const projectId = (state.projectId as string) || 'default_project';
    const executionMode = ((state.executionMode as string) || 'MOCK') as 'MOCK' | 'LOCAL' | 'PRODUCTION';

    logger.info('Starting Visual Semantic QA & Multimodal Continuity step...', { projectId, executionMode });

    // 1. Gather Shots & Characters
    const productionScenes = state.productionScenes as ProductionScene[] | undefined;
    let shots: ShotContract[] = (state.shotContracts as ShotContract[]) || [];
    if (shots.length === 0 && productionScenes && Array.isArray(productionScenes)) {
      for (const sc of productionScenes) {
        if (sc.shots && Array.isArray(sc.shots)) {
          shots.push(...sc.shots);
        }
      }
    }

    const characters = (state.resolvedCharacters as CharacterDNA[]) || [];
    const defaultLocation = (state.resolvedLocation as LocationDNA) || undefined;
    const locationMap = (state.resolvedLocations as Record<string, LocationDNA>) || {};

    // 2. Identify Video Files for each Shot from authoritative shotVideoMap
    const shotVideoMap: Record<string, string> = (state.shotVideoMap as Record<string, string>) || {};
    const reports: VisualSemanticQAReport[] = [];

    const reportsDir = path.resolve('.studio', 'qa', 'visual');
    fs.mkdirSync(reportsDir, { recursive: true });

    let missingArtifactsCount = 0;

    for (const shot of shots) {
      let videoPath: string | undefined = shotVideoMap[shot.id];

      // In PRODUCTION mode: strictly use authoritative shotVideoMap or verified registered media artifact
      // NEVER consume .studio/smoke/media or .studio/smoke/golden in production
      if (executionMode === 'PRODUCTION') {
        if (!videoPath || !fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
          videoPath = undefined;
        }
      } else {
        // LOCAL / MOCK candidate paths (strictly NO .studio/smoke/media or .studio/smoke/golden fallback)
        if (!videoPath || !fs.existsSync(videoPath)) {
          const candidatePaths = [
            path.resolve('.studio', 'media', projectId, `${shot.id}.mp4`),
            path.resolve('.studio', 'videos', projectId, `${shot.id}.mp4`),
            path.resolve('.studio', 'videos', projectId, `${shot.id}_gen.mp4`),
            path.resolve('.studio', 'renders', projectId, `${shot.id}.mp4`),
          ];
          for (const cp of candidatePaths) {
            if (fs.existsSync(cp)) {
              videoPath = cp;
              break;
            }
          }
        }
      }

      // Resolve scene and location specifically for this shot (preserving multi-scene isolation)
      const scene = productionScenes?.find((sc) => sc.id === shot.sceneId);
      const sceneId = shot.sceneId ?? scene?.id;
      const locationId = shot.environmentLocationId ?? (scene as any)?.locationId;
      const shotLocation = (locationId && locationMap[locationId])
        ? locationMap[locationId]
        : (shot.sceneId ? undefined : defaultLocation);

      // Resolve approved character and environment reference images
      const referenceImages: Array<{
        entityId: string;
        role: string;
        base64Data?: string;
        uri?: string;
        mimeType?: string;
        status?: string;
      }> = [];

      // A. Character references from characterReferencePackets
      const charPackets = state.characterReferencePackets as Record<string, any> | undefined;
      const charPacket = charPackets?.[shot.id];
      if (charPacket?.bindings && Array.isArray(charPacket.bindings)) {
        for (const binding of charPacket.bindings) {
          const charId = binding.characterId;
          const actorIntent = shot.acting?.find((a) => a.characterId === charId);

          // Roles to inspect
          const candidateRoles: Array<{ roleName: string; asset?: any }> = [];

          if (binding.roles?.CHARACTER_IDENTITY) {
            candidateRoles.push(
              { roleName: 'CHARACTER_IDENTITY', asset: binding.roles.CHARACTER_IDENTITY },
              { roleName: 'turnaround_front', asset: binding.roles.CHARACTER_IDENTITY }
            );
          }
          if (binding.roles?.CHARACTER_POSE) {
            candidateRoles.push({ roleName: 'turnaround_side', asset: binding.roles.CHARACTER_POSE });
          }
          if (binding.roles?.EXPRESSION) {
            candidateRoles.push({ roleName: 'expression_anchor', asset: binding.roles.EXPRESSION });
          }

          // Outfit reference
          const outfitId = actorIntent?.outfitId || 'default';
          if (binding.roles?.OUTFIT) {
            candidateRoles.push({
              roleName: `canonical_outfit_reference_${charId}_${outfitId}`,
              asset: binding.roles.OUTFIT,
            });
            candidateRoles.push({
              roleName: 'outfit_reference',
              asset: binding.roles.OUTFIT,
            });
          }

          for (const item of candidateRoles) {
            if (!item.asset) continue;
            let assetStatus = item.asset.status;
            if (this.assetRegistry) {
              const regAsset = await this.assetRegistry.findById(item.asset.id);
              if (regAsset) {
                assetStatus = regAsset.status;
              }
            }

            const data = resolveAssetData(item.asset);
            if (data.base64Data || data.uri) {
              referenceImages.push({
                entityId: charId,
                role: item.roleName,
                base64Data: data.base64Data,
                uri: data.uri,
                mimeType: data.mimeType,
                status: assetStatus || 'candidate',
              });
            }
          }
        }
      }

      // B. World / Environment references from environmentReferencePackets
      const envPackets = state.environmentReferencePackets as Record<string, any> | undefined;
      const envPacket = envPackets?.[shot.id];
      if (envPacket) {
        if (envPacket.establishingBackdrop) {
          let backdropStatus = envPacket.establishingBackdrop.status;
          if (this.assetRegistry) {
            const reg = await this.assetRegistry.findById(envPacket.establishingBackdrop.id);
            if (reg) backdropStatus = reg.status;
          }
          const backdropData = resolveAssetData(envPacket.establishingBackdrop);
          if (backdropData.base64Data || backdropData.uri) {
            referenceImages.push({
              entityId: envPacket.locationId ?? shot.sceneId ?? 'location',
              role: 'canonical_location_reference',
              base64Data: backdropData.base64Data,
              uri: backdropData.uri,
              mimeType: backdropData.mimeType,
              status: backdropStatus || 'candidate',
            });
          }
        }
      }

      if (videoPath && fs.existsSync(videoPath)) {
        logger.info(`Evaluating visual continuity for shot "${shot.id}"...`, { videoPath, sceneId });
        const report = await this.evaluator.evaluateShotVideo({
          projectId,
          sceneId,
          shot,
          videoPath,
          characterProfiles: characters,
          locationProfile: shotLocation,
          referenceImages,
          executionMode,
        });

        reports.push(report);

        // Persist report to disk
        const reportPath = path.join(reportsDir, `${report.reportId}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

        // Register asset in AssetRegistry
        if (this.assetRegistry) {
          const seriesId = (state.seriesId as string) || 'default_series';
          const isPassingCanon = report.passed && report.status !== 'FAIL' && report.status !== 'MISSING_ARTIFACT';
          await this.assetRegistry.register({
            id: `ASSET_VIS_QA_${report.reportId}`,
            seriesId,
            type: 'qa_report',
            status: isPassingCanon ? 'approved_canon' : 'candidate',
            name: `Visual Semantic QA Report [${shot.id}]`,
            contentHash: `hash_${report.reportId}`,
            storageUri: reportPath,
            mimeType: 'application/json',
            sizeBytes: fs.statSync(reportPath).size,
            version: 1,
            tags: ['qa', 'visual_semantic', shot.id, projectId],
            metadata: {
              shotId: shot.id,
              overallVisualContinuityScore: report.overallVisualContinuityScore,
              passed: report.passed,
              defectsCount: report.defects.length,
            },
          });
        }
      } else {
        // Step 10: Missing video is NOT skipped silently - generate explicit failure report
        missingArtifactsCount++;
        logger.error(`No rendered video found for shot "${shot.id}". Generating explicit MISSING_ARTIFACT failure report.`);
        const missingReport: VisualSemanticQAReport = {
          reportId: `vis_qa_missing_${shot.id}_${Date.now()}`,
          projectId,
          sceneId,
          shotId: shot.id,
          videoUri: videoPath || '',
          identityConsistencyScore: null,
          spatialPerspectiveScore: null,
          visualDefectScore: 0.0,
          overallVisualContinuityScore: 0.0,
          passed: false,
          status: 'MISSING_ARTIFACT',
          coverage: {
            artifactIntegrity: 'FAILED',
            spatialFormat: 'NOT_EVALUATED',
            identityVisual: 'NOT_EVALUATED',
            temporalArtifactVisual: 'NOT_EVALUATED',
            semanticAction: 'NOT_EVALUATED',
          },
          defects: [
            {
              defectId: `def_missing_${Date.now()}`,
              frameIndex: 0,
              timestampSeconds: 0,
              region: 'global',
              issueType: 'visual_artifact_defect',
              severity: 'critical',
              confidence: 1.0,
              description: `Required video artifact for shot "${shot.id}" is missing or unrendered.`,
              suggestedFix: 'Render or generate video artifact for this shot.',
            },
          ],
          retakeRecommendations: [
            {
              recommendationId: `rec_missing_${Date.now()}`,
              shotId: shot.id,
              strategy: 'surgical_retake',
              priority: 'high',
              rationale: 'Missing video deliverable requires generation.',
            },
          ],
          evaluatedFramesCount: 0,
          evaluatedAt: new Date().toISOString(),
          evaluationMechanism: 'LOCAL_MEDIA_METADATA',
        };

        reports.push(missingReport);

        const reportPath = path.join(reportsDir, `${missingReport.reportId}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(missingReport, null, 2), 'utf-8');
      }
    }

    // 3. Compute Summary
    const totalShots = shots.length;
    const evaluatedCount = reports.filter((r) => r.status !== 'MISSING_ARTIFACT' && r.status !== 'NOT_EVALUATED').length;
    const passedCount = reports.filter((r) => r.passed).length;
    const failedCount = reports.filter((r) => !r.passed).length;
    const notEvaluatedShots = totalShots - evaluatedCount;

    const allDefects = reports.flatMap((r) => r.defects);
    const criticalDefects = allDefects.filter((d) => d.severity === 'critical').length;

    // Step 11: If evaluated count is 0, average score is null (NOT 1.0)
    let avgScore: number | null = null;
    if (evaluatedCount > 0) {
      const validScores = reports
        .filter((r) => r.overallVisualContinuityScore !== null && r.status !== 'MISSING_ARTIFACT')
        .map((r) => r.overallVisualContinuityScore as number);
      if (validScores.length > 0) {
        avgScore = Number((validScores.reduce((acc, s) => acc + s, 0) / validScores.length).toFixed(2));
      }
    }

    let overallStatus: 'PASSED' | 'FAILED' | 'INCOMPLETE' = 'PASSED';
    if (evaluatedCount === 0 || notEvaluatedShots > 0) {
      overallStatus = evaluatedCount === 0 ? 'INCOMPLETE' : 'FAILED';
    }
    if (criticalDefects > 0 || failedCount > 0 || missingArtifactsCount > 0) {
      overallStatus = 'FAILED';
    }

    const summary: VisualQAStepSummary = {
      totalShots,
      evaluatedShots: evaluatedCount,
      evaluatedShotsCount: evaluatedCount,
      missingArtifacts: missingArtifactsCount,
      notEvaluatedShots,
      passedShots: passedCount,
      passedShotsCount: passedCount,
      failedShots: failedCount,
      failedShotsCount: failedCount,
      totalDefects: allDefects.length,
      criticalDefects,
      averageVisualScore: avgScore,
      overallStatus,
      reports,
    };

    // Update pipeline state
    state.visualQAReports = reports;
    state.visualQASummary = summary;

    logger.info('Visual Semantic QA & Multimodal Continuity step completed.', {
      totalShots,
      evaluatedShots: evaluatedCount,
      passedShots: passedCount,
      missingArtifacts: missingArtifactsCount,
      averageVisualScore: avgScore,
      overallStatus,
    });

    return {
      summary,
      reports,
    };
  }
}
