import * as path from 'node:path';
import * as fs from 'node:fs';
import { IStorageProvider } from '../storage/index.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { LLMProvider } from '../llm/llm-provider.js';
import { ProductionRun, ProductionRunSchema } from '../domain/production-run.js';
import { ProductionRunStateMachine } from '../production-run/production-run-state-machine.js';
import { ProductionRunRepository } from '../production-run/production-run-repository.js';
import { EvidenceStore } from '../production-evidence/evidence-store.js';
import { ProviderEvidenceRecorder } from '../production-evidence/provider-evidence-recorder.js';
import { MediaEvidenceRecorder } from '../production-evidence/media-evidence-recorder.js';
import { ProductionMasterVerifier } from '../production-verifier/production-master-verifier.js';
import { ProductionLeakDetector } from '../production-verifier/production-leak-detector.js';
import { ArtifactVerifier } from '../media/artifact-verifier.js';
import { VisualSemanticQAEvaluator } from '../qa/visual-semantic-qa-evaluator.js';
import { ShotContract, ProductionScene } from '../domain/director.js';
import { ProductionSafetyError } from '../domain/execution-mode.js';
import { SourceDocumentManager } from '../story/source-document-manager.js';
import { RuleBasedStoryAnalyzer, ProviderStoryAnalyzer } from '../story/story-analyzer.js';
import { ShotPlanner } from '../director/shot-planner.js';
import { DirectorQA } from '../director/director-qa.js';
import { UniverseManager } from '../universe/index.js';
import { CharacterStudio } from '../character/character-studio.js';
import { WorldStudio } from '../world/world-studio.js';
import { ProductionRouter } from '../production/production-router.js';
import { PromptCompiler } from '../production/prompt-compiler.js';
import { ProviderBenchmarkTracker } from '../production/benchmark-tracker.js';
import { ProviderRegistry } from '../providers/index.js';
import { HyperFramesCompositionCompiler } from '../hyperframes/composition-compiler.js';
import { HyperFramesVideoBridge } from '../hyperframes/hyperframes-video-bridge.js';
import { FlowJobManager } from '../flow/flow-job-manager.js';
import { TimelineAssembler } from '../timeline/timeline-assembler.js';
import { RealAudioMixer } from '../audio/real-audio-mixer.js';
import { ContinuityQAEvaluator } from '../qa/continuity-qa-evaluator.js';
import { VideoRenderer } from '../export/video-renderer.js';

export interface CreateProductionRunOptions {
  projectId: string;
  seriesId: string;
  rawScript: string;
  mode?: 'MOCK' | 'LOCAL' | 'PRODUCTION';
  targetRunId?: string;
}

export class ProductionOrchestrator {
  private repository: ProductionRunRepository;
  private evidenceStore: EvidenceStore;

  constructor(
    private storage: IStorageProvider,
    private assetRegistry: IAssetRegistry,
    private llm?: LLMProvider
  ) {
    this.repository = new ProductionRunRepository(storage);
    this.evidenceStore = new EvidenceStore(storage);
  }

  /**
   * Initializes a brand-new ProductionRun entity on disk.
   */
  public async createRun(options: CreateProductionRunOptions): Promise<ProductionRun> {
    const runId = options.targetRunId || `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mode = options.mode || 'PRODUCTION';

    const initialRun: ProductionRun = {
      runId,
      projectId: options.projectId,
      seriesId: options.seriesId,
      status: 'CREATED',
      mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'CREATED',
      completedShotIds: [],
      pendingShotIds: [],
      blockedShotIds: [],
      providerJobs: {},
      mediaEvidence: {},
      qaEvidence: {},
      approvalEvidence: {},
      resumeMetadata: {
        canResume: true,
        resumeStage: 'PREFLIGHT',
        recommendedCommand: `studio production run ${runId}`,
      },
    };

    const validated = ProductionRunSchema.parse(initialRun);
    await this.repository.save(validated);
    await this.storage.write(
      `.studio/production/${options.projectId}/${runId}/source_story.txt`,
      options.rawScript
    );

    return validated;
  }

  /**
   * Executes or resumes a production run through the full lifecycle.
   */
  public async execute(
    projectId: string,
    runId: string,
    options?: {
      allowRehearsal?: boolean;
    }
  ): Promise<ProductionRun> {
    const existing = await this.repository.findById(projectId, runId);
    if (!existing) {
      throw new Error(`Production run "${runId}" not found for project "${projectId}".`);
    }

    const sm = new ProductionRunStateMachine(existing);

    // 1. PREFLIGHT
    if (sm.status === 'CREATED') {
      sm.transition('PREFLIGHT', 'Validating execution readiness');
      sm.setStage('preflight');
      await this.repository.save(sm.getRun());
    }

    // Verify script exists
    const scriptPath = `.studio/production/${projectId}/${runId}/source_story.txt`;
    if (!(await this.storage.exists(scriptPath))) {
      sm.fail('preflight', `Source story missing at "${scriptPath}".`);
      await this.repository.save(sm.getRun());
      return sm.getRun();
    }
    const rawScript = await this.storage.read(scriptPath);

    if (sm.status === 'PREFLIGHT') {
      sm.transition('READY', 'Preflight validation completed');
      sm.setStage('ready');
      await this.repository.save(sm.getRun());
    }

    // 2. RUNNING: Story analysis -> Shot planning -> Character/World resolution -> Routing
    if (sm.status === 'READY' || sm.status === 'WAITING_FOR_PROVIDER') {
      sm.transition('RUNNING', 'Starting production execution');
      sm.setStage('story_planning');
      await this.repository.save(sm.getRun());
    }

    // Story Ingestion & Analysis
    let storyAnalysis: any;
    const storyAnalysisPath = `.studio/production/${projectId}/${runId}/story_analysis.json`;

    if (await this.storage.exists(storyAnalysisPath)) {
      storyAnalysis = await this.storage.readJson(storyAnalysisPath);
    } else {
      const doc = SourceDocumentManager.createSourceDocument(
        projectId,
        'Production Script',
        rawScript,
        { documentId: `doc_${projectId}_${runId}` }
      );

      // Attempt LLM if configured and opt-in or provider requested
      if (this.llm) {
        const start = Date.now();
        const startIso = new Date().toISOString();
        try {
          const providerAnalyzer = new ProviderStoryAnalyzer(this.llm);
          storyAnalysis = await providerAnalyzer.analyze(doc);
          const endIso = new Date().toISOString();
          const latencyMs = Date.now() - start;

          // Record truthful provider evidence
          const evidence = ProviderEvidenceRecorder.record({
            runId: sm.runId,
            providerId: this.llm.metadata.id,
            providerName: this.llm.metadata.name,
            providerRole: 'STRUCTURED',
            actualModel: (this.llm as any).getLastModelUsed?.() || 'gemini-3.5-flash',
            requestStartedAt: startIso,
            requestCompletedAt: endIso,
            latencyMs,
            status: 'SUCCESS',
            rawInput: rawScript,
            rawOutput: storyAnalysis,
            usage: (this.llm as any).getLastUsage?.(),
          });
          await this.evidenceStore.appendProviderEvidence(projectId, runId, evidence);
        } catch (err: any) {
          const endIso = new Date().toISOString();
          const latencyMs = Date.now() - start;
          const category = (this.llm as any).classifyError?.(err) || 'UNKNOWN_PROVIDER_ERROR';

          const evidence = ProviderEvidenceRecorder.record({
            runId: sm.runId,
            providerId: this.llm.metadata.id,
            providerName: this.llm.metadata.name,
            providerRole: 'STRUCTURED',
            actualModel: 'gemini-3.5-flash',
            requestStartedAt: startIso,
            requestCompletedAt: endIso,
            latencyMs,
            status: category === 'QUOTA_EXCEEDED' || category === 'RATE_LIMITED' ? 'BLOCKED' : 'FAILED',
            errorCategory: category,
            errorMessage: err?.message,
            rawInput: rawScript,
          });
          await this.evidenceStore.appendProviderEvidence(projectId, runId, evidence);

          if (category === 'QUOTA_EXCEEDED' || category === 'RATE_LIMITED') {
            sm.transition('WAITING_FOR_PROVIDER', `Provider quota exceeded (${this.llm.metadata.name})`);
            sm.setResumeMetadata({
              canResume: true,
              blockedReason: `Provider "${this.llm.metadata.name}" quota exceeded (${category}).`,
              recommendedCommand: `studio production resume ${runId}`,
              nextAction: 'Wait for quota reset or update GEMINI_API_KEY, then resume.',
            });
            await this.repository.save(sm.getRun());
            return sm.getRun();
          }

          if (sm.mode === 'PRODUCTION') {
            throw err;
          }
          // Fallback to deterministic rule-based story analysis in non-strict mode
          const ruleAnalyzer = new RuleBasedStoryAnalyzer();
          storyAnalysis = await ruleAnalyzer.analyze(doc);
        }
      } else {
        const ruleAnalyzer = new RuleBasedStoryAnalyzer();
        storyAnalysis = await ruleAnalyzer.analyze(doc);
      }

      await this.storage.writeJson(storyAnalysisPath, storyAnalysis);
    }

    // Shot Planning
    let plannedShots: ShotContract[] = [];
    const shotsPath = `.studio/production/${projectId}/${runId}/planned_shots.json`;

    if (await this.storage.exists(shotsPath)) {
      plannedShots = await this.storage.readJson<ShotContract[]>(shotsPath);
    } else {
      const planner = new ShotPlanner();
      for (const scene of storyAnalysis.sceneCandidates) {
        const plan = planner.planScene(scene, projectId);
        DirectorQA.evaluateScene(plan.productionScene, plan.dependencyGraph);
        plannedShots.push(...plan.productionScene.shots);
      }
      await this.storage.writeJson(shotsPath, plannedShots);
    }

    const allShotIds = plannedShots.map((s) => s.id);
    if (sm.getRun().pendingShotIds.length === 0 && sm.getRun().completedShotIds.length === 0) {
      sm.setPendingShots(allShotIds);
    }

    // Production Routing
    const providerRegistry = new ProviderRegistry();
    const promptCompiler = new PromptCompiler();
    const benchmarkTracker = new ProviderBenchmarkTracker();
    const router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker);
    const productionPlan = router.planProduction(projectId, sm.seriesId, plannedShots);

    // 3. SHOT GENERATION & ASSET VERIFICATION
    sm.setStage('shot_generation');

    for (const strat of productionPlan.strategies) {
      const shotId = strat.shotId;
      const targetShot = plannedShots.find((s) => s.id === shotId);
      if (!targetShot) continue;

      // Skip already completed shots (IMMUTABILITY & RESUMABILITY)
      if (sm.getRun().completedShotIds.includes(shotId)) {
        continue;
      }

      sm.setStage('generating_shot', shotId);

      // Route A: Deterministic HyperFrames
      if (strat.isDeterministic || strat.executionRoute === 'deterministic_hyperframes') {
        const compiler = new HyperFramesCompositionCompiler();
        const composition = compiler.compile(targetShot);

        // Headless render to MP4
        const renderDir = path.resolve('.studio', 'production', projectId, runId, 'renders');
        fs.mkdirSync(renderDir, { recursive: true });
        const shotMp4Path = path.join(renderDir, `${shotId}.mp4`);

        if (!fs.existsSync(shotMp4Path)) {
          await HyperFramesVideoBridge.renderToMp4(composition, shotMp4Path);
        }

        // Physical verification and recording
        const mediaEvidence = MediaEvidenceRecorder.verifyAndRecord({
          shotId,
          assetId: `ASSET_HF_${shotId}`,
          filePath: shotMp4Path,
          provenance: `HyperFrames Deterministic Engine (${composition.compositionId})`,
          generationSource: 'HYPERFRAMES',
          executionMode: sm.mode,
        });
        sm.recordMediaEvidence(mediaEvidence);
        await this.evidenceStore.saveMediaEvidence(projectId, runId, sm.getRun().mediaEvidence);

        // Run Visual QA on candidate
        sm.transition('VISUAL_QA', `Running visual QA on shot "${shotId}"`);
        const visualEvaluator = new VisualSemanticQAEvaluator(this.llm);
        const report = await visualEvaluator.evaluateShotVideo({
          projectId,
          shot: targetShot,
          videoPath: shotMp4Path,
          assetId: mediaEvidence.assetId,
          executionMode: sm.mode,
        });

        const providerTrust =
          (report.metadata as any)?.providerTrust ??
          (this.llm?.metadata as any)?.providerTrust ??
          'UNKNOWN';
        const isSynthetic =
          Boolean((report.metadata as any)?.isSynthetic) ||
          report.evaluationMechanism === 'OFFLINE_TEST_DOUBLE' ||
          report.evaluationMechanism === 'LOCAL_MEDIA_METADATA' ||
          report.evaluationMechanism === 'MOCK' ||
          providerTrust === 'OFFLINE_TEST_DOUBLE' ||
          providerTrust === 'MOCK';

        sm.recordQAEvidence({
          shotId,
          reportId: report.reportId,
          overallStatus: report.status,
          passed: report.passed,
          mechanism: report.evaluationMechanism,
          providerTrust,
          isSynthetic,
          scores: {
            identity: report.identityConsistencyScore,
            spatial: report.spatialPerspectiveScore,
            defects: report.visualDefectScore,
            overall: report.overallVisualContinuityScore,
          },
          coverage: report.coverage as any,
          totalDefects: report.defects.length,
          criticalDefects: report.defects.filter((d: any) => d.severity === 'critical').length,
          retakesRecommended: report.retakeRecommendations.length,
          evaluatedAt: report.evaluatedAt,
        });
        await this.evidenceStore.saveQAEvidence(projectId, runId, sm.getRun().qaEvidence);

        // Require Human Approval before timeline entry
        sm.transition('APPROVAL_REQUIRED', `Shot "${shotId}" requires human approval`);
        sm.setResumeMetadata({
          canResume: true,
          targetShotId: shotId,
          nextAction: `Approve or reject candidate for shot "${shotId}".`,
          recommendedCommand: `studio production approve ${runId} ${shotId}`,
        });
        await this.repository.save(sm.getRun());
        return sm.getRun();
      }

      // Route B: Google Flow Assisted
      if (strat.integrationMode === 'ASSISTED' || strat.executionRoute === 'generative_full_video') {
        const flowManager = new FlowJobManager(this.assetRegistry);
        const job = await flowManager.prepareFlowJob({
          projectId,
          seriesId: sm.seriesId,
          sceneId: targetShot.sceneId,
          shot: targetShot,
          sourceReferences: [],
          references: [],
        });

        sm.transition('NEEDS_USER_ACTION', `Flow package prepared for shot "${shotId}"`);
        sm.markShotBlocked(shotId);
        sm.setResumeMetadata({
          canResume: true,
          targetShotId: shotId,
          nextAction: `Generate clip in Google Flow using package at "${job.packageDir}", then import MP4.`,
          recommendedCommand: `studio production import ${runId} ${shotId} <path_to_downloaded_mp4>`,
        });
        await this.repository.save(sm.getRun());
        return sm.getRun();
      }
    }

    // 4. ASSEMBLING: All shots completed & approved -> Timeline Assembly
    sm.transition('ASSEMBLING', 'All shots approved; assembling master timeline');
    sm.setStage('assembling_timeline');

    // Build shotVideoMap strictly from approved authoritative media
    const shotVideoMap: Record<string, string> = {};
    for (const shotId of allShotIds) {
      const media = sm.getRun().mediaEvidence[shotId];
      const approval = sm.getRun().approvalEvidence[shotId];
      if (!media || !approval || approval.status !== 'APPROVED') {
        throw new ProductionSafetyError(
          `Cannot assemble timeline in PRODUCTION mode: Shot "${shotId}" has not been approved into Canon.`
        );
      }
      shotVideoMap[shotId] = media.physicalPath;
      shotVideoMap[media.assetId] = media.physicalPath;
      shotVideoMap[`ASSET_SHOT_${shotId}`] = media.physicalPath;
      shotVideoMap[`clip_v1_${shotId}`] = media.physicalPath;
    }

    const sequence = TimelineAssembler.assemble({
      projectId,
      sceneId: 'SCENE_01',
      shots: plannedShots,
    });

    // Real audio mix
    const audioDir = path.resolve('.studio', 'production', projectId, runId, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    const masterAudioPath = path.join(audioDir, 'master-audio.wav');

    await RealAudioMixer.mix({
      projectId,
      outputDir: audioDir,
      totalDurationSeconds: sequence.totalDuration,
      stems: [],
    });

    // Continuity QA
    const continuityReport = ContinuityQAEvaluator.evaluate({
      projectId,
      sceneId: 'SCENE_01',
      shots: plannedShots,
      timelineSequence: sequence,
    });

    // Master Video Rendering
    const masterDir = path.resolve('.studio', 'production', projectId, runId, 'master');
    fs.mkdirSync(masterDir, { recursive: true });
    const masterVideoPath = path.join(masterDir, 'master.mp4');

    const renderResult = await VideoRenderer.render({
      sequence,
      shotVideoMap,
      masterAudioPath,
      outputPath: masterVideoPath,
    });

    // 5. MASTER QA & VERIFICATION
    sm.transition('MASTER_QA', 'Auditing final master deliverable against 13-point production gate');
    sm.setStage('master_qa');

    const masterEvidence = ProductionMasterVerifier.assertVerified({
      run: sm.getRun(),
      requiredShotIds: allShotIds,
      masterVideoPath: renderResult.outputPath,
      manifestId: renderResult.manifest.manifestId,
      sequenceId: sequence.sequenceId,
      continuityReport,
      shotVideoMap,
      timelineSequence: sequence,
      shots: plannedShots,
      allowRehearsal: sm.mode !== 'PRODUCTION' || Boolean(options?.allowRehearsal),
    });

    sm.recordMasterEvidence(masterEvidence);
    await this.evidenceStore.saveMasterEvidence(projectId, runId, masterEvidence);

    // 6. COMPLETED
    sm.transition('COMPLETED', 'Production run completed and master verified');
    sm.setStage('completed');
    sm.setResumeMetadata({
      canResume: false,
      nextAction: 'Production completed successfully. Master deliverable verified.',
      recommendedCommand: `studio production status ${runId}`,
    });

    await this.repository.save(sm.getRun());
    return sm.getRun();
  }

  /**
   * Imports an external video (e.g. downloaded from Google Flow) into the production run.
   */
  public async importShotMedia(
    projectId: string,
    runId: string,
    shotId: string,
    videoPath: string,
    options?: {
      generationSource?: 'HYPERFRAMES' | 'FLOW_ASSISTED' | 'LIVE_PROVIDER' | 'IMPORTED' | 'SIMULATED_FLOW';
      provenance?: string;
    }
  ): Promise<ProductionRun> {
    const run = await this.repository.findById(projectId, runId);
    if (!run) throw new Error(`Production run "${runId}" not found.`);

    const sm = new ProductionRunStateMachine(run);
    sm.transition('VERIFYING_MEDIA', `Importing external media for shot "${shotId}"`);

    // Verify physical file and register
    const mediaEvidence = MediaEvidenceRecorder.verifyAndRecord({
      shotId,
      assetId: `ASSET_IMPORT_${shotId}_${Date.now()}`,
      filePath: videoPath,
      provenance: options?.provenance ?? `External Media Import: ${path.basename(videoPath)}`,
      generationSource: options?.generationSource ?? 'IMPORTED',
      executionMode: sm.mode,
    });

    sm.recordMediaEvidence(mediaEvidence);
    await this.evidenceStore.saveMediaEvidence(projectId, runId, sm.getRun().mediaEvidence);

    // Load planned shot contract for visual QA
    const shotsPath = `.studio/production/${projectId}/${runId}/planned_shots.json`;
    let targetShot: ShotContract | undefined;
    if (await this.storage.exists(shotsPath)) {
      const shots = await this.storage.readJson<ShotContract[]>(shotsPath);
      targetShot = shots.find((s) => s.id === shotId);
    }
    if (!targetShot) {
      targetShot = {
        id: shotId,
        sceneId: 'SCENE_01',
        shotNumber: 1,
        purpose: 'action',
        complexity: 'complex_generative_video',
        rendererIntent: 'generative_full_video',
        frame: { durationSeconds: 4.0, aspectRatio: '16:9', targetFps: 24 },
        camera: { focalLength: '35mm', shotSize: 'medium', angle: 'eye_level', movement: 'static', semanticSkills: [] },
        lighting: { keyLightDirection: 'front', mood: 'natural', colorTemperature: 'neutral', fogAtmosphere: false },
        composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
        acting: [],
        transition: { type: 'cut', durationSeconds: 0 },
        audioCue: { sfx: [] },
        requiredAssetIds: [],
        dependsOnShotIds: [],
        directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
        provenance: { decidedAt: new Date().toISOString() },
      };
    }

    // Run Visual QA on imported candidate
    sm.transition('VISUAL_QA', `Running visual QA on imported shot "${shotId}"`);
    const evaluator = new VisualSemanticQAEvaluator(this.llm);
    const report = await evaluator.evaluateShotVideo({
      projectId,
      shot: targetShot,
      videoPath: mediaEvidence.physicalPath,
      assetId: mediaEvidence.assetId,
      executionMode: sm.mode,
    });

    const providerTrust =
      (report.metadata as any)?.providerTrust ??
      (this.llm?.metadata as any)?.providerTrust ??
      'UNKNOWN';
    const isSynthetic =
      Boolean((report.metadata as any)?.isSynthetic) ||
      report.evaluationMechanism === 'OFFLINE_TEST_DOUBLE' ||
      report.evaluationMechanism === 'LOCAL_MEDIA_METADATA' ||
      report.evaluationMechanism === 'MOCK' ||
      providerTrust === 'OFFLINE_TEST_DOUBLE' ||
      providerTrust === 'MOCK';

    sm.recordQAEvidence({
      shotId,
      reportId: report.reportId,
      overallStatus: report.status,
      passed: report.passed,
      mechanism: report.evaluationMechanism,
      providerTrust,
      isSynthetic,
      scores: {
        identity: report.identityConsistencyScore,
        spatial: report.spatialPerspectiveScore,
        defects: report.visualDefectScore,
        overall: report.overallVisualContinuityScore,
      },
      coverage: report.coverage as any,
      totalDefects: report.defects.length,
      criticalDefects: report.defects.filter((d: any) => d.severity === 'critical').length,
      retakesRecommended: report.retakeRecommendations.length,
      evaluatedAt: report.evaluatedAt,
    });
    await this.evidenceStore.saveQAEvidence(projectId, runId, sm.getRun().qaEvidence);

    // Move to APPROVAL_REQUIRED
    sm.transition('APPROVAL_REQUIRED', `Imported shot "${shotId}" requires human approval`);
    sm.setResumeMetadata({
      canResume: true,
      targetShotId: shotId,
      nextAction: `Approve or reject candidate for shot "${shotId}".`,
      recommendedCommand: `studio production approve ${runId} ${shotId}`,
    });

    await this.repository.save(sm.getRun());
    return sm.getRun();
  }

  /**
   * Promotes a verified candidate shot into approved Canon.
   */
  public async approveShot(
    projectId: string,
    runId: string,
    shotId: string,
    decidedBy: string = 'Director / Human Reviewer',
    notes?: string,
    options?: {
      approvalType?: 'HUMAN' | 'AUTOMATED_TEST' | 'SYSTEM';
      actorId?: string;
      actorDisplayName?: string;
      approvalSource?: string;
      interactive?: boolean;
    }
  ): Promise<ProductionRun> {
    const run = await this.repository.findById(projectId, runId);
    if (!run) throw new Error(`Production run "${runId}" not found.`);

    const sm = new ProductionRunStateMachine(run);
    const media = run.mediaEvidence[shotId];
    if (!media) {
      throw new ProductionSafetyError(`Cannot approve shot "${shotId}": No media evidence recorded.`);
    }

    const qa = run.qaEvidence[shotId];
    if (!qa || !qa.passed) {
      throw new ProductionSafetyError(
        `Cannot approve shot "${shotId}": Visual QA must be evaluated and passed before approval.`
      );
    }

    sm.recordApprovalEvidence({
      shotId,
      candidateAssetId: media.assetId,
      canonicalAssetId: `CANON_${shotId}`,
      status: 'APPROVED',
      approvalType: options?.approvalType ?? 'HUMAN',
      actorId: options?.actorId,
      actorDisplayName: options?.actorDisplayName,
      approvalSource: options?.approvalSource,
      interactive: options?.interactive ?? false,
      decidedBy,
      decidedAt: new Date().toISOString(),
      notes,
    });

    sm.markShotCompleted(shotId);

    // Save approval evidence in durable evidence store
    await this.evidenceStore.saveApprovalEvidence(projectId, runId, sm.getRun().approvalEvidence);

    // If more shots remain or ready to assemble, resume
    sm.setResumeMetadata({
      canResume: true,
      nextAction: 'Candidate approved into Canon. Continue production run.',
      recommendedCommand: `studio production resume ${runId}`,
    });

    await this.repository.save(sm.getRun());
    return sm.getRun();
  }

  /**
   * Rejects a candidate shot with a specific reason.
   */
  public async rejectShot(
    projectId: string,
    runId: string,
    shotId: string,
    reason: string,
    decidedBy: string = 'Director / Human Reviewer'
  ): Promise<ProductionRun> {
    const run = await this.repository.findById(projectId, runId);
    if (!run) throw new Error(`Production run "${runId}" not found.`);

    const sm = new ProductionRunStateMachine(run);
    const media = run.mediaEvidence[shotId];
    if (!media) {
      throw new ProductionSafetyError(`Cannot reject shot "${shotId}": No media evidence recorded.`);
    }

    sm.recordApprovalEvidence({
      shotId,
      candidateAssetId: media.assetId,
      status: 'REJECTED',
      approvalType: 'HUMAN',
      interactive: false,
      decidedBy,
      decidedAt: new Date().toISOString(),
      notes: reason,
    });

    sm.markShotBlocked(shotId);

    await this.evidenceStore.saveApprovalEvidence(projectId, runId, sm.getRun().approvalEvidence);

    sm.setResumeMetadata({
      canResume: true,
      blockedReason: `Shot "${shotId}" was rejected: "${reason}". Retake or new generation required.`,
      recommendedCommand: `studio production resume ${runId}`,
    });

    await this.repository.save(sm.getRun());
    return sm.getRun();
  }
}
