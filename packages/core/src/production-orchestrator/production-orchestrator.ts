import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { IStorageProvider } from '../storage/index.js';
import { IAssetRegistry } from '../asset-registry/index.js';
import { LLMProvider } from '../llm/llm-provider.js';
import { ProductionRun, ProductionRunSchema, MasterProductionEvidence, ProductionApprovalChallenge } from '../domain/production-run.js';
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
import { FlowOperatorHandoffBuilder, FlowOperatorHandoffResult } from '../flow/flow-operator-handoff-builder.js';
import { TimelineAssembler } from '../timeline/timeline-assembler.js';
import { RealAudioMixer } from '../audio/real-audio-mixer.js';
import { ContinuityQAEvaluator } from '../qa/continuity-qa-evaluator.js';
import { VideoRenderer } from '../export/video-renderer.js';
import { ProductionAcceptanceBundle } from '../production-verifier/acceptance-bundle.js';

export interface CreateProductionRunOptions {
  projectId: string;
  seriesId: string;
  rawScript: string;
  mode?: 'MOCK' | 'LOCAL' | 'PRODUCTION';
  targetRunId?: string;
  pilotMode?: boolean;
  requiredShotCount?: number;
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
      pilotMode: options.pilotMode ?? false,
      requiredShotCount: options.requiredShotCount,
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
      approvalChallenges: {},
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
      preferFlowAssisted?: boolean;
    }
  ): Promise<ProductionRun> {
    const existing = await this.repository.findById(projectId, runId);
    if (!existing) {
      throw new Error(`Production run "${runId}" not found for project "${projectId}".`);
    }

    const sm = new ProductionRunStateMachine(existing);

    // If run is already completed or cancelled, return immediately (Idempotency)
    if (sm.status === 'COMPLETED' || sm.status === 'CANCELLED') {
      return sm.getRun();
    }

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
      if (sm.getRun().requiredShotCount) {
        plannedShots = plannedShots.slice(0, sm.getRun().requiredShotCount);
      } else if (sm.getRun().pilotMode) {
        plannedShots = plannedShots.slice(0, 1);
      }
      await this.storage.writeJson(shotsPath, plannedShots);
    }

    if (sm.getRun().requiredShotCount) {
      plannedShots = plannedShots.slice(0, sm.getRun().requiredShotCount);
    } else if (sm.getRun().pilotMode) {
      plannedShots = plannedShots.slice(0, 1);
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
    const preferFlow = options?.preferFlowAssisted ?? Boolean(sm.getRun().pilotMode);
    const productionPlan = router.planProduction(projectId, sm.seriesId, plannedShots, {
      preferFlowAssisted: preferFlow,
    });

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
      if (strat.integrationMode !== 'ASSISTED' && (strat.isDeterministic || strat.executionRoute === 'deterministic_hyperframes')) {
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
          mediaSha256: mediaEvidence.sha256,
          candidateAssetId: mediaEvidence.assetId,
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

        // Check for provider quota failure during visual QA
        if (report.metadata?.providerFailure && (report.metadata.providerFailureReason === 'QUOTA_EXCEEDED' || report.metadata.providerFailureReason === 'RATE_LIMITED')) {
          sm.transition('WAITING_FOR_PROVIDER', `Gemini quota exceeded during visual QA for shot "${shotId}"`);
          sm.setResumeMetadata({
            canResume: true,
            targetShotId: shotId,
            blockedReason: `Gemini visual QA quota exceeded (${report.metadata.providerFailureReason}).`,
            nextAction: 'Wait for quota reset or update GEMINI_API_KEY, then resume.',
            recommendedCommand: `studio production resume ${runId}`,
          });
          await this.repository.save(sm.getRun());
          return sm.getRun();
        }

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
        const baseDir = typeof (this.storage as any).getBaseDir === 'function' ? (this.storage as any).getBaseDir() : '.';
        const handoffDir = path.resolve(baseDir, '.studio', 'production', projectId, runId, 'handoff', shotId);
        const manifestRelativePath = `.studio/production/${projectId}/${runId}/handoff/${shotId}/handoff-manifest.json`;

        let handoff: FlowOperatorHandoffResult;
        if (await this.storage.exists(manifestRelativePath)) {
          // Handoff package already exists on disk — do not overwrite
          const manifestContent = await this.storage.read(manifestRelativePath);
          handoff = {
            handoffDir,
            expectedFilename: `${shotId}_FLOW.mp4`,
            manifestPath: path.join(handoffDir, 'handoff-manifest.json'),
            promptPath: path.join(handoffDir, 'flow-prompt.txt'),
            instructionsPath: path.join(handoffDir, 'operator-instructions.md'),
            manifestSha256: crypto.createHash('sha256').update(manifestContent).digest('hex'),
          };
        } else {
          const handoffBuilder = new FlowOperatorHandoffBuilder();
          handoff = await handoffBuilder.buildHandoff({
            projectId,
            runId,
            seriesId: sm.seriesId,
            sceneId: targetShot.sceneId,
            shot: targetShot,
            references: [],
            outputBaseDir: handoffDir,
          });

          const flowManager = new FlowJobManager(this.assetRegistry);
          await flowManager.prepareFlowJob({
            projectId,
            seriesId: sm.seriesId,
            sceneId: targetShot.sceneId,
            shot: targetShot,
            sourceReferences: [],
            references: [],
          });
        }

        sm.transition('NEEDS_USER_ACTION', `Flow handoff package prepared for shot "${shotId}"`);
        sm.markShotBlocked(shotId);
        sm.setResumeMetadata({
          canResume: true,
          targetShotId: shotId,
          nextAction: `Generate clip in Google Flow using package at "${handoff.handoffDir}", then import downloaded MP4 (${handoff.expectedFilename}).`,
          recommendedCommand: `studio production import ${runId} ${shotId} <path_to_downloaded_mp4> --source google-flow --real-external`,
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
    const continuityPath = `.studio/production/${projectId}/${runId}/continuity_report.json`;
    await this.storage.writeJson(continuityPath, continuityReport);

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

    // 5. MASTER QA & VERIFICATION — Two-Phase Flow
    sm.transition('MASTER_QA', 'Auditing final master deliverable against 18-point production gate');
    sm.setStage('master_qa');

    const isProductionMode = sm.mode === 'PRODUCTION' && !options?.allowRehearsal;

    // ── Phase A: Structural + semantic verification (without acceptance bundle).
    // In PRODUCTION mode, this grants OFFLINE_REHEARSAL_VERIFIED (bundle is not yet built).
    // In LOCAL/OFFLINE modes, this is allowed to produce the final status directly.
    const preliminaryResult = ProductionMasterVerifier.verify({
      run: sm.getRun(),
      requiredShotIds: allShotIds,
      masterVideoPath: renderResult.outputPath,
      manifestId: renderResult.manifest.manifestId,
      sequenceId: sequence.sequenceId,
      continuityReport,
      shotVideoMap,
      timelineSequence: sequence,
      shots: plannedShots,
      allowRehearsal: true, // always allow rehearsal here; Phase D enforces production truth
    });

    if (!preliminaryResult.passed) {
      throw new ProductionSafetyError(
        `Master production verification failed at structural/semantic gate:\n- ${preliminaryResult.reasons.join('\n- ')}`
      );
    }

    const preliminaryEvidence: MasterProductionEvidence = preliminaryResult.evidence!;

    // ── Phase B: Build durable acceptance bundle from preliminary evidence
    const bundleResult = await ProductionAcceptanceBundle.build({
      projectId,
      runId,
      storage: this.storage,
      run: sm.getRun(),
      masterEvidence: preliminaryEvidence,
      requiredShotIds: allShotIds,
      providerModelIds: this.llm ? [this.llm.metadata.id] : [],
    });

    // ── Phase C: Validate the acceptance bundle (self-integrity + file checksums + metadata consistency)
    const bundleValidation = await ProductionAcceptanceBundle.validate(
      bundleResult.acceptanceDir,
      this.storage,
      {
        expectedRequiredShotIds: allShotIds,
        finalMasterVideoPath: renderResult.outputPath,
        expectedMasterChecksum: preliminaryEvidence.masterSha256,
        expectedVerificationStatus: preliminaryEvidence.verificationStatus,
      }
    );

    // ── Phase D: Final verification WITH the validated acceptance bundle.
    // Only in PRODUCTION mode does this need to produce MASTER_PRODUCTION_VERIFIED.
    // In LOCAL/OFFLINE modes, the preliminary rehearsal evidence is sufficient.
    let masterEvidence: MasterProductionEvidence;

    if (isProductionMode) {
      masterEvidence = ProductionMasterVerifier.assertVerified({
        run: sm.getRun(),
        requiredShotIds: allShotIds,
        masterVideoPath: renderResult.outputPath,
        manifestId: renderResult.manifest.manifestId,
        sequenceId: sequence.sequenceId,
        continuityReport,
        shotVideoMap,
        timelineSequence: sequence,
        shots: plannedShots,
        acceptanceBundle: { valid: bundleValidation.valid, reasons: bundleValidation.reasons },
      });
    } else {
      // Non-production: use preliminary evidence (OFFLINE_REHEARSAL_VERIFIED / LOCAL_PRODUCTION_PIPELINE_VERIFIED)
      masterEvidence = preliminaryEvidence;
    }

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
      generationSource?: 'HYPERFRAMES' | 'FLOW_ASSISTED' | 'LIVE_PROVIDER' | 'IMPORTED' | 'SIMULATED_FLOW' | 'GOOGLE_FLOW_REAL';
      provenance?: string;
      realExternal?: boolean;
    }
  ): Promise<ProductionRun> {
    const run = await this.repository.findById(projectId, runId);
    if (!run) throw new Error(`Production run "${runId}" not found.`);

    // Verify source classification: GOOGLE_FLOW_REAL requires explicit realExternal confirmation
    let source = options?.generationSource ?? 'IMPORTED';
    if (source === 'GOOGLE_FLOW_REAL' && !options?.realExternal) {
      throw new ProductionSafetyError(
        `Explicit operator confirmation (--real-external) required to record generationSource="GOOGLE_FLOW_REAL" for shot "${shotId}".`
      );
    }

    const sm = new ProductionRunStateMachine(run);
    sm.transition('VERIFYING_MEDIA', `Importing external media for shot "${shotId}"`);

    // Verify physical file and register
    const mediaEvidence = MediaEvidenceRecorder.verifyAndRecord({
      shotId,
      assetId: `ASSET_IMPORT_${shotId}_${Date.now()}`,
      filePath: videoPath,
      provenance: options?.provenance ?? `External Media Import: ${path.basename(videoPath)}`,
      generationSource: source,
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
      mediaSha256: mediaEvidence.sha256,
      candidateAssetId: mediaEvidence.assetId,
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

    // Any previous approval and approval challenge for this shot is invalidated since media has changed
    sm.invalidateApprovalForShot(shotId);
    await this.evidenceStore.saveApprovalEvidence(projectId, runId, sm.getRun().approvalEvidence);
    sm.invalidateApprovalChallengesForShot(shotId);
    await this.evidenceStore.saveApprovalChallenges(projectId, runId, sm.getRun().approvalChallenges);

    // Check for provider quota failure during visual QA
    if (report.metadata?.providerFailure && (report.metadata.providerFailureReason === 'QUOTA_EXCEEDED' || report.metadata.providerFailureReason === 'RATE_LIMITED')) {
      sm.transition('WAITING_FOR_PROVIDER', `Gemini quota exceeded during visual QA for shot "${shotId}"`);
      sm.setResumeMetadata({
        canResume: true,
        targetShotId: shotId,
        blockedReason: `Gemini visual QA quota exceeded (${report.metadata.providerFailureReason}).`,
        nextAction: 'Wait for quota reset or update GEMINI_API_KEY, then resume.',
        recommendedCommand: `studio production resume ${runId}`,
      });
      await this.repository.save(sm.getRun());
      return sm.getRun();
    }

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
   * Issues an explicit single-use approval challenge for human operator confirmation.
   * Bound to runId, projectId, shotId, candidateAssetId, mediaSha256, and qaReportId,
   * with cryptographically random nonce, issuedAt, and expiresAt.
   */
  public async issueApprovalChallenge(
    projectId: string,
    runId: string,
    shotId: string,
    action: 'APPROVE' | 'REJECT' = 'APPROVE',
    ttlSeconds: number = 900 // 15 minutes default
  ): Promise<ProductionApprovalChallenge> {
    const run = await this.repository.findById(projectId, runId);
    if (!run) throw new Error(`Production run "${runId}" not found.`);

    const media = run.mediaEvidence[shotId];
    if (!media) {
      throw new ProductionSafetyError(`Cannot issue approval challenge for shot "${shotId}": No media evidence recorded.`);
    }

    // Verify current media on disk has not changed from recorded evidence
    if (fs.existsSync(media.physicalPath)) {
      const diskCheck = ArtifactVerifier.verify(media.physicalPath);
      if (diskCheck.checksumSha256 && diskCheck.checksumSha256 !== media.sha256) {
        throw new ProductionSafetyError(
          `Cannot issue approval challenge for shot "${shotId}": Media on disk (${diskCheck.checksumSha256}) has changed from recorded media evidence (${media.sha256}).`
        );
      }
    }

    let qaReportId = 'QA_NOT_EVALUATED';
    if (action === 'APPROVE') {
      const qa = run.qaEvidence[shotId];
      if (!qa || !qa.passed) {
        throw new ProductionSafetyError(
          `Cannot issue approval challenge for shot "${shotId}": Visual QA must be evaluated and passed before issuing approval challenge.`
        );
      }
      if (qa.mediaSha256 && qa.mediaSha256 !== media.sha256) {
        throw new ProductionSafetyError(
          `Cannot issue approval challenge for shot "${shotId}": QA media SHA-256 (${qa.mediaSha256}) does not match current media SHA-256 (${media.sha256}).`
        );
      }
      qaReportId = qa.reportId;
    } else {
      const qa = run.qaEvidence[shotId];
      if (qa) {
        qaReportId = qa.reportId;
      }
    }

    const challengeId = `chal_${crypto.randomUUID().replace(/-/g, '')}`;
    const nonce = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12-character hex nonce
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const challenge: ProductionApprovalChallenge = {
      challengeId,
      nonce,
      projectId,
      runId,
      shotId,
      candidateAssetId: media.assetId,
      mediaSha256: media.sha256,
      qaReportId,
      approvalAction: action,
      issuedAt: now.toISOString(),
      expiresAt,
      consumedAt: null,
    };

    const sm = new ProductionRunStateMachine(run);
    sm.recordApprovalChallenge(challenge);

    await this.evidenceStore.saveApprovalChallenges(projectId, runId, sm.getRun().approvalChallenges);
    await this.repository.save(sm.getRun());

    return challenge;
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
      challengeId?: string;
      challengeNonce?: string;
      confirmedByOperator?: boolean;
    }
  ): Promise<ProductionRun> {
    const run = await this.repository.findById(projectId, runId);
    if (!run) throw new Error(`Production run "${runId}" not found.`);

    const sm = new ProductionRunStateMachine(run);
    const media = run.mediaEvidence[shotId];
    if (!media) {
      throw new ProductionSafetyError(`Cannot approve shot "${shotId}": No media evidence recorded.`);
    }

    // Verify current media on disk has not changed from recorded evidence
    if (fs.existsSync(media.physicalPath)) {
      const diskCheck = ArtifactVerifier.verify(media.physicalPath);
      if (diskCheck.checksumSha256 && diskCheck.checksumSha256 !== media.sha256) {
        throw new ProductionSafetyError(
          `Cannot approve shot "${shotId}": Media on disk (${diskCheck.checksumSha256}) has changed from recorded media evidence (${media.sha256}). Re-import or re-render required.`
        );
      }
    }

    const qa = run.qaEvidence[shotId];
    if (!qa || !qa.passed) {
      throw new ProductionSafetyError(
        `Cannot approve shot "${shotId}": Visual QA must be evaluated and passed before approval.`
      );
    }

    // Studio HUMAN approval requires completion of the operator challenge ceremony.
    // The operator challenge is an application-level confirmation boundary protecting against
    // accidental, stale, mismatched, or replayed approvals. It is not cryptographic proof of
    // physical human presence; code with unrestricted access to the local Studio process/storage
    // is outside this trust boundary.
    // Untrusted booleans alone (e.g. confirmedByOperator or interactive=true) cannot establish human trust boundary.
    // HUMAN approval strictly requires an issued, unexpired, unconsumed challenge verified against current media and QA.
    let approvalType = options?.approvalType;
    if (!approvalType) {
      approvalType = (options?.challengeId && options?.interactive) ? 'HUMAN' : 'AUTOMATED_TEST';
    }

    if (approvalType === 'HUMAN') {
      if (!options?.challengeId || !options?.challengeNonce) {
        throw new ProductionSafetyError(
          `Cannot record approvalType="HUMAN" without an explicit approval challenge and nonce. An approval challenge must be issued and confirmed interactively.`
        );
      }
      if (options?.interactive !== true) {
        throw new ProductionSafetyError(
          `Cannot record approvalType="HUMAN" with interactive=false. Human approval requires an interactive session.`
        );
      }
      const challenge = run.approvalChallenges?.[options.challengeId];
      if (!challenge) {
        throw new ProductionSafetyError(
          `Approval challenge "${options.challengeId}" not found for run "${runId}".`
        );
      }
      if (challenge.nonce !== options.challengeNonce) {
        throw new ProductionSafetyError(
          `Approval challenge nonce mismatch for challenge "${options.challengeId}".`
        );
      }
      if (challenge.approvalAction !== 'APPROVE') {
        throw new ProductionSafetyError(
          `Approval challenge "${options.challengeId}" is for action "${challenge.approvalAction}", not "APPROVE".`
        );
      }
      if (challenge.runId !== runId || challenge.projectId !== projectId || challenge.shotId !== shotId) {
        throw new ProductionSafetyError(
          `Approval challenge "${options.challengeId}" does not match target run/shot (${challenge.shotId} !== ${shotId}).`
        );
      }
      if (challenge.consumedAt !== null) {
        throw new ProductionSafetyError(
          `Approval challenge "${options.challengeId}" has already been consumed at ${challenge.consumedAt}. Reused challenges are forbidden.`
        );
      }
      const now = new Date();
      if (now.getTime() > new Date(challenge.expiresAt).getTime()) {
        throw new ProductionSafetyError(
          `Approval challenge "${options.challengeId}" expired at ${challenge.expiresAt}.`
        );
      }
      if (challenge.candidateAssetId !== media.assetId) {
        throw new ProductionSafetyError(
          `Approval challenge candidate asset ID (${challenge.candidateAssetId}) does not match current media asset ID (${media.assetId}).`
        );
      }
      if (challenge.mediaSha256 !== media.sha256) {
        throw new ProductionSafetyError(
          `Approval challenge media SHA-256 (${challenge.mediaSha256}) does not match current media evidence (${media.sha256}). Media has changed since challenge was issued.`
        );
      }
      if (fs.existsSync(media.physicalPath)) {
        const diskCheck = ArtifactVerifier.verify(media.physicalPath);
        if (diskCheck.checksumSha256 && diskCheck.checksumSha256 !== challenge.mediaSha256) {
          throw new ProductionSafetyError(
            `Approval challenge media SHA-256 (${challenge.mediaSha256}) does not match current physical disk checksum (${diskCheck.checksumSha256}).`
          );
        }
      }
      if (challenge.qaReportId !== qa.reportId) {
        throw new ProductionSafetyError(
          `Approval challenge QA report ID (${challenge.qaReportId}) does not match current QA report ID (${qa.reportId}). QA evaluation was replaced.`
        );
      }

      // Mark challenge as single-use consumed
      challenge.consumedAt = now.toISOString();
      await this.evidenceStore.saveApprovalChallenges(projectId, runId, run.approvalChallenges);
    }

    sm.recordApprovalEvidence({
      shotId,
      candidateAssetId: media.assetId,
      canonicalAssetId: `CANON_${shotId}`,
      mediaSha256: media.sha256,
      qaReportId: qa.reportId,
      status: 'APPROVED',
      approvalType,
      actorId: options?.actorId,
      actorDisplayName: options?.actorDisplayName,
      approvalSource: options?.approvalSource,
      interactive: options?.interactive ?? false,
      challengeId: options?.challengeId,
      challengeNonce: options?.challengeNonce,
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
    decidedBy: string = 'Director / Human Reviewer',
    options?: {
      approvalType?: 'HUMAN' | 'AUTOMATED_TEST' | 'SYSTEM';
      interactive?: boolean;
      challengeId?: string;
      challengeNonce?: string;
      actorId?: string;
      actorDisplayName?: string;
      approvalSource?: string;
    }
  ): Promise<ProductionRun> {
    const run = await this.repository.findById(projectId, runId);
    if (!run) throw new Error(`Production run "${runId}" not found.`);

    const sm = new ProductionRunStateMachine(run);
    const media = run.mediaEvidence[shotId];
    if (!media) {
      throw new ProductionSafetyError(`Cannot reject shot "${shotId}": No media evidence recorded.`);
    }

    let approvalType = options?.approvalType;
    if (!approvalType) {
      approvalType = (options?.challengeId && options?.interactive) ? 'HUMAN' : 'SYSTEM';
    }

    if (approvalType === 'HUMAN') {
      if (!options?.challengeId || !options?.challengeNonce) {
        throw new ProductionSafetyError(
          `Cannot record rejection approvalType="HUMAN" without an explicit rejection challenge and nonce.`
        );
      }
      if (options?.interactive !== true) {
        throw new ProductionSafetyError(
          `Cannot record rejection approvalType="HUMAN" without an interactive session (interactive=true).`
        );
      }
      const challenge = run.approvalChallenges?.[options.challengeId];
      if (!challenge) {
        throw new ProductionSafetyError(
          `Rejection challenge "${options.challengeId}" not found for run "${runId}".`
        );
      }
      if (challenge.nonce !== options.challengeNonce) {
        throw new ProductionSafetyError(
          `Rejection challenge nonce mismatch for challenge "${options.challengeId}".`
        );
      }
      if (challenge.approvalAction !== 'REJECT') {
        throw new ProductionSafetyError(
          `Challenge "${options.challengeId}" is for action "${challenge.approvalAction}", not "REJECT".`
        );
      }
      if (challenge.runId !== runId || challenge.projectId !== projectId || challenge.shotId !== shotId) {
        throw new ProductionSafetyError(
          `Rejection challenge "${options.challengeId}" does not match target run/shot (${challenge.shotId} !== ${shotId}).`
        );
      }
      if (challenge.consumedAt !== null) {
        throw new ProductionSafetyError(
          `Rejection challenge "${options.challengeId}" has already been consumed at ${challenge.consumedAt}. Reused challenges are forbidden.`
        );
      }
      const now = new Date();
      if (now.getTime() > new Date(challenge.expiresAt).getTime()) {
        throw new ProductionSafetyError(
          `Rejection challenge "${options.challengeId}" expired at ${challenge.expiresAt}.`
        );
      }
      if (challenge.mediaSha256 !== media.sha256) {
        throw new ProductionSafetyError(
          `Rejection challenge media SHA-256 does not match recorded media SHA-256.`
        );
      }
      challenge.consumedAt = now.toISOString();
      await this.evidenceStore.saveApprovalChallenges(projectId, runId, run.approvalChallenges);
    }

    sm.recordApprovalEvidence({
      shotId,
      candidateAssetId: media.assetId,
      mediaSha256: media.sha256,
      status: 'REJECTED',
      approvalType,
      interactive: options?.interactive ?? false,
      challengeId: options?.challengeId,
      challengeNonce: options?.challengeNonce,
      actorId: options?.actorId,
      actorDisplayName: options?.actorDisplayName,
      approvalSource: options?.approvalSource,
      decidedBy,
      decidedAt: new Date().toISOString(),
      notes: reason,
    });

    sm.markShotBlocked(shotId);

    await this.evidenceStore.saveApprovalEvidence(projectId, runId, sm.getRun().approvalEvidence);

    sm.setResumeMetadata({
      canResume: true,
      targetShotId: shotId,
      nextAction: `Candidate shot "${shotId}" was rejected: ${reason}. Retake or re-generation required.`,
      recommendedCommand: `studio video retake ${projectId} ${shotId} --reason "${reason}"`,
      blockedReason: `Shot "${shotId}" rejected: ${reason}`,
    });

    await this.repository.save(sm.getRun());
    return sm.getRun();
  }
}
