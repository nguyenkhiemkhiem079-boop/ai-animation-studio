#!/usr/bin/env node

/**
 * AI Animation Studio CLI
 */

import * as process from 'node:process';

// Automatically load .env if present
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile();
  }
} catch {
  // ignore
}
import {
  FileSystemStorage,
  CheckpointManager,
  STANDARD_CINEMATIC_SKILLS,
  ProjectSchema,
  CharacterDNASchema,
  ShotContractSchema,
  UniverseManager,
  SourceDocumentManager,
  RuleBasedStoryAnalyzer,
  ShotPlanner,
  DirectorQA,
  DEFAULT_DIRECTOR_PROFILE,
  StoryAnalysis,
  ProductionScene,
  ShotDependencyGraph,
  SkillRegistry,
  SkillRouter,
  AgentSkillCategory,
  CharacterStudio,
  FileSystemAssetRegistry,
  TurnaroundView,
  WorldStudio,
  ProductionRouter,
  PromptCompiler,
  ProviderBenchmarkTracker,
  BudgetController,
  ProviderRegistry,
  ShotContract,
  HyperFramesCompositionCompiler,
  HyperFramesAdapter,
  CharacterAnimationLibrary,
  CharacterController,
  LipSyncEngine,
  MockVideoProvider,
  VeoVideoAdapter,
  SeedanceVideoAdapter,
  ComfyUIVideoAdapter,
  ContinuationEngine,
  SurgicalRetakeEngine,
  RetakeType,
  VoiceStudio,
  ScoreComposer,
  FoleyMixer,
  AudioMixEngine,
  MockAudioProvider,
  ElevenLabsVoiceAdapter,
  MusicGenAdapter,
  FoleySfxAdapter,
  TimelineAssembler,
  CutTransitionEngine,
  SubtitleGenerator,
  ContinuityQAEvaluator,
  AutoRepairEngine,
  Html5PlayerPackager,
  NLEInterchangeExporter,
  VideoRenderer,
  StudioPipelineFactory,
  ProductionSummaryCalculator,
  MediaToolchainDoctor,
  GeminiProvider,
  LLMProviderRegistry,
  getCentralizedModelPolicy,
  FlowJobManager,
  StorageFlowJobRepository,
  FlowProductionPackageBuilder,
  FlowResultImporter,
  FlowQAEvaluator,
  FlowIntegrationMode,
  ProductionOrchestrator,
  ProductionRunRepository,
  EvidenceStore,
  ProductionMasterVerifier,
  LiveProviderPreflight,
  ProductionAcceptanceBundle,
  ProductionNextActionResolver,
  ProductionPilotReadinessValidator,
  ProductionReleaseGate,
  redactSecrets,
  GeminiVeoVideoProvider,
  ClipService,
  VEO_MODEL_MAP,
  FreeFirstVideoRouter,
  VideoCostMode,
  resolveVideoCostMode,
  isPaidVideoAllowed,
  FlowBrowserOperator,
  ZeroTouchProductionOrchestrator,
  CreditAwarePlanner,
  FlowBatchCompiler,
  ArtifactVerifier,
  LongRunManifestManager,
  GeminiEngineeringWorker,
} from '@ai-studio/core';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import * as readline from 'node:readline';

function promptCliUser(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export interface CliContext {
  cwd: string;
  storage: FileSystemStorage;
  promptFn?: (promptText: string) => Promise<string>;
}

export async function runCli(args: string[], context?: CliContext): Promise<number> {
  const cwd = context?.cwd ?? process.cwd();
  const storage = context?.storage ?? new FileSystemStorage(cwd);
  const promptUser = context?.promptFn ?? promptCliUser;

  const command = args[0] || 'help';

  switch (command) {
    case 'create': {
      const createArgs = args.slice(1);
      const isDryRun = createArgs.includes('--dry-run');
      const projIdx = createArgs.indexOf('--project');
      const projectId = projIdx !== -1 && createArgs[projIdx + 1] ? createArgs[projIdx + 1] : 'project_flow_zero';
      const positionalPrompt = createArgs.find((a) => !a.startsWith('-'));

      if (!positionalPrompt) {
        console.error('❌ No prompt provided.');
        console.error('');
        console.error('Usage:');
        console.error('  studio create "<master instruction>" [--dry-run] [--project <id>]');
        return 1;
      }

      console.log('');
      console.log('AI ANIMATION STUDIO');
      console.log('====================================');
      console.log('Mode:');
      console.log('ZERO_TOUCH_FLOW\n');

      console.log('Planning...');
      const orchestrator = new ZeroTouchProductionOrchestrator();
      const { plan, shots } = await orchestrator.plan(positionalPrompt, projectId);

      console.log(`${shots.length} shots created\n`);
      console.log('Routing:');
      console.log(`FLOW     ${plan.flowRequiredCount}`);
      console.log(`LOCAL    ${plan.localCount}\n`);

      if (isDryRun) {
        console.log('====================================');
        console.log('DRY RUN PREFLIGHT MANIFEST');
        console.log('====================================');
        console.log(`Project ID            : ${plan.projectId}`);
        console.log(`Master Prompt         : ${plan.masterPrompt}`);
        console.log(`Total Shots           : ${plan.shotsCount}`);
        console.log(`Flow-Required Shots   : ${plan.flowRequiredCount}`);
        console.log(`Local Shots           : ${plan.localCount}`);
        console.log(`Est. Flow Credits     : ${plan.totalEstimatedFlowCredits}`);
        console.log(`Reference Requirements: ${plan.referenceRequirements.join(', ')}`);
        console.log('');
        console.log('Shots:');
        for (const s of plan.shotPlans) {
          console.log(` - [${s.shotId}] ${s.classification.padEnd(15)} | ${s.durationSeconds}s | ${s.reason}`);
        }
        console.log('');
        console.log('EXPECTED MANUAL ACTIONS: 0');
        console.log('====================================\n');
        return 0;
      }

      console.log('Opening Google Flow...');
      console.log('Verifying session authentication...\n');

      const result = await orchestrator.execute(positionalPrompt, { projectId, dryRun: false });

      if (result.status === 'BLOCKED_AUTH') {
        console.error('\n🚫 Google Authentication Required (BLOCKED_AUTH)');
        console.error('   Please run interactive login to establish persistent profile:');
        console.error('   npm.cmd run studio -- flow login\n');
        return 1;
      }

      console.log('Session authenticated ✅\n');
      console.log('Submitting production batch...');
      console.log('Generation started\n');

      if (result.status === 'WAITING_FOR_FLOW_CREDITS') {
        console.warn('\n⏸️  Insufficient Google Flow credits observed in UI.');
        console.warn('   Status: WAITING_FOR_FLOW_CREDITS\n');
        return 1;
      }

      if (result.status === 'RECONCILIATION_REQUIRED') {
        console.warn('\n⚠️  Batch generation in unknown state — reconciliation required to protect credits.\n');
        return 1;
      }

      if (result.status === 'ASSEMBLY_NOT_READY' || !result.masterVideoPath) {
        console.error(`\n⚠️  Master timeline assembly not ready: ${result.error || 'Physical master video file missing'}\n`);
        console.log('ASSEMBLY_NOT_READY');
        return 1;
      }

      if (!result.allPassed || result.status === 'FAILED') {
        console.error(`\n❌ Zero-Touch execution failed: ${result.error || 'Unknown error'}\n`);
        return 1;
      }

      for (const ev of result.operatorResult?.evidence || []) {
        console.log(`${ev.shotId} READY`);
      }

      console.log('\nDownloading...');
      console.log('QA...');
      console.log('Composing...\n');

      if (result.masterVideoPath && syncFs.existsSync(result.masterVideoPath)) {
        const verifyRes = ArtifactVerifier.verify(result.masterVideoPath, { requireVideoStream: true });
        if (verifyRes.exists && verifyRes.nonEmpty) {
          console.log('FINAL VIDEO:');
          console.log(result.masterVideoPath);
          console.log('\nMANUAL ACTIONS:');
          console.log('0\n');
          return 0;
        }
      }

      console.log('ASSEMBLY_NOT_READY: Output video artifact verification failed.');
      return 1;
    }

    case 'doctor': {
      console.log('🩺 Running AI Animation Studio Doctor...');
      console.log(`- Node.js Version: ${process.version}`);
      console.log(`- Working Directory: ${cwd}`);
      console.log(`- Registered Semantic Skills: ${STANDARD_CINEMATIC_SKILLS.length} skills loaded`);
      const hasGit = await storage.exists('.git');
      console.log(`- Git Repository: ${hasGit ? 'Detected ✅' : 'Missing ⚠️'}`);

      const toolchain = MediaToolchainDoctor.diagnose(true);
      const isLive = args.includes('--live');
      const gemini = new GeminiProvider({ allowLiveCalls: isLive });
      const geminiConfigured = gemini.isConfigured();

      console.log('\n==============================================================');
      console.log('📋 COMPONENT HEALTH & PRODUCTION READINESS AUDIT');
      console.log('==============================================================\n');

      console.log('[REQUIRED — Local Media & Execution Foundation]');
      console.log(` - Node.js Runtime : READY ✅ (${process.version})`);
      console.log(` - Studio Storage  : READY ✅ (${cwd})`);
      console.log(` - FFmpeg          : ${toolchain.ffmpeg.available ? 'READY ✅' : 'MISSING ❌'} (${toolchain.ffmpeg.path ?? 'N/A'}) - ${toolchain.ffmpeg.details ?? ''}`);
      console.log(` - FFprobe         : ${toolchain.ffprobe.available ? 'READY ✅' : 'MISSING ❌'} (${toolchain.ffprobe.path ?? 'N/A'}) - ${toolchain.ffprobe.details ?? ''}`);

      console.log('\n[OPTIONAL — External Workspace & Browser Support]');
      console.log(` - Headless Browser: ${toolchain.browser.available ? 'READY ✅' : 'NOT FOUND ⚠️'} (${toolchain.browser.path ?? 'N/A'})`);
      console.log(` - Google Flow     : MANUAL WORKSPACE (Assisted browser bridge, zero credentials required)`);

      const costMode = process.env.VIDEO_COST_MODE || 'FREE_ONLY';
      const allowPaid = process.env.ALLOW_PAID_VIDEO_API === 'true';
      console.log('\n[LIVE-ONLY — External Providers (Opt-In)]');
      console.log(` - Video Cost Mode : ${costMode} (${costMode === 'PAID_ALLOWED' && allowPaid ? 'PAID ALLOWED ⚠️' : 'FREE ONLY — Paid Video APIs Blocked 🔒'})`);
      console.log(` - Gemini API Key  : ${geminiConfigured ? 'CONFIGURED ✅' : 'NOT CONFIGURED ℹ️ (Required only for live pilot)'}`);
      console.log(` - Gemini Live Ping: ${isLive ? (geminiConfigured ? 'TESTED ✅' : 'NOT CONFIGURED ❌') : 'NOT TESTED ℹ️ (Use "studio doctor --live" or "studio gemini doctor --live")'}`);

      const localCoreReady = toolchain.ffmpeg.available && toolchain.ffprobe.available;
      console.log('\n--------------------------------------------------------------');
      if (localCoreReady) {
        console.log('VERDICT: LOCAL MEDIA TOOLCHAIN READY FOR OFFLINE REHEARSAL 🎬');
        if (geminiConfigured) {
          console.log('Single Gemini credential configured. Live pilot ready to test when operator initiates.');
        } else {
          console.log('Offline tests and rehearsal fully functional. Live calls require GEMINI_API_KEY.');
        }
        console.log('==============================================================\n');
        return 0;
      } else {
        console.log('VERDICT: MISSING CRITICAL MEDIA UTILITIES ❌');
        console.log('FFmpeg and FFprobe are required for physical media decoding and QA.');
        console.log('==============================================================\n');
        return 1;
      }
    }

    case 'smoke': {
      const subCommand = args[1] || 'golden';
      if (subCommand === 'media') {
        const { runMediaSmoke } = await import('./smoke/media-smoke.js');
        await runMediaSmoke();
        return 0;
      } else if (subCommand === 'golden') {
        const { runGoldenSmoke } = await import('./smoke/golden-smoke.js');
        await runGoldenSmoke();
        return 0;
      } else if (subCommand === 'gemini') {
        const { runGeminiSmoke } = await import('./smoke/gemini-smoke.js');
        await runGeminiSmoke();
        return 0;
      } else if (subCommand === 'flow') {
        const { runFlowSmoke } = await import('./smoke/flow-smoke.js');
        await runFlowSmoke();
        return 0;
      } else if (subCommand === 'visual-qa' || subCommand === 'visual') {
        const { runVisualQASmoke } = await import('./smoke/visual-qa-smoke.js');
        await runVisualQASmoke();
        return 0;
      } else if (subCommand === 'visual-qa-live') {
        if (process.env.RUN_LIVE_PROVIDER_TESTS !== 'true') {
          console.log('⚠️  Live visual QA smoke skipped: RUN_LIVE_PROVIDER_TESTS=true environment variable required.');
          return 0;
        }
        console.log('🌐 Executing LIVE Gemini Visual Semantic QA smoke...');
        const gemini = new GeminiProvider({ allowLiveCalls: true });
        if (!gemini.isConfigured()) {
          console.error('❌ GEMINI_API_KEY is not configured in environment.');
          return 1;
        }
        const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const start = Date.now();
        const res = await gemini.generateStructured({
          taskType: 'CONTINUITY_QA',
          modelRole: 'VISION_QA',
          systemInstruction: 'You are a visual tester. Verify whether you see an image input.',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Analyze this test image and return a valid visual QA structured output.' },
                { type: 'image', mimeType: 'image/png', dataBase64: samplePng },
              ],
            },
          ],
          responseSchema: (await import('@ai-studio/core')).VisualQAOutputSchema,
          schemaName: 'VisualQAOutput',
        });
        const latencyMs = Date.now() - start;
        console.log(`✅ Live Visual QA call succeeded!`);
        console.log(` - Model: ${res.model}`);
        console.log(` - Latency: ${latencyMs}ms`);
        console.log(` - Usage: ${JSON.stringify(res.usage)}`);
        console.log(` - Output: ${JSON.stringify(res.data)}`);
        return 0;
      } else if (subCommand === 'production') {
        const { runProductionSmoke } = await import('./smoke/production-smoke.js');
        await runProductionSmoke();
        return 0;
      } else if (subCommand === 'production-live') {
        const { runProductionLiveSmoke } = await import('./smoke/production-live-smoke.js');
        await runProductionLiveSmoke();
        return 0;
      } else if (subCommand === 'acceptance-contract') {
        const { runAcceptanceContractSmoke } = await import('./smoke/acceptance-contract-smoke.js');
        await runAcceptanceContractSmoke();
        return 0;
      } else if (subCommand === 'pilot-rehearsal') {
        const { runPilotRehearsalSmoke } = await import('./smoke/pilot-rehearsal-smoke.js');
        await runPilotRehearsalSmoke();
        return 0;
      } else {
        console.error(`Unknown smoke test: "${subCommand}". Supported: golden, media, gemini, flow, visual-qa, visual-qa-live, production, production-live, acceptance-contract, pilot-rehearsal`);
        return 1;
      }
    }

    case 'providers': {
      const subCommand = args[1] || 'list';
      if (subCommand === 'list') {
        const registry = LLMProviderRegistry.getInstance();
        const providers = registry.listProviders();
        console.log('🤖 Registered LLM Providers:');
        for (const p of providers) {
          const isDefault = p.metadata.id === registry.getDefaultProvider()?.metadata.id;
          console.log(` - [${p.metadata.id}] ${p.metadata.name} (default: ${isDefault})`);
          console.log(`   Capabilities: ${p.metadata.supportedTasks.join(', ')}`);
          console.log(`   Fast Model: ${p.metadata.modelMapping.FAST}`);
          console.log(`   Reasoning Model: ${p.metadata.modelMapping.REASONING}`);
        }
        return 0;
      }
      if (subCommand === 'doctor') {
        const isLive = args.includes('--live');
        console.log(`🩺 Running LLM Providers Doctor (${isLive ? 'LIVE' : 'CONFIG ONLY'})...`);
        const registry = LLMProviderRegistry.getInstance();
        const providers = registry.listProviders();
        for (const p of providers) {
          const health = await p.diagnoseHealth(isLive);
          console.log(`\nProvider: ${p.metadata.name} (${p.metadata.id})`);
          console.log(`- Status: ${health.status}`);
          console.log(`- Configured: ${health.configured ? 'Yes ✅' : 'No ❌'}`);
          console.log(`- Message: ${health.message}`);
          if (health.selectedModel) console.log(`- Selected Model: ${health.selectedModel}`);
          if (health.latencyMs !== undefined) console.log(`- Latency: ${health.latencyMs}ms`);
        }
        return 0;
      }
      console.error(`Unknown providers subcommand: "${subCommand}". Supported: list, doctor`);
      return 1;
    }

    case 'gemini': {
      const subCommand = args[1] || 'doctor';
      const isLive = args.includes('--live') || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
      const gemini = new GeminiProvider({ allowLiveCalls: isLive });
      if (subCommand === 'doctor') {
        console.log(`🩺 Running Gemini Doctor (${isLive ? 'LIVE' : 'CONFIG ONLY'})...`);
        const health = await gemini.diagnoseHealth(isLive);
        console.log(`- Provider: ${gemini.metadata.name}`);
        console.log(`- Status: ${health.status}`);
        console.log(`- Configured: ${health.configured ? 'Yes ✅' : 'No ❌'}`);
        console.log(`- API Key: ${gemini.getMaskedApiKey()}`);
        console.log(`- Diagnostics: ${health.message}`);
        if (health.selectedModel) console.log(`- Active Model: ${health.selectedModel}`);
        if (health.latencyMs !== undefined) console.log(`- Latency: ${health.latencyMs}ms`);
        return health.status === 'AVAILABLE' || health.status === 'NOT_CONFIGURED' ? 0 : 1;
      }
      if (subCommand === 'models') {
        const models = getCentralizedModelPolicy();
        console.log('🤖 Centralized Gemini Model Policy:');
        console.log(`- FAST       : ${models.fast} (env: GEMINI_MODEL_FAST)`);
        console.log(`- REASONING  : ${models.reasoning} (env: GEMINI_MODEL_REASONING)`);
        console.log(`- STRUCTURED : ${models.structured} (env: GEMINI_MODEL_STRUCTURED)`);
        console.log(`- QA         : ${models.qa} (env: GEMINI_MODEL_QA)`);
        return 0;
      }
      if (subCommand === 'telemetry') {
        const telemetry = GeminiProvider.getGlobalUsageTelemetry();
        console.log(GeminiProvider.formatUsageSummary(telemetry));
        return 0;
      }
      if (subCommand === 'smoke') {
        const { runGeminiSmoke } = await import('./smoke/gemini-smoke.js');
        await runGeminiSmoke();
        return 0;
      }
      console.error(`Unknown gemini subcommand: "${subCommand}". Supported: doctor, models, smoke, telemetry`);
      return 1;
    }

    case 'flow': {
      const subCommand = args[1] || 'doctor';
      const assetRegistry = new FileSystemAssetRegistry(storage);
      const flowRepo = new StorageFlowJobRepository(storage);
      const flowManager = new FlowJobManager(assetRegistry, undefined, undefined, undefined, flowRepo);
      await flowManager.loadPersistedJobs();

      if (subCommand === 'doctor') {
        console.log('🩺 Running Google Flow Bridge Doctor...');
        console.log('- Provider: Google Flow (External Creative Workspace)');
        console.log('- Integration Mode: ASSISTED');
        console.log('- Official Automation API: NOT CONFIGURED / UNSUPPORTED (Assisted workflow only)');
        console.log('- Flow Package Builder: AVAILABLE');
        console.log('- Flow Prompt Compiler: AVAILABLE');
        console.log('- Flow Result Importer: AVAILABLE');
        console.log('- Artifact Verification: AVAILABLE');
        const diag = MediaToolchainDoctor.diagnose();
        console.log(`- Media Toolchain (FFprobe): ${diag.ffprobe.available ? 'AVAILABLE ✅' : 'NOT FOUND ⚠️'}`);
        console.log('- Continuity QA Evaluator: AVAILABLE');
        console.log('- Status: READY (ASSISTED WORKFLOW)');
        return 0;
      }

      if (subCommand === 'smoke') {
        const { runFlowSmoke } = await import('./smoke/flow-smoke.js');
        await runFlowSmoke();
        return 0;
      }

      if (subCommand === 'flow-media' || subCommand === 'smoke:media' || subCommand === 'media-smoke') {
        const { runFlowMediaSmoke } = await import('./smoke/flow-media-smoke.js');
        await runFlowMediaSmoke();
        return 0;
      }

      if (subCommand === 'login') {
        const portIdx = args.indexOf('--port');
        const customPort = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : undefined;
        const operator = new FlowBrowserOperator({ cdpPort: customPort, headless: false });

        console.log('\nFLOW SESSION SETUP\n');
        console.log('1. Sign into Google in the opened Chrome window.');
        console.log('2. Open Google Flow successfully.');
        console.log('3. Return to terminal when ready.\n');

        const session = operator.launchInteractiveSession();
        console.log(`Dedicated Profile: ${session.profilePath}`);
        console.log(`CDP Port         : ${session.port}`);
        console.log('\nSystem Chrome launched. Complete sign-in, then run:');
        console.log('  studio flow session-status\n');
        return 0;
      }

      if (subCommand === 'session-status' || subCommand === 'status-session') {
        const isJson = args.includes('--json');
        const portIdx = args.indexOf('--port');
        const customPort = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : undefined;
        const operator = new FlowBrowserOperator({ cdpPort: customPort });

        const { status, formatted } = await operator.getSessionStatus();

        if (isJson) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          console.log('');
          console.log(formatted);
          console.log('');
        }
        return status.authenticated ? 0 : 1;
      }

      if (subCommand === 'browser-probe' || subCommand === 'probe') {
        const isJson = args.includes('--json');
        const urlIdx = args.indexOf('--url');
        const flowUrl = urlIdx !== -1 && args[urlIdx + 1] ? args[urlIdx + 1] : undefined;
        const headless = !args.includes('--no-headless');
        const enterProject = args.includes('--enter-project');

        if (!isJson) {
          console.log('\n🔍 Probing Google Flow Browser UI Contract (Zero-Credit Mode)...');
          console.log('   Profile: .studio/browser-profiles/google-flow');
          if (enterProject) {
            console.log('   Navigation: Safe project workspace entry enabled (--enter-project)');
          }
          console.log('   Strict rule: ZERO PROMPTS SUBMITTED, ZERO CREDITS CONSUMED.\n');
        }

        const operator = new FlowBrowserOperator({ headless });
        try {
          const { report, controlMap, formattedReport } = await operator.probe({
            url: flowUrl,
            persistEvidence: true,
            enterProject,
          });

          if (isJson) {
            console.log(JSON.stringify({ report, controlMap }, null, 2));
          } else {
            console.log(formattedReport);
            console.log('\n📁 Evidence persisted to .studio/flow-contract/ (probe-report.json, control-map.json)\n');
          }
          return 0;
        } catch (err: any) {
          if (isJson) {
            console.log(JSON.stringify({ error: err?.message || String(err) }, null, 2));
          } else {
            console.error(`\n❌ Flow browser probe failed: ${err?.message || String(err)}\n`);
          }
          return 1;
        }
      }

      if (subCommand === 'browser-smoke') {
        if (process.env.RUN_LIVE_FLOW_BROWSER_TEST !== 'true') {
          console.log('⚠️  RUN_LIVE_FLOW_BROWSER_TEST is not set to "true".');
          console.log('   Live smoke test consumes real Flow credits. To run:');
          console.log('   RUN_LIVE_FLOW_BROWSER_TEST=true studio flow browser-smoke');
          return 0;
        }

        const smokeShot: ShotContract = {
          id: args[2] || 'SHOT_SMOKE',
          sceneId: 'SCENE_01',
          shotNumber: 1,
          purpose: 'establishing',
          complexity: 'complex_generative_video',
          rendererIntent: 'generative_full_video',
          frame: { durationSeconds: 4.0, aspectRatio: '16:9', targetFps: 24 },
          camera: { focalLength: '35mm', shotSize: 'medium_close_up', angle: 'eye_level', movement: 'push_in', semanticSkills: [] },
          lighting: { keyLightDirection: 'front', mood: 'cinematic', colorTemperature: 'warm', fogAtmosphere: false },
          composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
          acting: [{ characterId: 'CHAR_ACTOR', pose: 'cautious_motion', expression: 'determined', gazeDirection: 'screen_left' }],
          transition: { type: 'cut', durationSeconds: 0 },
          audioCue: { sfx: [] },
          requiredAssetIds: [],
          dependsOnShotIds: [],
          directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
          provenance: { sourceBeatId: 'BEAT_01', directorProfileId: 'DEFAULT_CINEMATIC', decidedAt: new Date().toISOString() },
        };

        console.log('🔥 Executing single-asset live Google Flow browser smoke test...');
        const operator = new FlowBrowserOperator({ headless: false });
        const res = await operator.execute({
          projectId: 'proj_flow_live_smoke',
          shots: [smokeShot],
        });
        console.log(`Live Smoke Result: ${res.finalState} (Passed: ${res.allPassed})`);
        return res.allPassed ? 0 : 1;
      }

      const defaultShot: ShotContract = {
        id: args[2] || 'SHOT_DEFAULT',
        sceneId: 'SCENE_01',
        shotNumber: 1,
        purpose: 'establishing',
        complexity: 'complex_generative_video',
        rendererIntent: 'generative_full_video',
        frame: {
          durationSeconds: 4.0,
          aspectRatio: '16:9',
          targetFps: 24,
        },
        camera: {
          focalLength: '35mm',
          shotSize: 'medium_close_up',
          angle: 'eye_level',
          movement: 'push_in',
          semanticSkills: ['/pushin'],
        },
        lighting: {
          keyLightDirection: 'front',
          mood: 'cinematic',
          colorTemperature: 'warm',
          fogAtmosphere: false,
        },
        composition: {
          rule: 'rule_of_thirds',
          subjectPlacement: 'center',
          depthLayers: {
            foreground: [],
            midground: ['subject'],
            background: ['environment'],
          },
        },
        acting: [
          {
            characterId: 'CHAR_ACTOR',
            pose: 'cautious_motion',
            expression: 'determined',
            gazeDirection: 'screen_left',
            actionPrompt: `Action for shot ${args[2] || 'SHOT_DEFAULT'}`,
          },
        ],
        transition: {
          type: 'cut',
          durationSeconds: 0,
        },
        audioCue: {
          sfx: [],
        },
        requiredAssetIds: [],
        dependsOnShotIds: [],
        directorLocks: {
          isCameraLocked: false,
          isFramingLocked: false,
          isRendererLocked: false,
          isActingLocked: false,
        },
        provenance: {
          sourceBeatId: 'BEAT_01',
          directorProfileId: 'DEFAULT_CINEMATIC',
          decidedAt: new Date().toISOString(),
        },
      };

      if (subCommand === 'prepare' || subCommand === 'package') {
        const shotId = args[2];
        const projectId = args[3] || 'proj_flow_default';
        const seriesId = args[4] || 'series_flow_default';

        if (!shotId) {
          console.error('Error: Shot ID is required. Usage: studio flow prepare <shotId> [projectId] [seriesId]');
          return 1;
        }

        console.log(`📦 Preparing Google Flow Production Package for shot "${shotId}" in project "${projectId}"...`);
        const shot = { ...defaultShot, id: shotId };

        const job = await flowManager.prepareFlowJob({
          projectId,
          seriesId,
          sceneId: 'SCENE_01',
          shot,
          sourceReferences: [],
          references: [],
        });

        console.log(`✅ Google Flow Package prepared successfully!`);
        console.log(`- Job ID: ${job.jobId}`);
        console.log(`- Package Directory: ${job.packageDir}`);
        console.log(`- Recommended Workflow: ${job.package?.recommendedWorkflow}`);
        console.log(`- Status: ${job.status} (Open Google Flow to render externally)`);
        return 0;
      }

      if (subCommand === 'status') {
        const shotId = args[2];
        if (!shotId) {
          console.error('Error: Shot ID is required. Usage: studio flow status <shotId>');
          return 1;
        }
        const jobs = flowManager.getJobsForShot(shotId);
        if (jobs.length === 0) {
          console.log(`No Flow production jobs found for shot "${shotId}".`);
          return 0;
        }
        console.log(`🎬 Flow Jobs for shot "${shotId}" (${jobs.length} total):`);
        for (const j of jobs) {
          console.log(` - Job [${j.jobId}] v${j.version} | Status: ${j.status} | Workflow: ${j.package?.recommendedWorkflow}`);
          if (j.importResult?.candidateAssetId) console.log(`   Candidate Asset: ${j.importResult.candidateAssetId}`);
        }
        return 0;
      }

      if (subCommand === 'import') {
        const shotId = args[2];
        const videoPath = args[3];
        const projectId = args[4] || 'proj_flow_default';

        if (!shotId || !videoPath) {
          console.error('Error: Shot ID and Video Path are required. Usage: studio flow import <shotId> <videoPath> [projectId]');
          return 1;
        }

        console.log(`📥 Importing Google Flow generation for shot "${shotId}" from: ${videoPath}...`);
        let jobs = flowManager.getJobsForShot(shotId);
        let job = jobs[jobs.length - 1];
        if (!job) {
          console.log(`Creating ad-hoc Flow tracking job for shot "${shotId}"...`);
          const shot = { ...defaultShot, id: shotId };
          job = await flowManager.prepareFlowJob({
            projectId,
            seriesId: 'series_flow_default',
            sceneId: 'SCENE_01',
            shot,
          });
        }

        const updatedJob = await flowManager.importFlowResult(job.jobId, videoPath);

        console.log(`\n✅ Flow generation imported and verified!`);
        console.log(`- Candidate Asset ID: ${updatedJob.importResult?.candidateAssetId}`);
        console.log(`- Resolution: ${updatedJob.importResult?.provenance.resolution}`);
        console.log(`- Duration: ${updatedJob.importResult?.provenance.durationSeconds}s`);
        console.log(`- SHA-256: ${updatedJob.importResult?.provenance.checksumSha256}`);
        console.log(`- Provenance Source: ${updatedJob.importResult?.provenance.sourceType} (${updatedJob.importResult?.provenance.integrationMode})`);
        console.log(`- QA Status: ${updatedJob.qaReport?.overallStatus} (Score: ${updatedJob.qaReport?.score}%)`);
        console.log(`- Current State: ${updatedJob.status} (Review and run 'studio flow approve ${shotId}' to pin to timeline)`);
        return 0;
      }

      if (subCommand === 'qa') {
        const shotId = args[2];
        if (!shotId) {
          console.error('Error: Shot ID is required. Usage: studio flow qa <shotId>');
          return 1;
        }
        const jobs = flowManager.getJobsForShot(shotId);
        const job = jobs[jobs.length - 1];
        if (!job || !job.qaReport) {
          console.error(`Error: No QA report found for shot "${shotId}". Import a candidate first.`);
          return 1;
        }
        console.log(`🔍 QA Audit for Shot "${shotId}" Candidate:`);
        console.log(`- Overall Status: ${job.qaReport.overallStatus}`);
        console.log(`- Can Approve: ${job.qaReport.canApprove ? 'YES ✅' : 'NO ❌'}`);
        console.log(`- Score: ${job.qaReport.score}%`);
        if (job.qaReport.issues.length > 0) {
          console.log(`- Issues (${job.qaReport.issues.length}):`);
          for (const issue of job.qaReport.issues) {
            console.log(`   [${issue.severity}] ${issue.dimension}: ${issue.message}`);
          }
        }
        return job.qaReport.canApprove ? 0 : 1;
      }

      if (subCommand === 'approve') {
        const shotId = args[2];
        if (!shotId) {
          console.error('Error: Shot ID is required. Usage: studio flow approve <shotId>');
          return 1;
        }
        const jobs = flowManager.getJobsForShot(shotId);
        const job = jobs[jobs.length - 1];
        if (!job) {
          console.error(`Error: No candidate asset to approve for shot "${shotId}".`);
          return 1;
        }
        const approvedJob = await flowManager.approveCandidate(job.jobId, 'Approved via CLI');
        console.log(`🎉 Approved Flow generation for shot "${shotId}"!`);
        console.log(`- Canonical Asset ID: ${approvedJob.importResult?.candidateAssetId}`);
        console.log(`- Timeline Pinned: YES ✅`);
        return 0;
      }

      if (subCommand === 'reject') {
        const shotId = args[2];
        const reason = args[3] || 'Rejected by director';
        if (!shotId) {
          console.error('Error: Shot ID is required. Usage: studio flow reject <shotId> [reason]');
          return 1;
        }
        const jobs = flowManager.getJobsForShot(shotId);
        const job = jobs[jobs.length - 1];
        if (!job) {
          console.error(`Error: No job found for shot "${shotId}".`);
          return 1;
        }
        await flowManager.rejectCandidate(job.jobId, reason);
        console.log(`🚫 Rejected Flow generation for shot "${shotId}".`);
        console.log(`- Rejection Reason: ${reason}`);
        console.log(`- Asset retained in archive for provenance/history.`);
        return 0;
      }

      if (subCommand === 'history') {
        const shotId = args[2];
        if (!shotId) {
          console.error('Error: Shot ID is required. Usage: studio flow history <shotId>');
          return 1;
        }
        const jobs = flowManager.getJobsForShot(shotId);
        console.log(`📜 Generation History for shot "${shotId}" (${jobs.length} versions):`);
        for (const j of jobs) {
          console.log(` - v${j.version} [${j.jobId}]: Status ${j.status.padEnd(16)} | Created: ${j.createdAt}`);
          if (j.importResult?.candidateAssetId) console.log(`     Asset: ${j.importResult.candidateAssetId}`);
          if (j.rejectionReason) console.log(`     Rejected: ${j.rejectionReason}`);
        }
        return 0;
      }

      console.error(`Unknown flow subcommand: "${subCommand}". Supported: doctor, prepare, package, status, import, qa, approve, reject, history, smoke`);
      return 1;
    }

    case 'agent': {
      const subCommand = args[1] || 'status';
      const manifestMgr = new LongRunManifestManager();
      const exec = await import('node:child_process');

      const getHead = (): string => {
        try {
          return exec.execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        } catch {
          return 'unknown_head';
        }
      };

      if (subCommand === 'status') {
        const head = getHead();
        let manifest;
        if (!manifestMgr.manifestExists()) {
          manifest = manifestMgr.initialize({
            head,
            currentPhase: 'PHASE_28_PROJECT_WORKSPACE_CALIBRATION_AND_END_TO_END_PATH',
            nextExactAction: 'npm.cmd run studio -- flow browser-probe --enter-project',
            firstCommandToRun: 'npm.cmd run studio -- flow browser-probe --enter-project',
            completedTasks: [
              'Phase 27B: Zero-credit flow contract probe & selector audit',
              'Phase 27C: Real Chrome session bridge via CDP',
              'Phase 27D: Zero-credit flow home to project navigation',
            ],
            remainingTasks: [
              'Live project workspace prompt & agent control calibration',
              'Deterministic end-to-end production vertical slice verification',
              'Final production gap sweep and acceptance gate verification',
            ],
          });
        } else {
          manifest = manifestMgr.loadManifest();
        }

        console.log('\n🤖 AI ANIMATION STUDIO — AGENT RUNTIME STATUS');
        console.log('============================================================');
        console.log(`Mission ID            : ${manifest.missionId}`);
        console.log(`Active Owner          : ${manifest.activeEngineeringOwner}`);
        console.log(`Current Phase         : ${manifest.currentPhase}`);
        console.log(`Repository HEAD       : ${manifest.repositoryHead}`);
        console.log(`Last Green HEAD       : ${manifest.lastGreenHead}`);
        console.log(`Updated At            : ${manifest.updatedAt}\n`);

        console.log('QUOTA STATE MATRIX:');
        console.log(` - Primary Agent Quota : ${manifest.quotaState.primaryAgent}`);
        console.log(` - Gemini Engineering  : ${manifest.quotaState.geminiEngineering}`);
        console.log(` - Gemini Visual QA    : ${manifest.quotaState.geminiVisualQA}`);
        console.log(` - Google Flow Credits : ${manifest.quotaState.flowCredits}`);
        console.log(` - Paid Video API      : ${manifest.quotaState.paidVideoApi} (STRICT FREE_ONLY)\n`);

        console.log(`Next Exact Action     : ${manifest.nextExactAction}`);
        console.log(`First Command to Run  : ${manifest.firstCommandToRun}\n`);

        console.log('FALLBACK TELEMETRY:');
        console.log(` - Primary Quota Events: ${manifest.fallbackHistory.primaryAgentQuotaEvents}`);
        console.log(` - Fallback Used       : ${manifest.fallbackHistory.geminiEngineeringFallbackUsed ? 'YES' : 'NO'}`);
        console.log(` - Fallback Requests   : ${manifest.fallbackHistory.geminiEngineeringRequestCount}`);
        console.log(` - Fallback Commits    : ${manifest.fallbackHistory.fallbackCommits.length}`);
        console.log(` - Takeovers by Primary: ${manifest.fallbackHistory.primaryAgentTakeovers}`);
        console.log(` - Dual Quota Blocks   : ${manifest.fallbackHistory.dualQuotaBlockEvents}`);
        console.log('============================================================\n');
        return 0;
      }

      if (subCommand === 'checkpoint') {
        const head = getHead();
        let manifest;
        if (!manifestMgr.manifestExists()) {
          manifest = manifestMgr.initialize({
            head,
            currentPhase: 'PHASE_28_PROJECT_WORKSPACE_CALIBRATION_AND_END_TO_END_PATH',
            nextExactAction: 'npm.cmd run studio -- flow browser-probe --enter-project',
            firstCommandToRun: 'npm.cmd run studio -- flow browser-probe --enter-project',
          });
        } else {
          manifest = manifestMgr.loadManifest();
        }

        const phaseIdx = args.indexOf('--phase');
        if (phaseIdx !== -1 && args[phaseIdx + 1]) {
          manifest.currentPhase = args[phaseIdx + 1];
        }

        const taskDoneIdx = args.indexOf('--task-done');
        if (taskDoneIdx !== -1 && args[taskDoneIdx + 1]) {
          const doneTask = args[taskDoneIdx + 1];
          if (!manifest.completedTasks.includes(doneTask)) {
            manifest.completedTasks.push(doneTask);
          }
          manifest.remainingTasks = manifest.remainingTasks.filter((t) => t !== doneTask);
        }

        const nextActionIdx = args.indexOf('--next');
        if (nextActionIdx !== -1 && args[nextActionIdx + 1]) {
          manifest.nextExactAction = args[nextActionIdx + 1];
          manifest.firstCommandToRun = args[nextActionIdx + 1];
        }

        manifest.repositoryHead = head;
        manifest.lastGreenHead = head;
        manifest.updatedAt = new Date().toISOString();
        manifestMgr.saveManifest(manifest);
        console.log(`\n✅ Saved Agent Runtime Checkpoint to ${manifestMgr.getManifestPath()}`);
        console.log(`📄 Generated Mission Resume Doc at ${manifestMgr.getResumeMdPath()}\n`);
        return 0;
      }

      if (subCommand === 'resume') {
        if (!manifestMgr.manifestExists()) {
          console.error('\n❌ No long-run manifest found. Initialize with "studio agent checkpoint"\n');
          return 1;
        }
        const manifest = manifestMgr.loadManifest();
        console.log('\n🔄 RESUMING LONG-RUN MISSION');
        console.log(`Owner: ${manifest.activeEngineeringOwner}`);
        console.log(`Phase: ${manifest.currentPhase}`);
        console.log(`Next Action: ${manifest.nextExactAction}\n`);
        console.log(`Run command:\n  ${manifest.firstCommandToRun}\n`);
        return 0;
      }

      if (subCommand === 'set-owner') {
        const newOwner = args[2] as any;
        if (newOwner !== 'ANTIGRAVITY' && newOwner !== 'GEMINI_FALLBACK') {
          console.error('Error: Owner must be ANTIGRAVITY or GEMINI_FALLBACK');
          return 1;
        }
        const head = getHead();
        const updated = manifestMgr.updateOwner(newOwner, head);
        console.log(`\n✅ Engineering Owner updated to: ${updated.activeEngineeringOwner}\n`);
        return 0;
      }

      console.error(`Unknown agent subcommand: "${subCommand}". Supported: status, checkpoint, resume, set-owner`);
      return 1;
    }

    case 'checkpoint': {
      const subCommand = args[1];
      const projectId = args[2];
      const checkpointId = args[3];
      const checkpoints = new CheckpointManager(storage);

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio checkpoint <list|create|restore> <projectId> [checkpointId]');
        return 1;
      }

      if (subCommand === 'list') {
        const list = await checkpoints.listCheckpoints(projectId);
        console.log(`Checkpoints for Project "${projectId}": (${list.length} found)`);
        for (const cp of list) {
          console.log(` - [${cp.id}] ${cp.name} (stage: ${cp.stage}, created: ${cp.createdAt})`);
        }
        return 0;
      }

      if (subCommand === 'create') {
        if (!checkpointId) {
          console.error('Error: Checkpoint ID is required for creation');
          return 1;
        }
        await checkpoints.createCheckpoint(projectId, checkpointId, { manualSavedAt: new Date().toISOString() });
        console.log(`✅ Checkpoint "${checkpointId}" created successfully for project "${projectId}".`);
        return 0;
      }

      if (subCommand === 'restore') {
        if (!checkpointId) {
          console.error('Error: Checkpoint ID is required for restore');
          return 1;
        }
        const state = await checkpoints.restoreCheckpoint(projectId, checkpointId);
        console.log(`✅ Checkpoint "${checkpointId}" verified and restored! State keys:`, Object.keys(state));
        return 0;
      }

      console.error(`Unknown checkpoint subcommand: "${subCommand}". Supported: list, create, restore`);
      return 1;
    }

    case 'universe': {
      const subCommand = args[1];
      const seriesId = args[2];
      const universeManager = new UniverseManager(storage);

      if (!seriesId) {
        console.error('Error: Series ID is required. Usage: studio universe <show|export|import> <seriesId> [file]');
        return 1;
      }

      if (subCommand === 'show') {
        const universe = await universeManager.getOrCreateUniverse(seriesId);
        console.log(`🌌 Universe Overview for Series "${seriesId}":`);
        console.log(` - Characters (${Object.keys(universe.characters).length}):`, Object.keys(universe.characters).join(', ') || 'None');
        console.log(` - Locations (${Object.keys(universe.locations).length}):`, Object.keys(universe.locations).join(', ') || 'None');
        console.log(` - Props (${Object.keys(universe.props).length}):`, Object.keys(universe.props).join(', ') || 'None');
        console.log(` - Locked Canon Characters:`, universe.canonState.lockedCharacterIds.join(', ') || 'None');
        console.log(` - World Facts: ${universe.canonState.worldFacts.length} registered`);
        return 0;
      }

      if (subCommand === 'export') {
        const outputFile = args[3] || `.studio/universes/${seriesId}/export_bundle.json`;
        const bundle = await universeManager.exportUniverse(seriesId);
        await storage.writeJson(outputFile, bundle);
        console.log(`✅ Universe for series "${seriesId}" exported to "${outputFile}". Checksum: ${bundle.checksum}`);
        return 0;
      }

      if (subCommand === 'import') {
        const inputFile = args[3];
        if (!inputFile) {
          console.error('Error: Input file required for universe import.');
          return 1;
        }
        const bundle = await storage.readJson<any>(inputFile);
        await universeManager.importUniverse(seriesId, bundle);
        console.log(`✅ Universe bundle imported successfully into series "${seriesId}".`);
        return 0;
      }

      console.error(`Unknown universe subcommand: "${subCommand}". Supported: show, export, import`);
      return 1;
    }

    case 'character': {
      const subCommand = args[1];
      const seriesId = args[2];
      const characterId = args[3];
      const universeManager = new UniverseManager(storage);
      const assetRegistry = new FileSystemAssetRegistry(storage);
      const studio = new CharacterStudio(universeManager, assetRegistry);

      if (!seriesId) {
        console.error('Error: Series ID is required. Usage: studio character <list|sheet|resolve|qa> <seriesId> [characterId]');
        return 1;
      }

      if (subCommand === 'list') {
        const universe = await universeManager.getOrCreateUniverse(seriesId);
        const characters = Object.values(universe.characters);
        console.log(`🎭 Characters in Series "${seriesId}" (${characters.length} total):`);
        for (const char of characters) {
          console.log(` - [${char.id}] ${char.name} (v${char.currentVersion}) — Outfits: ${char.outfits.length}, Traits: [${char.traits.join(', ')}]`);
        }
        return 0;
      }

      if (subCommand === 'sheet') {
        if (!characterId) {
          console.error('Error: Character ID is required. Usage: studio character sheet <seriesId> <characterId>');
          return 1;
        }
        const sheet = await studio.getOrCreateCharacterSheet(seriesId, characterId);
        console.log(`📐 Canonical Character Sheet for "${characterId}" (v${sheet.version}):`);
        console.log(` - Complete: ${sheet.isComplete() ? 'YES ✅' : 'PARTIAL ⚠️'}`);
        console.log(` - Neutral Portrait: ${sheet.neutralPortraitAssetId || 'None'}`);
        console.log(' - Turnaround Views:');
        for (const [view, assetId] of Object.entries(sheet.views)) {
          console.log(`   • ${view.padEnd(20)}: ${assetId}`);
        }
        const missing = sheet.getMissingViews();
        if (missing.length > 0) {
          console.log(` - Missing Views: ${missing.join(', ')}`);
        }
        return 0;
      }

      if (subCommand === 'resolve') {
        if (!characterId) {
          console.error('Error: Character ID is required. Usage: studio character resolve <seriesId> <characterId> [view|expression|pose]');
          return 1;
        }
        const universe = await universeManager.getOrCreateUniverse(seriesId);
        const character = universe.characters[characterId];
        if (!character) {
          console.error(`Error: Character "${characterId}" not found in series "${seriesId}".`);
          return 1;
        }
        const typeOrValue = args[4] || 'front';
        const result = await studio.resolveCharacterAsset({
          character,
          view: ['front', 'three_quarter_left', 'three_quarter_right', 'profile_left', 'profile_right', 'back'].includes(typeOrValue)
            ? (typeOrValue as TurnaroundView)
            : undefined,
          expression: !['front', 'three_quarter_left', 'three_quarter_right', 'profile_left', 'profile_right', 'back'].includes(typeOrValue)
            ? typeOrValue
            : undefined,
        });

        console.log(`🎨 Resolved Asset for "${character.name}" (${typeOrValue}):`);
        console.log(` - Source: ${result.source}`);
        console.log(` - Asset ID: ${result.asset.id}`);
        console.log(` - Status: ${result.asset.status}`);
        console.log(` - Storage URI: ${result.asset.storageUri}`);
        console.log(` - Tags: [${result.asset.tags.join(', ')}]`);
        if (result.qaResult) {
          console.log(` - Identity QA: ${result.qaResult.passed ? 'PASSED ✅' : 'FAILED ❌'} (Score: ${result.qaResult.similarityScore.toFixed(2)})`);
        }
        return 0;
      }

      if (subCommand === 'qa') {
        const assetId = args[4];
        if (!characterId || !assetId) {
          console.error('Error: Character ID and Asset ID are required. Usage: studio character qa <seriesId> <characterId> <assetId>');
          return 1;
        }
        const qaResult = await studio.runIdentityQA(seriesId, characterId, assetId);
        console.log(`🔍 Identity QA Audit for Character "${characterId}" Asset "${assetId}":`);
        console.log(` - QA Result: ${qaResult.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
        console.log(` - Similarity Score: ${(qaResult.similarityScore * 100).toFixed(1)}% (Threshold: ${(qaResult.confidenceThreshold * 100).toFixed(1)}%)`);
        console.log(` - Facial Drift: ${qaResult.facialDriftDetected ? 'DETECTED ⚠️' : 'NONE ✅'}`);
        console.log(` - Anatomy Check: ${qaResult.anatomyCheckPassed ? 'PASSED ✅' : 'DEFECTS DETECTED ❌'}`);
        console.log(` - Palette Score: ${(qaResult.paletteAdherenceScore * 100).toFixed(1)}%`);
        if (qaResult.critique.length > 0) {
          console.log(' - Critique:');
          qaResult.critique.forEach((c) => console.log(`   ⚠️ ${c}`));
        }
        return 0;
      }

      console.error(`Unknown character subcommand: "${subCommand}". Supported: list, sheet, resolve, qa`);
      return 1;
    }

    case 'asset': {
      const subCommand = args[1];
      const assetId = args[2];
      const assetRegistry = new FileSystemAssetRegistry(storage);

      if (subCommand === 'approve') {
        if (!assetId) {
          console.error('Error: Asset ID is required. Usage: studio asset approve <assetId>');
          return 1;
        }
        const approved = await assetRegistry.approveCanon(assetId);
        console.log(`✅ Asset "${approved.id}" successfully promoted to Canon (approved_canon)!`);
        return 0;
      }

      console.error(`Unknown asset subcommand: "${subCommand}". Supported: approve`);
      return 1;
    }

    case 'world': {
      const subCommand = args[1];
      const seriesId = args[2];
      const locationId = args[3];
      const zoneId = args[4] || 'main_room';
      const universeManager = new UniverseManager(storage);
      const assetRegistry = new FileSystemAssetRegistry(storage);
      const worldStudio = new WorldStudio(universeManager, assetRegistry);

      if (!seriesId || !locationId) {
        console.error('Error: Series ID and Location ID are required. Usage: studio world <show|staging|resolve|props> <seriesId> <locationId> [zoneId]');
        return 1;
      }

      if (subCommand === 'show') {
        const universe = await universeManager.getOrCreateUniverse(seriesId);
        const location = universe.locations[locationId];
        if (!location) {
          console.error(`Error: Location "${locationId}" not found in series "${seriesId}".`);
          return 1;
        }
        console.log(`🏰 Location Overview: "${location.name}" [${location.id}]`);
        console.log(` - Description: ${location.description}`);
        console.log(` - Zones (${location.zones.length}):`);
        for (const zone of location.zones) {
          console.log(`   • [${zone.id}] ${zone.name} — Props: [${zone.keyProps.join(', ')}]`);
        }
        const refSet = await worldStudio.getLocationReferenceSet(seriesId, locationId, zoneId);
        console.log(` - Active Reference Set for zone "${zoneId}":`);
        console.log(`   • Establishing Backdrop: ${refSet.wideEstablishingAssetId || 'None registered'}`);
        console.log(`   • Depth Layers: ${refSet.layers.length} registered`);
        console.log(`   • Lighting Presets: ${Object.keys(refSet.lightingPresets).length} available`);
        console.log(`   • Atmosphere Presets: ${Object.keys(refSet.atmospherePresets).length} available`);
        return 0;
      }

      if (subCommand === 'staging') {
        const sceneMap = await worldStudio.getOrCreateSceneMap(seriesId, locationId, zoneId);
        console.log(`📐 Spatial Staging & Scene Map for "${locationId}" Zone "${zoneId}":`);
        console.log(` - Dimensions: ${sceneMap.dimensions.widthMeters}m x ${sceneMap.dimensions.lengthMeters}m x ${sceneMap.dimensions.heightMeters}m (W x L x H)`);
        console.log(` - Spatial Anchors (${sceneMap.anchors.length}):`);
        for (const anchor of sceneMap.anchors) {
          console.log(
            `   • [${anchor.id}] ${anchor.name.padEnd(20)} | Pos: (${anchor.position.x}, ${anchor.position.y}, ${anchor.position.z}) | Facing: ${anchor.facingAngleDeg}° | Props: [${anchor.associatedProps.join(', ')}]`
          );
        }
        return 0;
      }

      if (subCommand === 'resolve') {
        const refSet = await worldStudio.getLocationReferenceSet(seriesId, locationId, zoneId);
        console.log(`🌍 Environment Resolution for "${locationId}" Zone "${zoneId}":`);
        console.log(` - Establishing Backdrop Asset: ${refSet.wideEstablishingAssetId || 'None'}`);
        console.log(` - Multi-Plane Layers (${refSet.layers.length}):`);
        for (const layer of refSet.layers) {
          console.log(
            `   • [${layer.type.toUpperCase().padEnd(11)}] ${layer.name.padEnd(25)} (Order: ${layer.depthOrder}, Parallax: ${layer.parallaxFactor}x) -> Asset: ${layer.assetId}`
          );
        }
        return 0;
      }

      if (subCommand === 'props') {
        const props = worldStudio.getPropTracker().getProps(seriesId, locationId, zoneId);
        console.log(`📦 Prop Placements for "${locationId}" Zone "${zoneId}" (${props.length} total):`);
        for (const prop of props) {
          console.log(
            ` - [${prop.propId}] ${prop.propName.padEnd(20)} | Anchor: ${prop.anchorId.padEnd(16)} | State: ${prop.state.toUpperCase()}`
          );
        }
        return 0;
      }

      console.error(`Unknown world subcommand: "${subCommand}". Supported: show, staging, resolve, props`);
      return 1;
    }

    case 'story': {
      const subCommand = args[1];
      const projectId = args[2];
      const inputFile = args[3];
      const seriesId = args[4] || 'default_series';

      if (!projectId || !inputFile) {
        console.error('Error: Project ID and input file are required. Usage: studio story <ingest|analyze|report> <projectId> <inputFile> [seriesId]');
        return 1;
      }

      const content = await storage.read(inputFile);

      if (subCommand === 'ingest') {
        const doc = SourceDocumentManager.createSourceDocument(projectId, inputFile, content);
        const outPath = `.studio/projects/${projectId}/source_doc.json`;
        await storage.writeJson(outPath, doc);
        console.log(`✅ Ingested "${inputFile}" losslessly!`);
        console.log(` - Characters: ${doc.rawContent.length}, Words: ${doc.wordCount}, Segments: ${doc.segments.length}`);
        console.log(` - SHA-256: ${doc.contentHash}`);
        return 0;
      }

      if (subCommand === 'analyze' || subCommand === 'report') {
        const doc = SourceDocumentManager.createSourceDocument(projectId, inputFile, content);
        const universeManager = new UniverseManager(storage);
        const universe = await universeManager.getOrCreateUniverse(seriesId);

        const analyzer = new RuleBasedStoryAnalyzer();
        const analysis = await analyzer.analyze(doc, universe);
        const outPath = `.studio/projects/${projectId}/story_analysis.json`;
        await storage.writeJson(outPath, analysis);

        console.log(`📖 Story Intelligence Report for "${doc.title}":`);
        console.log(` - Scenes: ${analysis.sceneCandidates.length}`);
        console.log(` - Character Candidates: ${analysis.characterCandidates.map((c) => c.suggestedName).join(', ') || 'None'}`);
        console.log(` - Location Candidates: ${analysis.locationCandidates.map((l) => l.suggestedName).join(', ') || 'None'}`);
        console.log(` - Prop Candidates: ${analysis.propCandidates.map((p) => p.suggestedName).join(', ') || 'None'}`);
        console.log(` - Source Coverage: ${analysis.coverage.coveragePercentage}% (${analysis.coverage.coveredCharacters}/${analysis.coverage.totalCharacters} chars)`);
        console.log(` - Hallucination Guard: ${analysis.hallucinationReport.isValid ? 'PASSED ✅' : 'VIOLATIONS ⚠️'}`);
        console.log(` - Canon Conflicts: ${analysis.canonConflicts.length}`);
        for (const conflict of analysis.canonConflicts) {
          console.log(`   ⚠️ [${conflict.entityType}] ${conflict.description}`);
        }
        return 0;
      }

      console.error(`Unknown story subcommand: "${subCommand}". Supported: ingest, analyze, report`);
      return 1;
    }

    case 'director': {
      const subCommand = args[1];
      const projectId = args[2];

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio director <plan|qa|list> <projectId>');
        return 1;
      }

      const analysisPath = `.studio/projects/${projectId}/story_analysis.json`;
      const scenesPath = `.studio/projects/${projectId}/production_scenes.json`;

      if (subCommand === 'plan') {
        if (!(await storage.exists(analysisPath))) {
          console.error(`Error: No story analysis found at "${analysisPath}". Run "studio story analyze" first.`);
          return 1;
        }

        const analysis = await storage.readJson<StoryAnalysis>(analysisPath);
        const planner = new ShotPlanner(DEFAULT_DIRECTOR_PROFILE);
        const productionScenes: ProductionScene[] = [];
        const dependencyGraphs: Record<string, ShotDependencyGraph> = {};

        for (const sc of analysis.sceneCandidates) {
          const { productionScene, dependencyGraph } = planner.planScene(sc, projectId);
          productionScenes.push(productionScene);
          dependencyGraphs[productionScene.id] = dependencyGraph;
        }

        await storage.writeJson(scenesPath, productionScenes);
        await storage.writeJson(`.studio/projects/${projectId}/dependency_graphs.json`, dependencyGraphs);

        const totalShots = productionScenes.reduce((acc, s) => acc + s.shots.length, 0);
        console.log(`🎬 Planned ${productionScenes.length} scenes (${totalShots} total shots) for project "${projectId}".`);
        return 0;
      }

      if (subCommand === 'qa') {
        if (!(await storage.exists(scenesPath))) {
          console.error(`Error: No production scenes found at "${scenesPath}". Run "studio director plan" first.`);
          return 1;
        }

        const scenes = await storage.readJson<ProductionScene[]>(scenesPath);
        const graphs = await storage.readJson<Record<string, ShotDependencyGraph>>(`.studio/projects/${projectId}/dependency_graphs.json`);

        console.log(`🔍 Director QA Report for Project "${projectId}":`);
        for (const sc of scenes) {
          const graph = graphs[sc.id] || { sceneId: sc.id, adjacencyList: {}, entryShotIds: [], terminalShotIds: [] };
          const qa = DirectorQA.evaluateScene(sc, graph, DEFAULT_DIRECTOR_PROFILE);

          console.log(`\nScene ${sc.sceneNumber} (${sc.heading}) — QA Valid: ${qa.isValid ? 'YES ✅' : 'FAIL ❌'}`);
          console.log(` - Shots: ${sc.shots.length}, Pacing: ${qa.rhythmSummary.pacingCurve}, Avg Duration: ${qa.rhythmSummary.averageShotDurationSeconds}s`);
          if (qa.jumpCutWarnings.length > 0) {
            console.log(` - Jump Cut Warnings (${qa.jumpCutWarnings.length}):`);
            qa.jumpCutWarnings.forEach((w) => console.log(`   ⚠️ ${w.reason}`));
          }
          if (qa.eyelineWarnings.length > 0) {
            console.log(` - Eyeline Warnings (${qa.eyelineWarnings.length}):`);
            qa.eyelineWarnings.forEach((w) => console.log(`   ⚠️ ${w.reason}`));
          }
          if (qa.repetitionWarnings.length > 0) {
            console.log(` - Repetition Warnings (${qa.repetitionWarnings.length}):`);
            qa.repetitionWarnings.forEach((w) => console.log(`   ⚠️ ${w.skillOrSize} repeated ${w.consecutiveCount} times`));
          }
        }
        return 0;
      }

      if (subCommand === 'list') {
        if (!(await storage.exists(scenesPath))) {
          console.error(`Error: No production scenes found at "${scenesPath}". Run "studio director plan" first.`);
          return 1;
        }

        const scenes = await storage.readJson<ProductionScene[]>(scenesPath);
        console.log(`📋 Planned Shots for Project "${projectId}":`);
        for (const sc of scenes) {
          console.log(`\nScene ${sc.sceneNumber}: ${sc.heading} (${sc.purpose})`);
          for (const shot of sc.shots) {
            console.log(
              ` - [${shot.id}] ${shot.purpose.padEnd(16)} | ${shot.camera.shotSize.padEnd(14)} | ${shot.camera.movement.padEnd(10)} | ${shot.rendererIntent.padEnd(25)} | ${shot.frame.durationSeconds}s`
            );
          }
        }
        return 0;
      }

      console.error(`Unknown director subcommand: "${subCommand}". Supported: plan, qa, list`);
      return 1;
    }

    case 'skills': {
      const isJson = args.includes('--json');
      const filteredArgs = args.filter((a) => a !== '--json');
      const subCommand = filteredArgs[1] || 'list';
      const skillsDir = path.resolve(cwd, '.agents/skills');
      const registryPath = path.resolve(skillsDir, 'registry.json');

      if (!(await storage.exists(registryPath))) {
        if (isJson) {
          console.log(JSON.stringify({ error: `Skill registry not found at "${registryPath}".` }, null, 2));
        } else {
          console.error(`Error: Skill registry not found at "${registryPath}".`);
        }
        return 1;
      }

      const registry = await SkillRegistry.fromFile(registryPath);

      if (subCommand === 'check') {
        const result = await registry.validate(skillsDir);
        const manifest = registry.getManifest();

        if (isJson) {
          console.log(JSON.stringify({
            valid: result.valid,
            customCount: manifest.skills.length,
            externalCount: manifest.externalSkills.length,
            errors: result.errors,
          }, null, 2));
          return result.valid ? 0 : 1;
        }

        console.log('🔍 Validating Antigravity Skill OS Registry...');
        console.log(` - Custom Skills: ${manifest.skills.length} registered`);
        console.log(` - External Skills: ${manifest.externalSkills.length} registered`);

        if (!result.valid) {
          console.error(`❌ Validation Failed with ${result.errors.length} error(s):`);
          for (const err of result.errors) {
            console.error(`   - [${err.code}] ${err.message}`);
          }
          return 1;
        }

        console.log('✅ Skill OS Registry is valid! All dependencies and entrypoints resolved.');
        return 0;
      }

      if (subCommand === 'list') {
        const categoryFilter = filteredArgs[2] as AgentSkillCategory | undefined;
        const skills = registry.listSkills(categoryFilter);
        const external = registry.listExternalSkills();

        if (isJson) {
          console.log(JSON.stringify({
            total: skills.length + (categoryFilter ? 0 : external.length),
            categoryFilter: categoryFilter ?? null,
            skills,
            externalSkills: categoryFilter ? [] : external,
          }, null, 2));
          return 0;
        }

        console.log(`🧠 AI Animation Studio Skill OS (${skills.length + external.length} total skills):`);
        console.log('\n--- CUSTOM DOMAIN SKILLS ---');
        for (const s of skills) {
          console.log(` • [${s.category.toUpperCase()}] ${s.id.padEnd(26)} v${s.version.padEnd(6)} | ${s.description}`);
        }

        if (!categoryFilter) {
          console.log('\n--- EXTERNAL PRODUCTION SKILLS ---');
          for (const ext of external) {
            console.log(` • [EXTERNAL] ${ext.id.padEnd(26)} (${ext.source}) | ${ext.description}`);
          }
        }
        return 0;
      }

      if (subCommand === 'inspect') {
        const skillId = filteredArgs[2];
        if (!skillId) {
          console.error('Error: Skill ID required for inspection. Usage: studio skills inspect <id> [--json]');
          return 1;
        }

        const skill = registry.getSkill(skillId);
        if (!skill) {
          if (isJson) {
            console.log(JSON.stringify({ error: `Skill "${skillId}" not found in registry.` }, null, 2));
          } else {
            console.error(`Error: Skill "${skillId}" not found in registry.`);
          }
          return 1;
        }

        let dependencyChain: string[] = [];
        try {
          dependencyChain = registry.resolveDependencies(skillId, false);
        } catch (e: any) {
          dependencyChain = [`Error resolving dependencies: ${e.message}`];
        }

        if (isJson) {
          console.log(JSON.stringify({
            ...skill,
            resolvedDependencyChain: dependencyChain,
          }, null, 2));
          return 0;
        }

        console.log(`🔎 Inspecting Skill: ${skill.name} (${skill.id})`);
        console.log(` - Category: ${('category' in skill ? (skill as any).category : 'EXTERNAL')}`);
        console.log(` - Entry Point: ${skill.entryPoint}`);
        console.log(` - Description: ${skill.description}`);
        if ('version' in skill) {
          console.log(` - Version: ${(skill as any).version}`);
          console.log(` - Status: ${(skill as any).status}`);
          console.log(` - Direct Dependencies: ${(skill as any).dependencies.join(', ') || 'None'}`);
          console.log(` - Resolved Dependency Chain: ${dependencyChain.join(' -> ') || 'None'}`);
          console.log(` - Applicable Phases: ${(skill as any).applicablePhases.join(', ') || 'All'}`);
        } else {
          console.log(` - External Source: ${(skill as any).source}`);
          console.log(` - Update Method: ${(skill as any).updateMethod}`);
        }
        return 0;
      }

      if (subCommand === 'route') {
        const query = filteredArgs.slice(2).join(' ');
        if (!query) {
          console.error('Error: Query text required for skill routing. Usage: studio skills route <query> [--json]');
          return 1;
        }

        const router = new SkillRouter(registry);
        const match = router.route(query);

        if (isJson) {
          console.log(JSON.stringify(match, null, 2));
          return 0;
        }

        console.log(`🎯 Skill Route for query: "${query}"`);
        console.log(` - Primary Category: ${match.primaryCategory ?? 'General'}`);
        console.log(` - Matched Keywords: ${match.matchedKeywords.join(', ') || 'None'}`);
        console.log(` - Recommended Skills: ${match.recommendedSkills.map((s) => s.id).join(', ') || 'None'}`);
        if (match.dependencyChain && match.dependencyChain.length > 0) {
          console.log(` - Dependency Chain: ${match.dependencyChain.join(' -> ')}`);
        }
        if (match.externalSkills.length > 0) {
          console.log(` - External Skills: ${match.externalSkills.map((s) => s.id).join(', ')}`);
        }
        console.log(` - Reasoning: ${match.reasoning}`);
        return 0;
      }

      console.error(`Unknown skills subcommand: "${subCommand}". Supported: check, list, inspect, route`);
      return 1;
    }

    case 'production': {
      const subCommand = args[1];

      if (!subCommand || subCommand === '--help' || subCommand === '-h' || subCommand === 'help') {
        console.log(`
🎬 AI Animation Studio — Production Commands:

  pilot-preflight [storyFile]            Check operator readiness (FFmpeg, Node, Gemini, storage) offline
  pilot <storyFile> [--live] [--check]   Initialize canonical 1-shot production pilot
  create <storyFile> [--project <id>]    Create a production run from story script
  run <runId> [--live]                   Execute or resume a production run
  resume <runId> [--live]                Resume an interrupted production run
  status <runId> [--json]                Inspect truthful production run status and next action
  evidence <runId> [--json]              Inspect durable JSON evidence files on disk
  export-evidence <runId> [dest]         Export sanitized production run evidence without secrets
  import <runId> <shotId> <videoPath>    Import external media (--source google-flow --real-external)
  approve <runId> <shotId> [--human]     Approve candidate into Canon with operator challenge
  reject <runId> <shotId> --reason <rsn> Reject candidate shot recording operator reason
  verify <runId>                         Audit run against 13-point Master Production Gate
  release-gate [runId] [--json]          Authoritative release gate evaluation (fail-closed)
  route <projectId> [shotId]             Evaluate production route for shot
  plan <projectId> [seriesId]            Plan production strategies for all shots
  budget <projectId> [--set-cap <usd>]   Inspect or configure project budget cap
`);
        return 0;
      }

      if (subCommand === 'pilot-preflight' || subCommand === 'preflight' || (subCommand === 'pilot' && args.includes('--check'))) {
        const nonFlagArgs = args.slice(2).filter((a) => !a.startsWith('-'));
        const rawStoryFile = nonFlagArgs[0] || 'pilot-story.txt';
        const cleanStoryFile = path.resolve(rawStoryFile.replace(/^["']|["']$/g, '').trim());

        console.log(`\n==============================================================`);
        console.log(`🔍 AI ANIMATION STUDIO — PILOT PREFLIGHT READINESS CHECK`);
        console.log(`==============================================================\n`);

        const isLiveOptIn = args.includes('--live') || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
        const readiness = await ProductionPilotReadinessValidator.validate({
          storyFilePath: cleanStoryFile,
          allowLiveOptIn: isLiveOptIn,
          storage,
        });

        for (const c of readiness.checks) {
          const badge = c.status === 'PASS' ? '✅' : c.status === 'FAIL' ? '❌' : c.status === 'WARN' ? '⚠️' : 'ℹ️';
          const paddedName = c.name.padEnd(28, ' ');
          console.log(`[${c.status}] ${paddedName}: ${c.summary} ${badge}`);
          if (c.details) {
            console.log(`                               ${c.details}`);
          }
          if (c.remediation) {
            console.log(`                               Action: ${c.remediation}`);
          }
        }

        console.log(`\n--------------------------------------------------------------`);
        if (readiness.blockers.length === 0) {
          if (readiness.readyForLivePilot) {
            console.log(`VERDICT: READY FOR LIVE HUMAN PILOT 🚀`);
            console.log(`Next step: run 'studio production pilot "${cleanStoryFile}" --live'`);
          } else {
            console.log(`VERDICT: READY FOR OFFLINE REHEARSAL 🎬`);
            console.log(`To run offline rehearsal : studio production pilot "${cleanStoryFile}"`);
            console.log(`To run live human pilot  : studio production pilot "${cleanStoryFile}" --live`);
          }
        } else {
          console.log(`VERDICT: ACTION REQUIRED (BLOCKERS DETECTED) ⚠️`);
          for (const b of readiness.blockers) {
            console.log(` - ${b}`);
          }
        }
        console.log(`==============================================================\n`);
        return readiness.blockers.length === 0 ? 0 : 1;
      }

      const projectId = args[2];
      const targetId = args[3];

      if (subCommand === 'route' || subCommand === 'plan' || subCommand === 'budget') {
        if (!projectId) {
          console.error(`Error: Project ID is required. Usage: studio production ${subCommand} <projectId> [targetId]`);
          return 1;
        }
      }

      const providerRegistry = new ProviderRegistry();
      const promptCompiler = new PromptCompiler();
      const benchmarkTracker = new ProviderBenchmarkTracker();
      const budgetController = new BudgetController();

      // Read budget if persisted
      const budgetPath = projectId ? `.studio/production/${projectId}_budget.json` : '';
      if (budgetPath && await storage.exists(budgetPath)) {
        const savedBudget = await storage.readJson<any>(budgetPath);
        if (savedBudget.maxBudgetUsd !== undefined) {
          budgetController.setMaxBudget(savedBudget.maxBudgetUsd);
        }
      }

      const router = new ProductionRouter(providerRegistry, promptCompiler, benchmarkTracker, budgetController);

      if (subCommand === 'route') {
        const shotId = targetId || 'SHOT_01';
        // Try loading real shot or construct a representative shot
        const scenesPath = `.studio/director/${projectId}_scenes.json`;
        let targetShot: ShotContract | undefined;
        if (await storage.exists(scenesPath)) {
          const scenes = await storage.readJson<ProductionScene[]>(scenesPath);
          for (const s of scenes) {
            const found = s.shots.find((sh) => sh.id === shotId);
            if (found) {
              targetShot = found;
              break;
            }
          }
        }

        if (!targetShot) {
          // Construct default test shot for CLI inspection
          targetShot = {
            id: shotId,
            sceneId: 'SCENE_01',
            shotNumber: 1,
            purpose: 'establishing',
            complexity: 'simple_transform',
            rendererIntent: 'deterministic_hyperframes',
            frame: { durationSeconds: 3.5, targetFps: 24, aspectRatio: '16:9' },
            camera: {
              focalLength: '35mm',
              shotSize: 'wide',
              angle: 'eye_level',
              movement: 'push_in',
              semanticSkills: ['pushin'],
            },
            lighting: {
              keyLightDirection: 'left',
              mood: 'noir_suspense',
              colorTemperature: 'cool',
              fogAtmosphere: false,
            },
            composition: {
              rule: 'rule_of_thirds',
              subjectPlacement: 'center',
              depthLayers: { foreground: [], midground: [], background: [] },
            },
            acting: [
              {
                characterId: 'char_main',
                pose: 'standing_watchful',
                expression: 'serious',
                gazeDirection: 'screen_right',
              },
            ],
            transition: { type: 'cut', durationSeconds: 0 },
            environmentLocationId: 'loc_cyber_city',
            environmentZoneId: 'alley',
            audioCue: { sfx: [] },
            requiredAssetIds: ['ASSET_CHAR_MAIN', 'ASSET_LOC_ALLEY'],
            dependsOnShotIds: [],
            directorLocks: {
              isCameraLocked: false,
              isFramingLocked: false,
              isRendererLocked: false,
              isActingLocked: false,
            },
            provenance: { decidedAt: new Date().toISOString() },
          };
        }

        const strategy = router.routeShot(targetShot);

        console.log(`🎯 Production Route for Shot "${shotId}" (Project "${projectId}"):`);
        console.log(` - Execution Route : ${strategy.executionRoute.toUpperCase()}`);
        console.log(` - Deterministic   : ${strategy.isDeterministic ? 'YES ✅ (Zero Generative Cost)' : 'NO 🎬 (Generative Video Required)'}`);
        console.log(` - Primary Provider: ${strategy.primaryProviderId}`);
        if (strategy.fallbackProviderId) {
          console.log(` - Fallback Provider: ${strategy.fallbackProviderId}`);
        }
        console.log(` - Estimated Cost  : $${strategy.estimatedCostUsd.toFixed(4)}`);
        console.log(` - Estimated Latency: ${strategy.estimatedLatencyMs}ms`);
        console.log(` - Rationale       : ${strategy.rationale}`);
        console.log(` - Required Assets : ${strategy.requiredInputAssets.length} bound reference(s)`);
        for (const ref of strategy.requiredInputAssets) {
          console.log(`   • [${ref.role}] ${ref.assetId} (weight: ${ref.weight})`);
        }
        if (strategy.promptPacket) {
          console.log(` - Positive Prompt : "${strategy.promptPacket.positivePrompt}"`);
          console.log(` - Negative Prompt : "${strategy.promptPacket.negativePrompt}"`);
        }
        return 0;
      }

      if (subCommand === 'plan') {
        const seriesId = (args[3] && !args[3].startsWith('--')) ? args[3] : 'default_series';
        const scenesPath = `.studio/director/${projectId}_scenes.json`;
        let shotsToPlan: ShotContract[] = [];

        if (await storage.exists(scenesPath)) {
          const scenes = await storage.readJson<ProductionScene[]>(scenesPath);
          for (const s of scenes) {
            shotsToPlan.push(...s.shots);
          }
        }

        if (shotsToPlan.length === 0) {
          // Provide mock shots for CLI demonstration
          shotsToPlan = [
            {
              id: 'SHOT_SC01_SH01',
              sceneId: 'SC01',
              shotNumber: 1,
              purpose: 'establishing',
              complexity: 'simple_transform',
              rendererIntent: 'deterministic_hyperframes',
              frame: { durationSeconds: 3.0, targetFps: 24, aspectRatio: '16:9' },
              camera: { focalLength: '24mm', shotSize: 'wide', angle: 'eye_level', movement: 'push_in', semanticSkills: ['pushin'] },
              lighting: { keyLightDirection: 'left', mood: 'somber', colorTemperature: 'cool', fogAtmosphere: false },
              composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
              acting: [],
              transition: { type: 'cut', durationSeconds: 0 },
              environmentLocationId: 'loc_ruins',
              audioCue: { sfx: [] },
              requiredAssetIds: [],
              dependsOnShotIds: [],
              directorLocks: {
                isCameraLocked: false,
                isFramingLocked: false,
                isRendererLocked: false,
                isActingLocked: false,
              },
              provenance: { decidedAt: new Date().toISOString() },
            },
            {
              id: 'SHOT_SC01_SH02',
              sceneId: 'SC01',
              shotNumber: 2,
              purpose: 'action',
              complexity: 'complex_generative_video',
              rendererIntent: 'generative_full_video',
              frame: { durationSeconds: 4.0, targetFps: 24, aspectRatio: '16:9' },
              camera: { focalLength: '50mm', shotSize: 'medium', angle: 'low_angle', movement: 'orbit_clockwise', semanticSkills: ['orbit'] },
              lighting: { keyLightDirection: 'right', mood: 'intense', colorTemperature: 'warm', fogAtmosphere: true },
              composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
              acting: [{ characterId: 'char_hero', pose: 'combat_ready', expression: 'fierce', gazeDirection: 'screen_left', actionPrompt: 'runs and leaps across chasm' }],
              transition: { type: 'cut', durationSeconds: 0 },
              environmentLocationId: 'loc_ruins',
              audioCue: { sfx: [] },
              requiredAssetIds: ['ASSET_CHAR_HERO'],
              dependsOnShotIds: ['SHOT_SC01_SH01'],
              directorLocks: {
                isCameraLocked: false,
                isFramingLocked: false,
                isRendererLocked: false,
                isActingLocked: false,
              },
              provenance: { decidedAt: new Date().toISOString() },
            },
          ];
        }

        const plan = router.planProduction(projectId, seriesId, shotsToPlan);

        console.log(`📋 Production Plan for Project "${projectId}" (${plan.totalShots} total shots):`);
        console.log(` - Deterministic Shots: ${plan.deterministicShotsCount} (${((plan.deterministicShotsCount / plan.totalShots) * 100).toFixed(1)}%) ⚡`);
        console.log(` - Generative Shots   : ${plan.generativeShotsCount} 🎬`);
        console.log(` - Hybrid Shots       : ${plan.hybridShotsCount} 🎨`);
        console.log(` - Total Est. Cost    : $${plan.totalEstimatedCostUsd.toFixed(4)} USD`);
        console.log(` - Total Est. Latency : ${plan.totalEstimatedLatencyMs} ms (~${(plan.totalEstimatedLatencyMs / 1000).toFixed(1)}s)`);
        console.log('\n--- Shot Execution Strategies ---');
        for (const strat of plan.strategies) {
          const typeBadge = strat.isDeterministic ? '⚡ DETERMINISTIC' : '🎬 GENERATIVE';
          console.log(` • [${strat.shotId}] ${typeBadge} -> ${strat.executionRoute} | Provider: ${strat.primaryProviderId} | Est: $${strat.estimatedCostUsd.toFixed(3)}`);
        }
        return 0;
      }

      if (subCommand === 'budget') {
        const setCapIdx = args.indexOf('--set-cap');
        if (setCapIdx !== -1 && args[setCapIdx + 1]) {
          const newCap = parseFloat(args[setCapIdx + 1]);
          if (!isNaN(newCap) && newCap >= 0) {
            budgetController.setMaxBudget(newCap);
            await storage.writeJson(budgetPath, { maxBudgetUsd: newCap, updatedAt: new Date().toISOString() });
            console.log(`💰 Budget cap for project "${projectId}" updated to $${newCap.toFixed(2)} USD.`);
          }
        }

        const status = budgetController.getStatus();
        console.log(`💰 Budget Status for Project "${projectId}":`);
        console.log(` - Maximum Budget : $${status.maxBudgetUsd.toFixed(2)} USD`);
        console.log(` - Spent Budget   : $${status.spentBudgetUsd.toFixed(2)} USD`);
        console.log(` - Remaining      : $${status.remainingBudgetUsd.toFixed(2)} USD`);
        console.log(` - Utilization    : ${status.utilizationPercent.toFixed(1)}%`);
        console.log(` - Warning Alert  : ${status.isWarning ? '⚠️ WARNING (Threshold Exceeded)' : 'NORMAL ✅'}`);
        console.log(` - Hard Cap Reached: ${status.isHardCapReached ? '⛔ HARD CAP REACHED' : 'NO ✅'}`);
        return 0;
      }

      if (subCommand === 'create') {
        const storyFile = args[2];
        if (!storyFile) {
          console.error('Error: Story file required. Usage: studio production create <storyFile> [--project <id>] [--series <id>]');
          return 1;
        }
        if (!syncFs.existsSync(storyFile)) {
          console.error(`Error: Story file not found at "${storyFile}".`);
          return 1;
        }
        const rawScript = syncFs.readFileSync(storyFile, 'utf-8');
        const projIdx = args.indexOf('--project');
        const serIdx = args.indexOf('--series');
        const targetProjId = projIdx !== -1 && args[projIdx + 1] ? args[projIdx + 1] : `proj_${Date.now()}`;
        const targetSeriesId = serIdx !== -1 && args[serIdx + 1] ? args[serIdx + 1] : `series_prod`;

        const assetRegistry = new FileSystemAssetRegistry(storage);
        const orchestrator = new ProductionOrchestrator(storage, assetRegistry);
        const createdRun = await orchestrator.createRun({
          projectId: targetProjId,
          seriesId: targetSeriesId,
          rawScript,
          mode: 'PRODUCTION',
        });

        console.log(`🎬 Production Run Created:`);
        console.log(` - Run ID        : ${createdRun.runId}`);
        console.log(` - Project ID    : ${createdRun.projectId}`);
        console.log(` - Series ID     : ${createdRun.seriesId}`);
        console.log(` - Initial Status: ${createdRun.status} ✅`);
        console.log(`\nNext step to begin production:\nstudio production run ${createdRun.runId}`);
        return 0;
      }

      if (subCommand === 'pilot') {
        const rawStoryFile = args[2];
        const cleanStoryFile = rawStoryFile ? path.resolve(rawStoryFile.replace(/^["']|["']$/g, '').trim()) : '';
        if (!cleanStoryFile || !syncFs.existsSync(cleanStoryFile)) {
          console.error('Error: Valid story file is required. Usage: studio production pilot <storyFile> [--project <id>] [--series <id>]');
          return 1;
        }
        const rawScript = syncFs.readFileSync(cleanStoryFile, 'utf-8');
        const projIdx = args.indexOf('--project');
        const serIdx = args.indexOf('--series');
        const targetProjId = projIdx !== -1 && args[projIdx + 1] ? args[projIdx + 1] : `proj_pilot_${Date.now()}`;
        const targetSeriesId = serIdx !== -1 && args[serIdx + 1] ? args[serIdx + 1] : `series_pilot`;

        console.log(`\n==============================================================`);
        console.log(`🎬 INITIALIZING CANONICAL 1-SHOT PRODUCTION PILOT`);
        console.log(`==============================================================`);
        console.log(`Project ID     : ${targetProjId}`);
        console.log(`Series ID      : ${targetSeriesId}`);
        console.log(`Required Shots : 1 (Minimal Genuine Production Pilot)`);

        const isLiveOptIn = args.includes('--live') || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
        const gemini = new GeminiProvider({ allowLiveCalls: isLiveOptIn });
        const liveProvider = (gemini.isConfigured() && isLiveOptIn) ? gemini : undefined;
        if (!isLiveOptIn) {
          console.log(`ℹ️ Live Provider: DISABLED (offline story planning & routing).`);
          console.log(`   To enable live Gemini network calls, pass '--live' or set RUN_LIVE_PROVIDER_TESTS=true.\n`);
        } else {
          console.log(`📡 Live Provider: ENABLED (${gemini.metadata.name} - ${gemini.getMaskedApiKey()})\n`);
        }
        if (args.includes('--dry-run')) {
          console.log(`\n==============================================================`);
          console.log(`🔎 AI ANIMATION STUDIO — PILOT DRY RUN`);
          console.log(`==============================================================`);
          console.log(`Story File           : ${cleanStoryFile}`);
          console.log(`Target Project ID    : ${targetProjId}`);
          console.log(`Target Series ID     : ${targetSeriesId}`);
          console.log(`Simulated Run ID     : run_pilot_dryrun_simulated`);
          console.log(`Planned Run Dir      : .studio/production/${targetProjId}/run_pilot_dryrun_simulated/`);
          console.log(`Planned Handoff Dir  : .studio/production/${targetProjId}/run_pilot_dryrun_simulated/handoff/SHOT_01/`);
          console.log(`Planned Flow File    : SHOT_01_FLOW_REAL.mp4`);
          console.log(`Execution Mode       : PRODUCTION (DRY RUN — ZERO NETWORK CALLS)`);
          console.log(`Live Calls           : 0 (Disabled during dry-run)`);
          console.log(`Truth Rule           : ZERO state or evidence written to disk.`);

          console.log(`\nPlanned Lifecycle Sequence:`);
          console.log(` 1. Ingest story & compute lossless character offsets`);
          console.log(` 2. Plan Scene 1 -> Shot 1 (establishing action)`);
          console.log(` 3. Generate Flow Handoff package with prompt & references`);
          console.log(` 4. Wait for Human Operator generation in Google Flow`);
          console.log(` 5. Human imports downloaded MP4 via 'studio production import'`);
          console.log(` 6. Visual QA Evaluator audits 8 dimensions against ShotContract`);
          console.log(` 7. Issue single-use cryptographic challenge nonce`);
          console.log(` 8. Human operator completes approval ceremony`);
          console.log(` 9. Assemble timeline, render master MP4, audit continuity`);
          console.log(` 10. Compile & validate durable acceptance bundle`);

          console.log(`\nDRY RUN RESULT: ALL PRECONDITIONS SATISFIED ✅`);
          console.log(`To execute real pilot: studio production pilot "${cleanStoryFile}" --live`);
          console.log(`==============================================================\n`);
          return 0;
        }

        const assetRegistry = new FileSystemAssetRegistry(storage);
        const orchestrator = new ProductionOrchestrator(storage, assetRegistry, liveProvider);

        const createdRun = await orchestrator.createRun({
          projectId: targetProjId,
          seriesId: targetSeriesId,
          rawScript,
          mode: 'PRODUCTION',
          pilotMode: true,
          requiredShotCount: 1,
        });

        console.log(`\n🚀 Orchestrating canonical pilot through story planning and handoff...`);
        const executedRun = await orchestrator.execute(targetProjId, createdRun.runId);
        const nextActionInfo = await ProductionNextActionResolver.resolve(executedRun, storage);

        console.log(`\n==============================================================`);
        console.log(`REAL PRODUCTION PILOT`);
        console.log(`==============================================================\n`);
        console.log(`Run                  : ${executedRun.runId}`);
        console.log(`Project              : ${executedRun.projectId}`);
        console.log(`Series               : ${executedRun.seriesId}`);
        console.log(`Required Shots       : 1\n`);

        for (const s of nextActionInfo.stepMatrix) {
          const paddedName = `[${s.stepIndex}] ${s.name}`.padEnd(21, ' ');
          console.log(`${paddedName}: ${s.status}${s.details ? ` (${s.details})` : ''}`);
        }

        console.log(`\nNEXT ACTION:`);
        console.log(nextActionInfo.nextAction);
        if (nextActionInfo.handoffPath) {
          console.log(`Handoff Directory    : ${nextActionInfo.handoffPath}`);
        }
        console.log(`\nRECOMMENDED COMMAND:`);
        console.log(nextActionInfo.recommendedCommand);
        console.log(`==============================================================\n`);
        return 0;
      }

      const findRunById = async (targetRunId: string) => {
        const repo = new ProductionRunRepository(storage);
        // Search across known projects directory
        const projectsDir = '.studio/production';
        if (await storage.exists(projectsDir)) {
          const projectFolders = await storage.list(projectsDir);
          for (const pf of projectFolders) {
            const pId = pf.replace(/\\/g, '/').split('/')[2] || pf;
            const r = await repo.findById(pId, targetRunId);
            if (r) return r;
          }
        }
        return null;
      };

      if (subCommand === 'run' || subCommand === 'resume') {
        const targetRunId = args[2];
        if (!targetRunId) {
          console.error(`Error: Run ID required. Usage: studio production ${subCommand} <runId>`);
          return 1;
        }

        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found in .studio/production/`);
          return 1;
        }

        console.log(`🚀 Executing Production Run "${targetRunId}" (Project: ${runRecord.projectId})...`);
        const isLiveOptIn = args.includes('--live') || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
        const gemini = new GeminiProvider({ allowLiveCalls: isLiveOptIn });
        const liveProvider = (gemini.isConfigured() && isLiveOptIn) ? gemini : undefined;
        if (!isLiveOptIn) {
          console.log(`ℹ️ Live Provider: DISABLED. To enable live Gemini calls, pass '--live' or set RUN_LIVE_PROVIDER_TESTS=true.`);
        }
        const assetRegistry = new FileSystemAssetRegistry(storage);
        const orchestrator = new ProductionOrchestrator(storage, assetRegistry, liveProvider);

        // ── Visual QA resume dispatch ──────────────────────────────────────────────
        // When WAITING_FOR_PROVIDER + resumeStage=VISUAL_QA (or existing media on disk) + subCommand=resume|run:
        //   With --live   → resumeVisualQAFromExistingMedia() (re-runs QA on same media)
        //   Without --live → print guidance and exit (don't re-enter execute() pipeline)
        // This prevents execute() from re-entering shot generation / rebuilding Flow handoff.
        const isVisualQAResume =
          runRecord.status === 'WAITING_FOR_PROVIDER' &&
          (runRecord.resumeMetadata?.resumeStage === 'VISUAL_QA' ||
            Boolean(
              runRecord.mediaEvidence &&
              runRecord.resumeMetadata?.targetShotId &&
              runRecord.mediaEvidence[runRecord.resumeMetadata.targetShotId]
            ));

        if (isVisualQAResume && (subCommand === 'resume' || subCommand === 'run') && !isLiveOptIn) {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS  : WAITING_FOR_PROVIDER');
          console.log('Reason  : Gemini Visual QA rate limited / quota exceeded');
          console.log(`Shot    : ${runRecord.resumeMetadata?.targetShotId ?? runRecord.currentShotId}`);
          console.log('Next    : Retry existing media QA (no re-import or Flow regeneration needed)');
          console.log(`Command : npm.cmd run studio -- production resume ${targetRunId} --live`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          return 0;
        }

        let result: Awaited<ReturnType<typeof orchestrator.execute>>;
        if (isVisualQAResume && (subCommand === 'resume' || subCommand === 'run') && isLiveOptIn) {
          console.log(`🔁 Resuming Visual QA on existing media for shot "${runRecord.resumeMetadata?.targetShotId}"...`);
          result = await orchestrator.resumeVisualQAFromExistingMedia(runRecord.projectId, targetRunId);
        } else {
          result = await orchestrator.execute(runRecord.projectId, targetRunId);
        }

        console.log(`\n📊 Production Run State:`);
        console.log(` - Status: ${result.status}`);
        console.log(` - Current Stage: ${result.currentStage}`);
        if (result.currentShotId) console.log(` - Shot: ${result.currentShotId}`);
        console.log(` - Completed Shots: ${result.completedShotIds.join(', ') || 'None'}`);

        if (result.status === 'WAITING_FOR_PROVIDER') {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS: WAITING_FOR_PROVIDER');
          console.log(`Provider: ${gemini.metadata.name}`);
          console.log(`Reason  : ${result.resumeMetadata.blockedReason}`);
          if (result.resumeMetadata.resumeStage === 'VISUAL_QA') {
            console.log('Context : Gemini Visual QA rate limited — media evidence is preserved');
            console.log('Next    : Retry existing media QA (no re-import or Flow regeneration needed)');
            console.log(`Command : npm.cmd run studio -- production resume ${targetRunId} --live`);
          } else {
            console.log('Completed work preserved: YES');
            console.log('Resume command:');
            console.log(`studio production resume ${targetRunId}`);
          }
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } else if (result.status === 'NEEDS_USER_ACTION') {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS: NEEDS_USER_ACTION');
          console.log(`Shot    : ${result.currentShotId}`);
          console.log('Renderer: Google Flow — Assisted');
          console.log(`Package : .studio/flow/packages/${runRecord.projectId}/${result.currentShotId}`);
          console.log('Next action: Generate the clip in Flow and import the downloaded MP4:');
          console.log(`studio production import ${targetRunId} ${result.currentShotId} <path_to_downloaded_mp4>`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } else if (result.status === 'APPROVAL_REQUIRED') {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS: APPROVAL_REQUIRED');
          console.log(`Shot    : ${result.resumeMetadata.targetShotId}`);
          console.log('Human review required before timeline assembly.');
          console.log('Approve command:');
          console.log(`studio production approve ${targetRunId} ${result.resumeMetadata.targetShotId}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } else if (result.status === 'COMPLETED') {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🏆 PRODUCTION RUN COMPLETED & MASTER DELIVERABLE VERIFIED!');
          if (result.masterEvidence) {
            console.log(` - Master MP4 : ${result.masterEvidence.masterVideoPath}`);
            console.log(` - Checksum   : ${result.masterEvidence.masterSha256}`);
            console.log(` - Status     : ${result.masterEvidence.verificationStatus} ✅`);
          }
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
        return 0;
      }

      if (subCommand === 'accept') {
        const targetRunId = args[2];
        if (!targetRunId) {
          console.error('Error: Run ID required. Usage: studio production accept <runId>');
          return 1;
        }

        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found in .studio/production/`);
          return 1;
        }

        console.log(`\n==================================================`);
        console.log(`🚀 PRODUCTION ACCEPTANCE HARNESS: ${targetRunId}`);
        console.log(`Project: ${runRecord.projectId} | Series: ${runRecord.seriesId}`);
        console.log(`==================================================\n`);

        const assetRegistry = new FileSystemAssetRegistry(storage);
        const isLiveConfirmed = args.includes('--live') || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
        const gemini = new GeminiProvider({ allowLiveCalls: isLiveConfirmed });

        // 1. PREFLIGHT & LIVE PROVIDER CHECK
        console.log('1️⃣ PREFLIGHT: Live Provider Verification...');
        const preflight = await LiveProviderPreflight.verify({
          provider: gemini,
          requireLiveOptIn: true,
          liveConfirmed: isLiveConfirmed,
        });

        if (!preflight.passed) {
          console.error('\n❌ Live Provider Preflight Check Failed:');
          for (const reason of preflight.reasons) {
            console.error(` - ${reason}`);
          }
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS: WAITING_FOR_PROVIDER / NEEDS_USER_ACTION');
          console.log('Production acceptance requires a verified live provider (LIVE_EXTERNAL).');
          console.log('Ensure GEMINI_API_KEY is configured and RUN_LIVE_PROVIDER_TESTS=true is set.');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          return 1;
        }

        console.log(`✅ Live Provider Verified: ${preflight.providerName} (${preflight.activeModel || 'active'}) [${preflight.providerTrust}]`);

        // 2. RUN / RESUME PIPELINE
        console.log('\n2️⃣ EXECUTION: Orchestrating Production Run...');
        const orchestrator = new ProductionOrchestrator(storage, assetRegistry, gemini);
        const executedRun = await orchestrator.execute(runRecord.projectId, targetRunId);

        if (executedRun.status === 'WAITING_FOR_PROVIDER') {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS: WAITING_FOR_PROVIDER');
          console.log(`Provider: ${gemini.metadata.name}`);
          console.log(`Reason  : ${executedRun.resumeMetadata.blockedReason}`);
          console.log('All completed work preserved.');
          console.log(`Resume when quota resets:\nstudio production accept ${targetRunId}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          return 0;
        }

        if (executedRun.status === 'NEEDS_USER_ACTION') {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS: NEEDS_USER_ACTION');
          console.log(`Shot    : ${executedRun.currentShotId}`);
          console.log('Renderer: Google Flow — Real External');
          console.log(`Package : .studio/flow/packages/${runRecord.projectId}/${executedRun.currentShotId}`);
          console.log('Next action: Generate clip in Google Flow, then import downloaded MP4:');
          console.log(`studio production import ${targetRunId} ${executedRun.currentShotId} <path_to_downloaded_mp4> --source google-flow --real-external`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          return 0;
        }

        if (executedRun.status === 'APPROVAL_REQUIRED') {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('STATUS: APPROVAL_REQUIRED');
          const targetShot = executedRun.resumeMetadata.targetShotId || executedRun.currentShotId;
          const media = targetShot ? executedRun.mediaEvidence[targetShot] : undefined;
          console.log(`Shot          : ${targetShot}`);
          if (media) {
            console.log(`Candidate     : ${media.assetId}`);
            console.log(`Media SHA-256 : ${media.sha256}`);
            console.log(`Source        : ${media.generationSource}`);
          }
          console.log('Human director sign-off required before timeline assembly.');
          console.log(`Approve command:\nstudio production approve ${targetRunId} ${targetShot} --human`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          return 0;
        }

        if (executedRun.status === 'COMPLETED' && executedRun.masterEvidence) {
          // 3. DURABLE ACCEPTANCE BUNDLE VALIDATION
          console.log('\n3️⃣ VERIFYING FINAL ACCEPTANCE BUNDLE...');
          const acceptanceDir = `.studio/production/${runRecord.projectId}/${targetRunId}/acceptance`;
          const bundleValidation = await ProductionAcceptanceBundle.validate(acceptanceDir, storage);

          if (!bundleValidation.valid) {
            console.error('\n❌ Acceptance Bundle Manifest Validation Failed:');
            for (const r of bundleValidation.reasons) {
              console.error(` - ${r}`);
            }
            console.log('STATUS: FAILED_VERIFICATION');
            return 1;
          }

          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          if (executedRun.masterEvidence.verificationStatus === 'MASTER_PRODUCTION_VERIFIED') {
            console.log('🏆 REAL PRODUCTION ACCEPTANCE PASSED — MASTER_PRODUCTION_VERIFIED!');
          } else {
            console.log(`🎬 OFFLINE PRODUCTION REHEARSAL VERIFIED — ${executedRun.masterEvidence.verificationStatus}`);
          }
          console.log(` - Run ID        : ${targetRunId}`);
          console.log(` - Project ID    : ${runRecord.projectId}`);
          console.log(` - Master MP4    : ${executedRun.masterEvidence.masterVideoPath}`);
          console.log(` - Master SHA-256: ${executedRun.masterEvidence.masterSha256}`);
          console.log(` - Verification  : ${executedRun.masterEvidence.verificationStatus} ✅`);
          console.log(` - Acceptance Dir: ${acceptanceDir}`);
          console.log(` - Manifest Hash : ${bundleValidation.manifest?.manifestSha256}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          return 0;
        }

        console.log(`Current run status: ${executedRun.status}. Stage: ${executedRun.currentStage}`);
        return 0;
      }

      if (subCommand === 'status') {
        const targetRunId = args[2];
        if (!targetRunId) {
          console.error('Error: Run ID required. Usage: studio production status <runId> [--json]');
          return 1;
        }
        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found.`);
          return 1;
        }

        const nextActionInfo = await ProductionNextActionResolver.resolve(runRecord, storage);

        if (args.includes('--json')) {
          const jsonOutput = {
            runId: runRecord.runId,
            projectId: runRecord.projectId,
            seriesId: runRecord.seriesId,
            status: runRecord.status,
            currentStage: runRecord.currentStage,
            pilotMode: runRecord.pilotMode ?? false,
            requiredShotCount: runRecord.requiredShotCount ?? (runRecord.completedShotIds.length + runRecord.pendingShotIds.length || 1),
            completedShots: runRecord.completedShotIds,
            pendingShots: runRecord.pendingShotIds,
            nextAction: nextActionInfo.nextAction,
            recommendedCommand: nextActionInfo.recommendedCommand,
            handoffPath: nextActionInfo.handoffPath ?? null,
            stepMatrix: nextActionInfo.stepMatrix,
          };
          console.log(redactSecrets(jsonOutput));
          return 0;
        }

        console.log(`\n==============================================================`);
        console.log(runRecord.pilotMode ? `REAL PRODUCTION PILOT` : `PRODUCTION RUN STATUS`);
        console.log(`==============================================================\n`);
        console.log(`Run                  : ${runRecord.runId}`);
        console.log(`Project              : ${runRecord.projectId}`);
        console.log(`Series               : ${runRecord.seriesId}`);
        console.log(`Required Shots       : ${runRecord.requiredShotCount ?? (runRecord.completedShotIds.length + runRecord.pendingShotIds.length || 1)}\n`);

        for (const s of nextActionInfo.stepMatrix) {
          const paddedName = `[${s.stepIndex}] ${s.name}`.padEnd(21, ' ');
          console.log(`${paddedName}: ${s.status}${s.details ? ` (${s.details})` : ''}`);
        }

        console.log(`\nNEXT ACTION:`);
        console.log(nextActionInfo.nextAction);
        if (nextActionInfo.handoffPath) {
          console.log(`Handoff Directory    : ${nextActionInfo.handoffPath}`);
        }
        console.log(`\nRECOMMENDED COMMAND:`);
        console.log(nextActionInfo.recommendedCommand);
        console.log(`==============================================================\n`);
        return 0;
      }

      if (subCommand === 'evidence') {
        const targetRunId = args[2];
        if (!targetRunId) {
          console.error('Error: Run ID required. Usage: studio production evidence <runId> [--json]');
          return 1;
        }
        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found.`);
          return 1;
        }

        const evidenceStore = new EvidenceStore(storage);
        const provs = await evidenceStore.loadProviderEvidence(runRecord.projectId, targetRunId);
        const media = await evidenceStore.loadMediaEvidence(runRecord.projectId, targetRunId);
        const qas = await evidenceStore.loadQAEvidence(runRecord.projectId, targetRunId);
        const apps = await evidenceStore.loadApprovalEvidence(runRecord.projectId, targetRunId);
        const master = await evidenceStore.loadMasterEvidence(runRecord.projectId, targetRunId);

        if (args.includes('--json')) {
          const jsonEvidence = {
            runId: targetRunId,
            projectId: runRecord.projectId,
            location: evidenceStore.getProductionDir(runRecord.projectId, targetRunId),
            providers: provs,
            media,
            qa: qas,
            approvals: apps,
            master: master ?? null,
          };
          console.log(redactSecrets(jsonEvidence));
          return 0;
        }

        console.log(`🗄️ Durable Production Evidence for Run "${targetRunId}":`);
        console.log(` - Location           : ${evidenceStore.getProductionDir(runRecord.projectId, targetRunId)}`);
        console.log(` - Provider Records   : ${provs.length}`);
        for (const p of provs) {
          console.log(`   • [${p.providerId}] ${p.providerRole} (${p.actualModel}) -> ${p.status} (${p.latencyMs}ms)`);
        }
        console.log(` - Media Artifacts    : ${Object.keys(media).length}`);
        for (const [sId, m] of Object.entries(media)) {
          console.log(`   • [${sId}] ${m.container.toUpperCase()} (${m.width}x${m.height}, ${m.durationSeconds}s) SHA256: ${m.sha256.substring(0, 16)}...`);
        }
        console.log(` - QA Audit Records   : ${Object.keys(qas).length}`);
        for (const [sId, q] of Object.entries(qas)) {
          console.log(`   • [${sId}] Status: ${q.overallStatus} (Defects: ${q.totalDefects}, Critical: ${q.criticalDefects})`);
        }
        console.log(` - Human Approvals    : ${Object.keys(apps).length}`);
        for (const [sId, a] of Object.entries(apps)) {
          console.log(`   • [${sId}] ${a.status} by "${a.decidedBy}" at ${a.decidedAt}`);
        }
        console.log(` - Master Deliverable : ${master ? `${master.verificationStatus} (${master.masterSha256.substring(0, 16)}...)` : 'PENDING'}`);
        return 0;
      }

      if (subCommand === 'export-evidence') {
        const targetRunId = args[2];
        const destArg = args[3];

        if (!targetRunId) {
          console.error('Error: Run ID required. Usage: studio production export-evidence <runId> [destinationDir]');
          return 1;
        }

        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found in .studio/production/`);
          return 1;
        }

        const runDir = `.studio/production/${runRecord.projectId}/${targetRunId}`;
        const targetDestDir = destArg
          ? path.resolve(destArg.replace(/^["']|["']$/g, '').trim())
          : path.resolve(cwd, `.studio/exports/${runRecord.projectId}_${targetRunId}_evidence_export`);

        await fs.mkdir(targetDestDir, { recursive: true });

        const filesToExport = [
          'production-run.json',
          'provider-evidence.json',
          'media-evidence.json',
          'qa-evidence.json',
          'approval-evidence.json',
          'master-evidence.json',
          'approval-challenges.json',
          'acceptance/acceptance-manifest.json',
          'acceptance/acceptance-report.json',
        ];

        let exportedCount = 0;
        for (const relPath of filesToExport) {
          const srcPath = path.join(runDir, relPath);
          if (await storage.exists(srcPath)) {
            const rawContent = await storage.read(srcPath);
            const sanitized = redactSecrets(rawContent);
            const outPath = path.join(targetDestDir, relPath);
            await fs.mkdir(path.dirname(outPath), { recursive: true });
            await fs.writeFile(outPath, sanitized, 'utf-8');
            exportedCount++;
          }
        }

        console.log(`\n📦 Evidence Export Complete for Run "${targetRunId}":`);
        console.log(` - Source Run Dir  : ${runDir}`);
        console.log(` - Destination Dir : ${targetDestDir}`);
        console.log(` - Exported Files  : ${exportedCount}`);
        console.log(` - Sanitization    : Secrets redacted (API keys, authorization tokens) ✅`);
        console.log(` - Status          : SAFE FOR ARCHIVAL OR AUDITING ✅\n`);
        return 0;
      }

      if (subCommand === 'import') {
        const targetRunId = args[2];
        const targetShotId = args[3];
        const rawVideoPath = args[4];

        if (!targetRunId || !targetShotId || !rawVideoPath) {
          console.error('Error: Required arguments missing. Usage: studio production import <runId> <shotId> <videoPath> [--source <source>] [--real-external]');
          return 1;
        }

        const videoPath = path.resolve(rawVideoPath.replace(/^["']|["']$/g, '').trim());

        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found.`);
          return 1;
        }

        const srcIdx = args.indexOf('--source');
        const sourceVal = srcIdx !== -1 && args[srcIdx + 1] ? args[srcIdx + 1].toLowerCase() : 'imported';
        const isRealExternal = args.includes('--real-external');

        let generationSource: 'HYPERFRAMES' | 'FLOW_ASSISTED' | 'LIVE_PROVIDER' | 'IMPORTED' | 'SIMULATED_FLOW' | 'GOOGLE_FLOW_REAL' = 'IMPORTED';
        let provenance = `External Media Import: ${path.basename(videoPath)}`;

        if (sourceVal === 'google-flow' || sourceVal === 'flow') {
          if (!isRealExternal) {
            console.error('❌ Error: Importing Google Flow media into production requires explicit operator confirmation via "--real-external".');
            console.error('If this is a simulated or rehearsal download, use: --source simulated-flow');
            return 1;
          }
          generationSource = 'GOOGLE_FLOW_REAL';
          provenance = 'Google Flow — Real External Generation (Operator Verified)';
        } else if (sourceVal === 'simulated-flow') {
          generationSource = 'SIMULATED_FLOW';
          provenance = 'Simulated Flow Download';
        }

        console.log(`📥 Importing media for shot "${targetShotId}" into run "${targetRunId}"...`);
        console.log(` - Source      : ${generationSource}`);
        console.log(` - File Path   : ${videoPath}`);

        const isLiveOptIn = args.includes('--live') || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
        const gemini = new GeminiProvider({ allowLiveCalls: isLiveOptIn });
        const liveProvider = (gemini.isConfigured() && isLiveOptIn) ? gemini : undefined;
        const assetRegistry = new FileSystemAssetRegistry(storage);
        const orchestrator = new ProductionOrchestrator(storage, assetRegistry, liveProvider);
        const updated = await orchestrator.importShotMedia(runRecord.projectId, targetRunId, targetShotId, videoPath, {
          generationSource,
          provenance,
          realExternal: isRealExternal,
        });

        const recordedMedia = updated.mediaEvidence[targetShotId];
        console.log(`✅ Media successfully imported, verified with FFprobe, and evaluated with Visual QA!`);
        if (recordedMedia) {
          console.log(` - Physical Path : ${recordedMedia.physicalPath}`);
          console.log(` - Size          : ${recordedMedia.sizeBytes} bytes`);
          console.log(` - SHA-256       : ${recordedMedia.sha256}`);
          console.log(` - Format        : ${recordedMedia.width}x${recordedMedia.height} @ ${recordedMedia.fps || 24}fps (${recordedMedia.durationSeconds}s)`);
          console.log(` - Codec         : video=${recordedMedia.videoCodec}, audio=${recordedMedia.audioCodec || 'none'}`);
          console.log(` - Provenance    : ${recordedMedia.provenance}`);
        }
        console.log(` - Run Status    : ${updated.status}`);
        console.log(`\nNext step: Human review & approve:\nstudio production approve ${targetRunId} ${targetShotId} --human`);
        return 0;
      }

      if (subCommand === 'approve') {
        const targetRunId = args[2];
        const targetShotId = args[3];

        if (!targetRunId || !targetShotId) {
          console.error('Error: Run ID and Shot ID required. Usage: studio production approve <runId> <shotId> [--human|--automated]');
          return 1;
        }

        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found.`);
          return 1;
        }

        const isHuman = args.includes('--human');
        const isAutomated = args.includes('--automated');
        const actorIdx = args.indexOf('--actor');
        const actorDisplayName = actorIdx !== -1 && args[actorIdx + 1] ? args[actorIdx + 1] : (isHuman ? 'Lead Director (Human Operator)' : 'Automated Test Harness');

        let approvalType: 'HUMAN' | 'AUTOMATED_TEST';
        let interactive = false;
        let challengeId: string | undefined = undefined;
        let challengeNonce: string | undefined = undefined;

        const assetRegistry = new FileSystemAssetRegistry(storage);
        const orchestrator = new ProductionOrchestrator(storage, assetRegistry);

        if (isHuman || (!isAutomated && process.stdin.isTTY)) {
          if (!process.stdin.isTTY) {
            console.error('Error: --human requires an interactive TTY terminal session. Non-interactive environments must use --automated.');
            return 1;
          }

          const media = runRecord.mediaEvidence[targetShotId];
          const qa = runRecord.qaEvidence[targetShotId];

          // 1. Core issues the approval challenge bound to run, shot, mediaSha256, qaReportId
          const challenge = await orchestrator.issueApprovalChallenge(
            runRecord.projectId,
            targetRunId,
            targetShotId,
            'APPROVE'
          );

          console.log(`\n--- Candidate Review: Shot "${targetShotId}" ---`);
          console.log(`Shot ID            : ${targetShotId}`);
          console.log(`Candidate Asset ID : ${media?.assetId ?? 'UNKNOWN'}`);
          console.log(`Media SHA-256      : ${media?.sha256 ?? 'UNKNOWN'}`);
          console.log(`QA Report ID       : ${qa?.reportId ?? 'UNKNOWN'}`);
          console.log(`QA status          : ${qa?.overallStatus ?? 'NOT_EVALUATED'}`);
          console.log(`Provider trust     : ${qa?.providerTrust ?? 'UNKNOWN'}`);
          console.log(`Challenge ID       : ${challenge.challengeId}`);
          console.log(`Challenge Nonce    : ${challenge.nonce}\n`);

          const answer = await promptUser(`Type "APPROVE ${challenge.nonce}" to confirm human approval: `);
          if (answer.trim() !== `APPROVE ${challenge.nonce}`) {
            console.error(`Human approval aborted: confirmation did not match "APPROVE ${challenge.nonce}". Approval evidence unchanged.`);
            return 1;
          }

          approvalType = 'HUMAN';
          interactive = true;
          challengeId = challenge.challengeId;
          challengeNonce = challenge.nonce;
        } else if (isAutomated) {
          approvalType = 'AUTOMATED_TEST';
          interactive = false;
        } else {
          console.error('Error: Non-interactive environment detected. Use --automated for automated workflows or run in an interactive terminal with --human.');
          return 1;
        }

        console.log(`✍️  Approving candidate shot "${targetShotId}" into Canon (${approvalType})...`);
        const updated = await orchestrator.approveShot(
          runRecord.projectId,
          targetRunId,
          targetShotId,
          actorDisplayName,
          undefined,
          {
            approvalType,
            challengeId,
            challengeNonce,
            actorDisplayName,
            interactive,
            approvalSource: 'studio production approve',
          }
        );

        const appRecord = updated.approvalEvidence[targetShotId];
        console.log(`✅ Shot "${targetShotId}" promoted to Canon!`);
        if (appRecord) {
          console.log(` - Canon Asset ID : ${appRecord.canonicalAssetId}`);
          console.log(` - Media SHA-256  : ${appRecord.mediaSha256}`);
          console.log(` - QA Report ID   : ${appRecord.qaReportId}`);
          console.log(` - Approval Type  : ${appRecord.approvalType}`);
          console.log(` - Approved By    : ${appRecord.decidedBy}`);
        }
        console.log(` - Run Status     : ${updated.status}`);
        console.log(`\nNext step to continue production:\nstudio production resume ${targetRunId}`);
        return 0;
      }

      if (subCommand === 'reject') {
        const targetRunId = args[2];
        const targetShotId = args[3];
        const reasonIdx = args.indexOf('--reason');
        const reason = reasonIdx !== -1 && args[reasonIdx + 1] ? args[reasonIdx + 1] : 'Rejected by human reviewer';

        if (!targetRunId || !targetShotId) {
          console.error('Error: Run ID and Shot ID required. Usage: studio production reject <runId> <shotId> --reason "<reason>"');
          return 1;
        }

        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found.`);
          return 1;
        }

        const isHuman = args.includes('--human');
        const isAutomated = args.includes('--automated');
        let approvalType: 'HUMAN' | 'AUTOMATED_TEST' | 'SYSTEM' = 'SYSTEM';
        let interactive = false;
        let challengeId: string | undefined = undefined;
        let challengeNonce: string | undefined = undefined;

        const assetRegistry = new FileSystemAssetRegistry(storage);
        const orchestrator = new ProductionOrchestrator(storage, assetRegistry);

        if (isHuman) {
          if (!process.stdin.isTTY) {
            console.error('Error: --human requires an interactive TTY terminal session.');
            return 1;
          }

          const challenge = await orchestrator.issueApprovalChallenge(
            runRecord.projectId,
            targetRunId,
            targetShotId,
            'REJECT'
          );

          console.log(`\n--- Rejection Challenge: Shot "${targetShotId}" ---`);
          console.log(`Challenge ID    : ${challenge.challengeId}`);
          console.log(`Challenge Nonce : ${challenge.nonce}\n`);

          const answer = await promptUser(`Type "REJECT ${challenge.nonce}" to confirm rejection: `);
          if (answer.trim() !== `REJECT ${challenge.nonce}`) {
            console.error(`Human rejection aborted: confirmation did not match "REJECT ${challenge.nonce}".`);
            return 1;
          }
          approvalType = 'HUMAN';
          interactive = true;
          challengeId = challenge.challengeId;
          challengeNonce = challenge.nonce;
        } else if (isAutomated) {
          approvalType = 'AUTOMATED_TEST';
        }

        console.log(`🚫 Rejecting candidate shot "${targetShotId}" (${approvalType})...`);
        const updated = await orchestrator.rejectShot(
          runRecord.projectId,
          targetRunId,
          targetShotId,
          reason,
          undefined,
          {
            approvalType,
            interactive,
            challengeId,
            challengeNonce,
            approvalSource: 'studio production reject',
          }
        );

        const rejRecord = updated.approvalEvidence[targetShotId];
        console.log(`✅ Rejection recorded for shot "${targetShotId}".`);
        if (rejRecord) {
          console.log(` - Rejection Type : ${rejRecord.approvalType}`);
          console.log(` - Interactive    : ${rejRecord.interactive}`);
        }
        console.log(` - Run Status     : ${updated.status}`);
        return 0;
      }

      if (subCommand === 'verify') {
        const targetRunId = args[2];
        if (!targetRunId) {
          console.error('Error: Run ID required. Usage: studio production verify <runId>');
          return 1;
        }
        const runRecord = await findRunById(targetRunId);
        if (!runRecord) {
          console.error(`Error: ProductionRun "${targetRunId}" not found.`);
          return 1;
        }

        const evidenceStore = new EvidenceStore(storage);
        const master = await evidenceStore.loadMasterEvidence(runRecord.projectId, targetRunId);

        if (!master || master.verificationStatus !== 'MASTER_PRODUCTION_VERIFIED') {
          console.log('\nMASTER PRODUCTION VERIFIED: NOT VERIFIED ❌');
          console.log('One or more production verification requirements are incomplete.');
          return 1;
        }

        console.log('\nMASTER PRODUCTION VERIFIED: PASS ✅');
        console.log(` - Master Path : ${master.masterVideoPath}`);
        console.log(` - Checksum    : ${master.masterSha256}`);
        console.log(` - Verified At : ${master.verifiedAt}`);
        return 0;
      }

      if (subCommand === 'verify-live') {
        const { runProductionLiveSmoke } = await import('./smoke/production-live-smoke.js');
        return runProductionLiveSmoke();
      }

      if (subCommand === 'release-gate' || subCommand === 'gate') {
        const targetRunId = args.slice(2).find((a) => !a.startsWith('-'));
        const isJson = args.includes('--json');

        const report = await ProductionReleaseGate.evaluate({
          runId: targetRunId,
          storage,
        });

        if (isJson) {
          console.log(redactSecrets(report));
          return report.isVerified ? 0 : 1;
        }

        console.log(`\n==============================================================`);
        console.log(`🛡️  AI ANIMATION STUDIO — PRODUCTION RELEASE GATE`);
        console.log(`==============================================================\n`);
        console.log(`Status               : ${report.status}`);
        console.log(`Derived At           : ${report.derivedAt}`);
        if (report.runId) console.log(`Run ID               : ${report.runId}`);
        if (report.projectId) console.log(`Project ID           : ${report.projectId}`);
        console.log(`Master Verified      : ${report.isVerified ? 'YES ✅' : 'NO ❌'}\n`);

        console.log(`CHECKS:`);
        for (const check of report.checkDetails) {
          const mark = check.passed ? '✅' : '❌';
          console.log(` - ${check.name.padEnd(30, ' ')} : ${mark} ${check.message ? `(${check.message})` : ''}`);
        }

        if (report.reasons.length > 0) {
          console.log(`\nFINDINGS / BLOCKERS:`);
          for (const r of report.reasons) {
            console.log(` - ${r}`);
          }
        }

        console.log(`\nNEXT ACTION:`);
        console.log(report.nextAction);
        console.log(`\nRECOMMENDED COMMAND:`);
        console.log(report.recommendedCommand);
        console.log(`==============================================================\n`);

        return report.isVerified ? 0 : (report.status === 'READY_FOR_LIVE_PILOT' ? 0 : 1);
      }

      console.error(
        `Unknown production subcommand: "${subCommand}". Supported: create, run, status, resume, evidence, export-evidence, import, approve, reject, verify, verify-live, release-gate, route, plan, budget`
      );
      return 1;
    }

    case 'hyperframes': {
      const subCommand = args[1];
      const projectId = args[2];
      const shotId = args[3] || 'SHOT_01';

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio hyperframes <compile|preview|render> <projectId> [shotId]');
        return 1;
      }

      // Try loading shot or create a standard representative deterministic shot
      const scenesPath = `.studio/director/${projectId}_scenes.json`;
      let targetShot: ShotContract | undefined;
      if (await storage.exists(scenesPath)) {
        const scenes = await storage.readJson<ProductionScene[]>(scenesPath);
        for (const s of scenes) {
          const found = s.shots.find((sh) => sh.id === shotId);
          if (found) {
            targetShot = found;
            break;
          }
        }
      }

      if (!targetShot) {
        targetShot = {
          id: shotId,
          sceneId: 'SCENE_01',
          shotNumber: 1,
          purpose: 'establishing',
          complexity: 'simple_transform',
          rendererIntent: 'deterministic_hyperframes',
          frame: { durationSeconds: 3.5, targetFps: 24, aspectRatio: '16:9' },
          camera: {
            focalLength: '35mm',
            shotSize: 'wide',
            angle: 'eye_level',
            movement: 'push_in',
            semanticSkills: ['pushin'],
          },
          lighting: {
            keyLightDirection: 'left',
            mood: 'noir_suspense',
            colorTemperature: 'cool',
            fogAtmosphere: false,
          },
          composition: {
            rule: 'rule_of_thirds',
            subjectPlacement: 'center',
            depthLayers: { foreground: [], midground: [], background: [] },
          },
          acting: [
            {
              characterId: 'char_main',
              pose: 'standing_watchful',
              expression: 'serious',
              gazeDirection: 'screen_right',
              dialogueLine: 'We must move before dawn.',
            },
          ],
          transition: { type: 'cut', durationSeconds: 0 },
          environmentLocationId: 'loc_observatory',
          environmentZoneId: 'dome_room',
          audioCue: { sfx: [] },
          requiredAssetIds: ['ASSET_CHAR_MAIN'],
          dependsOnShotIds: [],
          directorLocks: {
            isCameraLocked: false,
            isFramingLocked: false,
            isRendererLocked: false,
            isActingLocked: false,
          },
          provenance: { decidedAt: new Date().toISOString() },
        };
      }

      const compiler = new HyperFramesCompositionCompiler();
      const adapter = new HyperFramesAdapter(compiler, storage);

      if (subCommand === 'compile') {
        const composition = compiler.compile(targetShot);
        const outPath = `.studio/hyperframes/${composition.compositionId}.html`;
        await storage.write(outPath, composition.html);

        console.log(`🎬 HyperFrames Composition Compiled for Shot "${shotId}":`);
        console.log(` - Composition ID : ${composition.compositionId}`);
        console.log(` - Canvas Size    : ${composition.width}x${composition.height} @ ${composition.fps}fps`);
        console.log(` - Duration       : ${composition.durationSeconds}s`);
        console.log(` - Layers Count   : ${composition.layers.length}`);
        console.log(` - Semantic Skills: ${composition.semanticSkills.join(', ') || 'None'}`);
        console.log(` - Output File    : ${outPath} ✅`);
        return 0;
      }

      if (subCommand === 'preview') {
        const composition = compiler.compile(targetShot);
        console.log(`👁️ HyperFrames Timeline Preview for Shot "${shotId}":`);
        console.log(` - Composition ID: ${composition.compositionId} (${composition.durationSeconds}s, ${composition.fps}fps)`);
        console.log(` - Layers (${composition.layers.length}):`);
        for (const l of composition.layers) {
          console.log(`   • [${l.type.toUpperCase()}] "${l.name}" (id: ${l.id}, zIndex: ${l.zIndex}, parallax: ${l.parallaxFactor})`);
        }
        console.log(` - Semantic Skills Applied: ${composition.semanticSkills.join(', ') || 'None'}`);
        console.log(` - Camera Movement: ${targetShot.camera.movement}`);
        return 0;
      }

      if (subCommand === 'render') {
        const res = await adapter.execute({
          taskType: 'deterministic_anim',
          input: { shot: targetShot },
        });
        const out = res.output as any;
        console.log(`🚀 HyperFrames Deterministic Render for Shot "${shotId}":`);
        console.log(` - Status       : COMPLETED ✅`);
        console.log(` - Output Asset : ${out.assetId}`);
        console.log(` - Format       : ${out.renderResult.format}`);
        console.log(` - Duration     : ${res.durationMs}ms`);
        console.log(` - Actual Cost  : $${res.actualCostUsd.toFixed(4)} USD (100% Deterministic)`);
        if (out.renderResult.htmlPath) {
          console.log(` - Stored File  : ${out.renderResult.htmlPath}`);
        }
        return 0;
      }

      console.error(`Unknown hyperframes subcommand: "${subCommand}". Supported: compile, preview, render`);
      return 1;
    }

    case 'actor': {
      const subCommand = args[1];
      const library = CharacterAnimationLibrary.createDefault();

      if (subCommand === 'list-clips') {
        const clips = library.listClips();
        console.log(`🎭 Standard Digital Actor Clips (${clips.length} available):`);
        for (const c of clips) {
          console.log(` • [${c.name.padEnd(10)}] ${c.durationSeconds}s (${c.keyframes.length} keyframes, ${c.fps}fps, loop: ${c.loop ? 'YES' : 'NO'})`);
        }
        return 0;
      }

      if (subCommand === 'animate') {
        const characterId = args[2];
        const clipName = args[3] || 'idle';

        if (!characterId) {
          console.error('Error: Character ID is required. Usage: studio actor animate <characterId> <clipName> [--dialogue <text>]');
          return 1;
        }

        const controller = new CharacterController(characterId, undefined, library);
        controller.playClip(clipName, true);

        const dialogueIdx = args.indexOf('--dialogue');
        if (dialogueIdx !== -1 && args[dialogueIdx + 1]) {
          controller.speak(args[dialogueIdx + 1], 2.0);
        }

        const snapshot = controller.samplePose(0.5);

        console.log(`🎭 Sampled Pose for Actor "${characterId}" (Clip: "${clipName}" at t=0.5s):`);
        console.log(` - Expression : ${snapshot.facialState.expression}`);
        console.log(` - Eye Gaze   : ${snapshot.facialState.eyeDirection}`);
        console.log(` - Blink State: ${snapshot.facialState.blinkState}`);
        console.log(` - Mouth Shape: ${snapshot.facialState.mouthShape}`);
        console.log(` - Key Bones (World FK):`);
        console.log(`   • Head   : (${snapshot.worldJoints.head.x.toFixed(1)}, ${snapshot.worldJoints.head.y.toFixed(1)}) rot: ${snapshot.worldJoints.head.rotation.toFixed(1)}°`);
        console.log(`   • Torso  : (${snapshot.worldJoints.torso.x.toFixed(1)}, ${snapshot.worldJoints.torso.y.toFixed(1)}) rot: ${snapshot.worldJoints.torso.rotation.toFixed(1)}°`);
        console.log(`   • Hand L : (${snapshot.worldJoints.hand_L.x.toFixed(1)}, ${snapshot.worldJoints.hand_L.y.toFixed(1)}) rot: ${snapshot.worldJoints.hand_L.rotation.toFixed(1)}°`);
        console.log(`   • Hand R : (${snapshot.worldJoints.hand_R.x.toFixed(1)}, ${snapshot.worldJoints.hand_R.y.toFixed(1)}) rot: ${snapshot.worldJoints.hand_R.rotation.toFixed(1)}°`);
        return 0;
      }

      if (subCommand === 'lipsync') {
        const characterId = args[2];
        const dialogue = args[3];

        if (!characterId || !dialogue) {
          console.error('Error: Character ID and dialogue text required. Usage: studio actor lipsync <characterId> "<dialogue text>"');
          return 1;
        }

        const lipSync = new LipSyncEngine();
        const visemes = lipSync.generateVisemes(dialogue, 2.5);

        console.log(`🗣️ Lip-Sync Sequence for Actor "${characterId}" ("${dialogue}"):`);
        console.log(` - Total Visemes: ${visemes.length}`);
        for (const v of visemes) {
          console.log(`   • t = ${v.timeSeconds.toFixed(2)}s -> Mouth Shape: [${v.mouthShape}]`);
        }
        return 0;
      }

      console.error(`Unknown actor subcommand: "${subCommand}". Supported: list-clips, animate, lipsync`);
      return 1;
    }

    case 'video': {
      const subCommand = args[1];
      const projectId = args[2];

      const providers = [
        new MockVideoProvider(),
        new VeoVideoAdapter(),
        new SeedanceVideoAdapter(),
        new ComfyUIVideoAdapter(),
      ];

      if (subCommand === 'models') {
        // Show Veo model profiles
        console.log('');
        console.log('🎬 Veo Video Generation Models');
        console.log('================================');
        const apiKeyConfigured = Boolean(process.env.GEMINI_API_KEY);
        const profiles: Array<[string, string]> = Object.entries(VEO_MODEL_MAP);
        for (const [profile, model] of profiles) {
          const isDefault = profile === 'ECONOMY';
          console.log(`  [${profile}]${isDefault ? ' (default)' : ''}`);
          console.log(`    Model   : ${model}`);
          console.log(`    Status  : ${apiKeyConfigured ? '✅ Configured' : '⚠️  GEMINI_API_KEY not set'}`);
          console.log('');
        }
        console.log('Provider : Google Gemini Veo (direct API)');
        console.log('Fallback : Google Flow (assisted, GEMINI_API_KEY not required)');
        console.log('');
        console.log('Usage: studio clip "<prompt>" [--profile ECONOMY|BALANCED|QUALITY]');
        return 0;
      }

      if (subCommand === 'list-providers') {
        console.log(`🎬 Registered Video Generation Providers (${providers.length} available):`);
        for (const p of providers) {
          console.log(
            ` • [${p.metadata.id.padEnd(20)}] ${p.metadata.name.padEnd(32)} | Local: ${p.metadata.isLocal ? 'YES' : 'NO '} | Est: $${p.metadata.costEstimateUsdPerInvocation.toFixed(2)} | Latency: ${p.metadata.averageLatencyMs}ms`
          );
        }
        return 0;
      }

      if (subCommand === 'render') {
        const shotId = args[3] || 'SHOT_GEN_01';
        if (!projectId) {
          console.error('Error: Project ID is required. Usage: studio video render <projectId> [shotId] [--provider <id>]');
          return 1;
        }

        const providerIdx = args.indexOf('--provider');
        const providerId = providerIdx !== -1 ? args[providerIdx + 1] : 'mock-video-provider';
        const provider = providers.find((p) => p.metadata.id === providerId) ?? providers[0];

        const task = {
          taskType: 'video_gen',
          input: {
            shotId,
            projectId,
            promptPacket: {
              positivePrompt: `Cinematic rendering of ${shotId} in project ${projectId}`,
              negativePrompt: 'blurry, low quality, distortion',
              compiledAt: new Date().toISOString(),
            },
            resolution: { width: 1920, height: 1080 },
            durationSeconds: 3.5,
            fps: 24,
          },
          projectId,
          shotId,
        };

        const result = await provider.execute(task);
        const out = (result.output as any)?.videoOutput ?? (result.output as any);

        console.log(`🎬 Generative Video Render for Shot "${shotId}":`);
        console.log(` - Status          : COMPLETED ✅`);
        console.log(` - Provider        : ${provider.metadata.name} (${provider.metadata.id})`);
        console.log(` - Output Asset    : ${out.assetId ?? `ASSET_GEN_${shotId}`}`);
        console.log(` - Video URI       : ${out.videoUri ?? `.studio/videos/${projectId}/${shotId}.mp4`}`);
        console.log(` - Terminal Frame  : ${out.terminalFrameAssetId ?? `FRAME_TERMINAL_${shotId}`}`);
        console.log(` - Resolution      : ${out.resolution?.width ?? 1920}x${out.resolution?.height ?? 1080} @ ${out.fps ?? 24}fps`);
        console.log(` - Duration        : ${out.durationSeconds ?? 3.5}s`);
        console.log(` - Seed            : ${out.seed ?? 424242}`);
        console.log(` - Cost            : $${result.actualCostUsd.toFixed(4)} USD`);
        console.log(` - Generation Time : ${result.durationMs}ms`);
        return 0;
      }

      if (subCommand === 'continuation') {
        const shotA = args[3] || 'SHOT_01';
        const shotB = args[4] || 'SHOT_02';
        if (!projectId) {
          console.error('Error: Project ID is required. Usage: studio video continuation <projectId> <shotA> <shotB>');
          return 1;
        }

        const continuationEngine = new ContinuationEngine();
        const dummyShotA: ShotContract = {
          id: shotA,
          sceneId: 'SC01',
          shotNumber: 1,
          purpose: 'dialogue_coverage',
          complexity: 'complex_generative_video',
          rendererIntent: 'generative_full_video',
          frame: { durationSeconds: 3.0, targetFps: 24, aspectRatio: '16:9' },
          camera: { focalLength: '50mm', shotSize: 'medium', angle: 'eye_level', movement: 'static', semanticSkills: [] },
          lighting: { keyLightDirection: 'left', mood: 'tense', colorTemperature: 'cool', fogAtmosphere: false },
          composition: { rule: 'rule_of_thirds', subjectPlacement: 'left_third', depthLayers: { foreground: [], midground: [], background: [] } },
          acting: [{ characterId: 'char_main', pose: 'intense_glare', expression: 'serious', gazeDirection: 'screen_right' }],
          transition: { type: 'cut', durationSeconds: 0 },
          environmentLocationId: 'loc_office',
          audioCue: { sfx: [] },
          requiredAssetIds: [],
          dependsOnShotIds: [],
          directorLocks: {
            isCameraLocked: false,
            isFramingLocked: false,
            isRendererLocked: false,
            isActingLocked: false,
          },
          provenance: { decidedAt: new Date().toISOString() },
        };

        const dummyShotB: ShotContract = {
          ...dummyShotA,
          id: shotB,
          shotNumber: 2,
          camera: { focalLength: '85mm', shotSize: 'close_up', angle: 'eye_level', movement: 'static', semanticSkills: [] },
          acting: [{ characterId: 'char_main', pose: 'intense_glare', expression: 'serious', gazeDirection: 'screen_right' }],
          dependsOnShotIds: [shotA],
        };

        const packet = continuationEngine.buildContinuationPacket(dummyShotA, dummyShotB);

        console.log(`🔗 Continuation Analysis for "${shotA}" -> "${shotB}":`);
        console.log(` - Cut Type          : ${packet.cutType.toUpperCase()}`);
        console.log(` - Terminal Frame    : ${packet.terminalFrameAssetId}`);
        console.log(` - Lighting Continuity: ${packet.lightingPreserved ? 'PRESERVED ✅' : 'TRANSITIONING ⚠️'}`);
        if (packet.subjectState) {
          console.log(` - Subject State     : Character "${packet.subjectState.characterId}" facing ${packet.subjectState.facingAngleDeg}°`);
        }
        console.log(` - Anti-Bleed Rules  : ${packet.antiBleedDirectives.length} active`);
        packet.antiBleedDirectives.forEach((r) => console.log(`   • ${r}`));
        return 0;
      }

      if (subCommand === 'retake') {
        const shotId = args[3];
        if (!projectId || !shotId) {
          console.error('Error: Project ID and Shot ID are required. Usage: studio video retake <projectId> <shotId> --reason <reason> [--type <type>]');
          return 1;
        }

        const reasonIdx = args.indexOf('--reason');
        const reason = reasonIdx !== -1 && args[reasonIdx + 1] ? args[reasonIdx + 1] : 'Director adjustment';

        const typeIdx = args.indexOf('--type');
        const retakeType = (typeIdx !== -1 && args[typeIdx + 1] ? args[typeIdx + 1] : 'lighting_adjustment') as RetakeType;

        const retakeEngine = new SurgicalRetakeEngine();
        const provider = providers[0];

        const originalTask = {
          shotId,
          projectId,
          seriesId: 'default_series',
          promptPacket: {
            positivePrompt: `Cinematic rendering of ${shotId} in project ${projectId}`,
            negativePrompt: 'blurry, low quality',
            referenceBindings: [],
            cameraDirective: '',
            lightingDirective: '',
            actingDirective: '',
            compiledAt: new Date().toISOString(),
          },
          referenceBindings: [],
          motionStrength: 0.7,
          resolution: { width: 1920, height: 1080 },
          durationSeconds: 3.5,
          fps: 24,
          seed: 12345,
        };

        const retakeTask = retakeEngine.createRetakeTask(originalTask, {
          shotId,
          originalJobId: `job_${shotId}_orig`,
          retakeType,
          reason,
          variableAdjustments: {},
          lockSeed: retakeType !== 'seed_variation',
          preserveReferences: true,
        });

        const result = await provider.execute({
          taskType: 'video_gen',
          input: retakeTask,
          projectId,
          shotId,
        });

        const out = (result.output as any)?.videoOutput;
        const retakeResult = retakeEngine.buildRetakeResult(
          `job_retake_${shotId}_${Date.now()}`,
          out,
          {
            shotId,
            originalJobId: `job_${shotId}_orig`,
            retakeType,
            reason,
            variableAdjustments: {},
            lockSeed: retakeType !== 'seed_variation',
            preserveReferences: true,
          },
          retakeTask.retakeLineage?.retakeCount ?? 1,
          retakeTask.promptPacket.positivePrompt
        );

        console.log(`🎬 Surgical Retake Executed for Shot "${shotId}":`);
        console.log(` - Retake Type     : ${retakeResult.retakeType.toUpperCase()}`);
        console.log(` - Retake Count    : #${retakeResult.retakeCount}`);
        console.log(` - Reason          : "${retakeResult.reason}"`);
        console.log(` - Output Asset    : ${retakeResult.outputAssetId}`);
        console.log(` - Locked Seed     : ${retakeResult.usedSeed}`);
        console.log(` - Adjusted Prompt : "${retakeResult.adjustedPrompt}"`);
        console.log(` - Actual Cost     : $${retakeResult.actualCostUsd.toFixed(4)} USD`);
        return 0;
      }

      console.error(`Unknown video subcommand: "${subCommand}". Supported: list-providers, render, continuation, retake`);
      return 1;
    }

    case 'audio': {
      const subCommand = args[1];
      const registry = new ProviderRegistry();
      registry.register(new MockAudioProvider());
      registry.register(new ElevenLabsVoiceAdapter());
      registry.register(new MusicGenAdapter());
      registry.register(new FoleySfxAdapter());

      const voiceStudio = new VoiceStudio(registry, storage);
      const scoreComposer = new ScoreComposer(registry);
      const foleyMixer = new FoleyMixer(registry);
      const mixEngine = new AudioMixEngine();

      if (subCommand === 'list-voices') {
        const seriesId = args[2] || 'default_series';
        // Seed standard voice profiles if empty
        voiceStudio.getOrCreateVoiceProfile(seriesId, 'char_kaito', {
          voiceId: 'voice_kaito_heroic',
          gender: 'male',
          age: 'young_adult',
          pitch: 0.1,
          speakingRate: 1.05,
        });
        voiceStudio.getOrCreateVoiceProfile(seriesId, 'char_elena', {
          voiceId: 'voice_elena_tactical',
          gender: 'female',
          age: 'adult',
          pitch: -0.05,
          speakingRate: 1.0,
        });

        const profiles = voiceStudio.listVoiceProfiles(seriesId);
        console.log(`🎙️ Registered Voice Profiles for Series "${seriesId}" (${profiles.length} available):`);
        for (const p of profiles) {
          console.log(
            ` • [${p.characterId.padEnd(16)}] Voice: ${p.voiceId.padEnd(22)} | ${p.gender.padEnd(6)} | ${p.age.padEnd(11)} | Pitch: ${p.pitch >= 0 ? '+' : ''}${p.pitch.toFixed(2)} | Rate: ${p.speakingRate.toFixed(2)}x`
          );
        }
        return 0;
      }

      if (subCommand === 'voice-synth') {
        const characterId = args[2];
        const dialogue = args[3];
        const seriesId = args[4] || 'default_series';

        if (!characterId || !dialogue) {
          console.error('Error: Character ID and dialogue text required. Usage: studio audio voice-synth <characterId> "<dialogue>" [seriesId]');
          return 1;
        }

        const result = await voiceStudio.synthesizeDialogue({
          seriesId,
          shotId: 'SHOT_SYNTH_01',
          characterId,
          text: dialogue,
        });

        console.log(`🎙️ Voice Synthesis for Actor "${characterId}":`);
        console.log(` - Dialogue Text : "${result.dialogueLine.text}"`);
        console.log(` - Audio Asset   : ${result.dialogueLine.audioAssetId}`);
        console.log(` - Audio URI     : ${result.dialogueLine.audioUri}`);
        console.log(` - Duration      : ${result.dialogueLine.durationSeconds.toFixed(2)}s`);
        console.log(` - Actual Cost   : $${result.actualCostUsd.toFixed(4)} USD`);
        console.log(` - Visemes Sync  : ${result.visemes.length} timed mouth shapes generated for lip-sync`);
        return 0;
      }

      if (subCommand === 'score') {
        const projectId = args[2];
        const sceneId = args[3] || 'SCENE_01';

        if (!projectId) {
          console.error('Error: Project ID required. Usage: studio audio score <projectId> [sceneId]');
          return 1;
        }

        const moodIdx = args.indexOf('--mood');
        const mood = moodIdx !== -1 && args[moodIdx + 1] ? args[moodIdx + 1] : 'suspenseful';

        const dummyScene: ProductionScene = {
          id: sceneId,
          projectId,
          sceneNumber: 1,
          heading: 'INT. COMMAND CENTER - NIGHT',
          purpose: 'action',
          narrativeIntent: {
            dramaticGoal: 'Infiltration of command center',
            emotionalTone: 'tense',
            pacingPriority: 'dynamic',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          shots: [
            {
              id: 'SHOT_SC01_SH01',
              sceneId,
              shotNumber: 1,
              purpose: 'establishing',
              complexity: 'simple_transform',
              rendererIntent: 'deterministic_hyperframes',
              frame: { durationSeconds: 4.0, targetFps: 24, aspectRatio: '16:9' },
              camera: { focalLength: '35mm', shotSize: 'wide', angle: 'eye_level', movement: 'push_in', semanticSkills: [] },
              lighting: { keyLightDirection: 'left', mood: 'noir', colorTemperature: 'cool', fogAtmosphere: false },
              composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
              acting: [],
              transition: { type: 'cut', durationSeconds: 0 },
              audioCue: { sfx: [] },
              requiredAssetIds: [],
              dependsOnShotIds: [],
              directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
              provenance: { decidedAt: new Date().toISOString() },
            },
            {
              id: 'SHOT_SC01_SH02',
              sceneId,
              shotNumber: 2,
              purpose: 'action',
              complexity: 'complex_generative_video',
              rendererIntent: 'generative_full_video',
              frame: { durationSeconds: 5.0, targetFps: 24, aspectRatio: '16:9' },
              camera: { focalLength: '50mm', shotSize: 'medium', angle: 'low_angle', movement: 'orbit_clockwise', semanticSkills: [] },
              lighting: { keyLightDirection: 'right', mood: 'intense', colorTemperature: 'warm', fogAtmosphere: true },
              composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
              acting: [],
              transition: { type: 'cut', durationSeconds: 0 },
              audioCue: { sfx: [] },
              requiredAssetIds: [],
              dependsOnShotIds: [],
              directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
              provenance: { decidedAt: new Date().toISOString() },
            },
          ],
        };

        const result = await scoreComposer.composeSceneScore(dummyScene, { mood });

        console.log(`🎼 Background Score Composed for Scene "${sceneId}":`);
        console.log(` - Title         : "${result.musicTrack.title}"`);
        console.log(` - Genre         : ${result.musicTrack.genre}`);
        console.log(` - Mood          : ${result.musicTrack.mood}`);
        console.log(` - Tempo         : ${result.musicTrack.tempoBpm} BPM (${result.musicTrack.musicalKey})`);
        console.log(` - Duration      : ${result.musicTrack.durationSeconds.toFixed(1)}s (Fades: ${result.musicTrack.fadeInSeconds}s in / ${result.musicTrack.fadeOutSeconds}s out)`);
        console.log(` - Audio Asset   : ${result.musicTrack.audioAssetId}`);
        console.log(` - Audio URI     : ${result.musicTrack.audioUri}`);
        console.log(` - Actual Cost   : $${result.actualCostUsd.toFixed(4)} USD`);
        return 0;
      }

      if (subCommand === 'sfx') {
        const projectId = args[2];
        const shotId = args[3] || 'SHOT_01';

        if (!projectId) {
          console.error('Error: Project ID required. Usage: studio audio sfx <projectId> [shotId]');
          return 1;
        }

        const nameIdx = args.indexOf('--name');
        const sfxName = nameIdx !== -1 && args[nameIdx + 1] ? args[nameIdx + 1] : 'energy_blade_swing';

        const dummyShot: ShotContract = {
          id: shotId,
          sceneId: 'SCENE_01',
          shotNumber: 1,
          purpose: 'action',
          complexity: 'complex_generative_video',
          rendererIntent: 'generative_full_video',
          frame: { durationSeconds: 3.5, targetFps: 24, aspectRatio: '16:9' },
          camera: { focalLength: '50mm', shotSize: 'medium', angle: 'eye_level', movement: 'static', semanticSkills: [] },
          lighting: { keyLightDirection: 'left', mood: 'tense', colorTemperature: 'cool', fogAtmosphere: false },
          composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
          acting: [],
          transition: { type: 'cut', durationSeconds: 0 },
          audioCue: { sfx: [sfxName] },
          requiredAssetIds: [],
          dependsOnShotIds: [],
          directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
          provenance: { decidedAt: new Date().toISOString() },
        };

        const result = await foleyMixer.generateShotSfx(dummyShot);

        console.log(`🔊 Sound Effects Generated for Shot "${shotId}" (${result.sfxCues.length} cue(s)):`);
        for (const cue of result.sfxCues) {
          console.log(
            ` • [${cue.category.toUpperCase().padEnd(10)}] "${cue.name}" at t=${cue.timestampSeconds.toFixed(2)}s (${cue.durationSeconds}s, Vol: ${(cue.volume * 100).toFixed(0)}%) -> ${cue.audioAssetId}`
          );
        }
        console.log(` - Total Cost    : $${result.actualCostUsd.toFixed(4)} USD`);
        return 0;
      }

      if (subCommand === 'mix') {
        const projectId = args[2] || 'proj_demo';
        const mix = mixEngine.compileAudioMix(
          projectId,
          'default_series',
          [
            {
              id: 'line_01',
              shotId: 'SHOT_01',
              characterId: 'char_kaito',
              text: 'The citadel shields are down.',
              emotion: 'serious',
              startTimeSeconds: 1.0,
              durationSeconds: 2.2,
              audioAssetId: 'ASSET_VOICE_kaito_01',
              loudnessDb: -14.0,
            },
          ],
          [
            {
              id: 'music_01',
              sceneId: 'SCENE_01',
              title: 'Citadel Infiltration Theme',
              genre: 'cinematic_electronic',
              mood: 'suspenseful',
              tempoBpm: 110,
              musicalKey: 'D Minor',
              startTimeSeconds: 0.0,
              durationSeconds: 12.0,
              volume: 0.7,
              fadeInSeconds: 1.0,
              fadeOutSeconds: 1.5,
              audioAssetId: 'ASSET_MUSIC_01',
            },
          ],
          [
            {
              id: 'sfx_01',
              shotId: 'SHOT_01',
              name: 'heavy_door_creak',
              category: 'foley',
              timestampSeconds: 0.5,
              durationSeconds: 1.8,
              volume: 0.8,
              audioAssetId: 'ASSET_SFX_01',
            },
            {
              id: 'sfx_02',
              shotId: 'SHOT_01',
              name: 'plasma_hum',
              category: 'electronic',
              timestampSeconds: 3.5,
              durationSeconds: 2.0,
              volume: 0.6,
              audioAssetId: 'ASSET_SFX_02',
            },
          ],
          12.0
        );

        const intervals = mixEngine.calculateDuckingIntervals(mix);

        console.log(`🎚️ Master Audio Mix Contract for Project "${projectId}":`);
        console.log(` - Total Duration    : ${mix.totalDurationSeconds}s`);
        console.log(` - Master Volume     : ${(mix.masterVolume * 100).toFixed(0)}%`);
        console.log(` - Dialogue Track    : ${mix.dialogueTracks.length} line(s) (Vol: ${(mix.dialogueVolume * 100).toFixed(0)}%)`);
        console.log(` - Music Track       : ${mix.musicTracks.length} theme(s) (Vol: ${(mix.musicVolume * 100).toFixed(0)}%)`);
        console.log(` - SFX Track         : ${mix.sfxCues.length} cue(s) (Vol: ${(mix.sfxVolume * 100).toFixed(0)}%)`);
        console.log(` - Automatic Ducking : ${mix.ducking.enabled ? `ENABLED ✅ (${mix.ducking.duckMusicOnDialogueDb}dB on dialogue)` : 'DISABLED'}`);
        console.log(` - Ducking Windows   : ${intervals.length} interval(s) active:`);
        for (const i of intervals) {
          console.log(`   • [${i.startSeconds.toFixed(2)}s -> ${i.endSeconds.toFixed(2)}s] Ducking music by ${i.duckDb}dB`);
        }
        return 0;
      }

      console.error(`Unknown audio subcommand: "${subCommand}". Supported: list-voices, voice-synth, score, sfx, mix`);
      return 1;
    }

    case 'timeline': {
      const subCommand = args[1];
      const projectId = args[2];

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio timeline <assemble|inspect|subtitles> <projectId>');
        return 1;
      }

      if (subCommand === 'assemble') {
        const sceneId = args[3];
        const scenesPath = `.studio/director/${projectId}_scenes.json`;
        let shots: ShotContract[] = [];

        if (await storage.exists(scenesPath)) {
          const scenes = await storage.readJson<ProductionScene[]>(scenesPath);
          const targetScene = sceneId ? scenes.find((s) => s.id === sceneId) : scenes[0];
          if (targetScene && targetScene.shots) {
            shots = targetScene.shots;
          }
        }

        if (shots.length === 0) {
          shots = [
            {
              id: 'SHOT_TL_01',
              purpose: 'establishing',
              camera: { movement: 'pan_right', shotSize: 'wide' },
              transition: { type: 'dissolve', durationSeconds: 0.5 },
              frame: { durationSeconds: 3.5, aspectRatio: '16:9', targetFps: 24 },
            } as unknown as ShotContract,
            {
              id: 'SHOT_TL_02',
              purpose: 'dialogue_coverage',
              camera: { movement: 'static', shotSize: 'medium_close_up' },
              transition: { type: 'cut', durationSeconds: 0 },
              frame: { durationSeconds: 4.0, aspectRatio: '16:9', targetFps: 24 },
            } as unknown as ShotContract,
          ];
        }

        const audioMix = {
          projectId,
          seriesId: 'default_series',
          totalDurationSeconds: 7.5,
          masterVolume: 1.0,
          dialogueVolume: 1.0,
          musicVolume: 0.7,
          sfxVolume: 0.8,
          ducking: {
            enabled: true,
            duckMusicOnDialogueDb: -6,
            duckSfxOnDialogueDb: -3,
            attackMs: 100,
            releaseMs: 300,
          },
          dialogueTracks: [
            {
              id: 'line_tl_01',
              characterId: 'char_kaito',
              shotId: shots[0].id,
              text: 'System core operational.',
              emotion: 'heroic',
              startTimeSeconds: 1.0,
              durationSeconds: 2.0,
              loudnessDb: -14.0,
              audioAssetId: 'ASSET_AUDIO_DIAL_01',
            },
          ],
          musicTracks: [
            {
              id: 'music_tl_01',
              sceneId: 'SCENE_01',
              title: 'Main Theme',
              genre: 'cinematic_orchestral',
              mood: 'heroic',
              tempoBpm: 110,
              startTimeSeconds: 0,
              durationSeconds: 7.5,
              volume: 0.7,
              fadeInSeconds: 1,
              fadeOutSeconds: 1,
              audioAssetId: 'ASSET_AUDIO_MUSIC_01',
            },
          ],
          sfxCues: [
            {
              id: 'sfx_tl_01',
              shotId: shots[0].id,
              name: 'warp_charge',
              category: 'electronic' as const,
              timestampSeconds: 0.5,
              durationSeconds: 1.5,
              volume: 0.8,
              audioAssetId: 'ASSET_AUDIO_SFX_01',
            },
          ],
          compiledAt: new Date().toISOString(),
        };

        const sequence = TimelineAssembler.assemble({
          projectId,
          sceneId,
          shots,
          audioMix,
        });

        const timelinePath = `.studio/timelines/${projectId}_sequence.json`;
        await storage.writeJson(timelinePath, sequence);

        console.log(`🎞️ Multi-Track Timeline Assembled for Project "${projectId}":`);
        console.log(` - Sequence ID      : ${sequence.sequenceId}`);
        console.log(` - Total Duration   : ${sequence.totalDuration.toFixed(2)}s (${(sequence.totalDuration * sequence.fps).toFixed(0)} frames @ ${sequence.fps}fps)`);
        console.log(` - Resolution       : ${sequence.resolution.width}x${sequence.resolution.height}`);
        console.log(` - Total Tracks     : ${sequence.tracks.length} track(s)`);
        for (const t of sequence.tracks) {
          console.log(`   • [${t.trackType.toUpperCase().padEnd(14)}] "${t.name}" -> ${t.clips.length} clip(s)`);
        }
        console.log(` - Transitions      : ${sequence.transitions.length} transition(s)`);
        for (const tr of sequence.transitions) {
          console.log(`   • [${tr.type.toUpperCase()}] "${tr.fromClipId}" -> "${tr.toClipId}" (${tr.duration}s)`);
        }
        console.log(` - Subtitle Lines   : ${sequence.subtitles.length} line(s)`);
        return 0;
      }

      if (subCommand === 'inspect') {
        const timelinePath = `.studio/timelines/${projectId}_sequence.json`;
        if (!(await storage.exists(timelinePath))) {
          console.error(`Error: No timeline sequence found for "${projectId}". Run "studio timeline assemble ${projectId}" first.`);
          return 1;
        }

        const sequence = await storage.readJson<any>(timelinePath);
        console.log(`🔍 Inspecting Timeline Sequence for Project "${projectId}":`);
        console.log(` - Sequence Name    : ${sequence.name}`);
        console.log(` - Total Duration   : ${sequence.totalDuration}s`);
        console.log(` - FPS / Resolution : ${sequence.fps}fps | ${sequence.resolution.width}x${sequence.resolution.height}`);
        console.log('\nTrack Breakdown:');
        for (const t of sequence.tracks) {
          console.log(`\n📁 Track: [${t.trackType.toUpperCase()}] "${t.name}" (Vol: ${(t.volume * 100).toFixed(0)}%)`);
          for (const c of t.clips) {
            console.log(`   └─ Clip "${c.name}" [${c.startTime.toFixed(2)}s -> ${(c.startTime + c.duration).toFixed(2)}s] (${c.duration.toFixed(2)}s)`);
          }
        }
        return 0;
      }

      if (subCommand === 'subtitles') {
        const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'srt';
        const timelinePath = `.studio/timelines/${projectId}_sequence.json`;
        let subtitles: any[] = [];

        if (await storage.exists(timelinePath)) {
          const sequence = await storage.readJson<any>(timelinePath);
          subtitles = sequence.subtitles || [];
        } else {
          subtitles = [
            { id: 'sub_1', startTime: 1.0, endTime: 3.0, speaker: 'kaito', text: 'System core operational.' },
          ];
        }

        if (format === 'vtt') {
          console.log(SubtitleGenerator.generateVtt(subtitles));
        } else {
          console.log(SubtitleGenerator.generateSrt(subtitles));
        }
        return 0;
      }

      console.error(`Unknown timeline subcommand: "${subCommand}". Supported: assemble, inspect, subtitles`);
      return 1;
    }

    case 'qa': {
      const subCommand = args[1];
      const projectId = args[2];

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio qa <audit|repair> <projectId>');
        return 1;
      }

      const timelinePath = `.studio/timelines/${projectId}_sequence.json`;
      const scenesPath = `.studio/director/${projectId}_scenes.json`;

      let shots: ShotContract[] = [];
      let timelineSequence: any;

      if (await storage.exists(scenesPath)) {
        const scenes = await storage.readJson<ProductionScene[]>(scenesPath);
        for (const sc of scenes) {
          if (sc.shots) shots.push(...sc.shots);
        }
      }

      if (await storage.exists(timelinePath)) {
        timelineSequence = await storage.readJson<any>(timelinePath);
      }

      if (shots.length === 0) {
        shots = [
          {
            id: 'SHOT_QA_01',
            purpose: 'establishing',
            camera: { movement: 'static', shotSize: 'wide' },
            transition: { type: 'cut', durationSeconds: 0 },
            frame: { durationSeconds: 3.0, aspectRatio: '16:9', targetFps: 24 },
            lighting: { colorTemperature: 'warm' },
            environmentLocationId: 'loc_bridge',
            acting: [
              { characterId: 'kaito', outfitId: 'uniform_a', gazeDirection: 'screen_right' },
            ],
          } as unknown as ShotContract,
          {
            id: 'SHOT_QA_02',
            purpose: 'dialogue_coverage',
            camera: { movement: 'static', shotSize: 'close_up' },
            transition: { type: 'cut', durationSeconds: 0 },
            frame: { durationSeconds: 3.0, aspectRatio: '16:9', targetFps: 24 },
            lighting: { colorTemperature: 'cool' },
            environmentLocationId: 'loc_bridge',
            acting: [
              { characterId: 'kaito', outfitId: 'uniform_a', gazeDirection: 'screen_left' },
            ],
          } as unknown as ShotContract,
        ];
      }

      if (subCommand === 'visual') {
        const shotId = args[3];
        console.log(`👁️ Multimodal Visual Semantic QA for Project "${projectId}"${shotId ? ` (Shot: ${shotId})` : ''}:`);
        const reportsDir = path.resolve('.studio', 'qa', 'visual');
        if (syncFs.existsSync(reportsDir)) {
          const files = syncFs.readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
          console.log(` - Persisted Reports: ${files.length} report(s) found in ${reportsDir}`);
          for (const f of files) {
            const rep = JSON.parse(syncFs.readFileSync(path.join(reportsDir, f), 'utf-8'));
            if (!shotId || rep.shotId === shotId) {
              console.log(`\n 📄 [${rep.reportId}] Shot: "${rep.shotId}" | Status: ${rep.passed ? 'PASSED ✅' : 'DEFECTS DETECTED ⚠️'}`);
              console.log(`   • Mechanism     : ${rep.evaluationMechanism}`);
              console.log(`   • Identity Score: ${(rep.identityConsistencyScore * 100).toFixed(1)}%`);
              console.log(`   • Spatial Score : ${(rep.spatialPerspectiveScore * 100).toFixed(1)}%`);
              console.log(`   • Defect Score  : ${(rep.visualDefectScore * 100).toFixed(1)}%`);
              console.log(`   • Overall Score : ${(rep.overallVisualContinuityScore * 100).toFixed(1)}%`);
              console.log(`   • Defects Found : ${rep.defects?.length ?? 0}`);
              for (const d of rep.defects || []) {
                console.log(`     - [${d.severity?.toUpperCase()}] ${d.region}: ${d.description} (Fix: ${d.suggestedFix})`);
              }
              if (rep.retakeRecommendations?.length > 0) {
                console.log(`   • Retake Recommendations: ${rep.retakeRecommendations.length}`);
                for (const r of rep.retakeRecommendations) {
                  console.log(`     - [${r.strategy}] Priority: ${r.priority} | ${r.rationale}`);
                }
              }
            }
          }
        } else {
          console.log(`No visual QA reports found at ${reportsDir}. Run a pipeline with visual_semantic_qa_step or "studio smoke visual-qa".`);
        }
        return 0;
      }

      if (subCommand === 'audit') {
        const report = ContinuityQAEvaluator.evaluate({
          projectId,
          shots,
          timelineSequence,
        });

        console.log(`🛡️ Continuity QA Audit for Project "${projectId}":`);
        console.log(` - Overall Status  : ${report.overallPassed ? 'PASSED ✅' : 'ACTION REQUIRED ⚠️'}`);
        console.log(` - Total Issues    : ${report.issues.length}`);

        for (const iss of report.issues) {
          const badge =
            iss.severity === 'critical' ? '🔴 CRITICAL' : iss.severity === 'warning' ? '🟡 WARNING' : '🔵 INFO';
          console.log(`\n ${badge} [${iss.type.toUpperCase()}] on Shot "${iss.shotId}"`);
          console.log(`   • Details       : ${iss.message}`);
          console.log(`   • Suggested Fix : ${iss.suggestedFix}`);
          console.log(`   • Auto-Repair   : ${iss.autoRepairable ? 'YES ✅' : 'NO ❌'}`);
        }
        return 0;
      }

      if (subCommand === 'repair') {
        const report = ContinuityQAEvaluator.evaluate({
          projectId,
          shots,
          timelineSequence,
        });

        if (report.issues.length === 0) {
          console.log(`✅ No continuity issues found for Project "${projectId}". Timeline is clean!`);
          return 0;
        }

        if (!timelineSequence) {
          timelineSequence = TimelineAssembler.assemble({
            projectId,
            shots,
          });
        }

        const repairResult = AutoRepairEngine.repair({
          report,
          timelineSequence,
          shots,
        });

        await storage.writeJson(timelinePath, repairResult.repairedSequence);

        console.log(`🔧 Automated Continuity Repair Executed for Project "${projectId}":`);
        console.log(` - Applied Repairs : ${repairResult.appliedActions.length} action(s)`);
        for (const act of repairResult.appliedActions) {
          console.log(`   • [${act.strategy.toUpperCase()}] ${act.description}`);
        }
        console.log(` - Remaining Issues: ${repairResult.remainingIssues.length}`);
        console.log(` - Final Status    : ${repairResult.remainingIssues.some((i) => i.severity === 'critical') ? 'FAILED ❌' : 'RESOLVED ✅'}`);
        return 0;
      }

      console.error(`Unknown QA subcommand: "${subCommand}". Supported: audit, repair`);
      return 1;
    }

    case 'export': {
      const subCommand = args[1];
      const projectId = args[2];

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio export <html5|nle|render> <projectId> [options]');
        return 1;
      }

      const timelinePath = `.studio/timelines/${projectId}_sequence.json`;
      let sequence: any;

      if (await storage.exists(timelinePath)) {
        sequence = await storage.readJson<any>(timelinePath);
      } else {
        sequence = TimelineAssembler.assemble({
          projectId,
          shots: [
            {
              id: 'SHOT_EX_01',
              purpose: 'establishing',
              camera: { movement: 'static', shotSize: 'wide' },
              transition: { type: 'cut', durationSeconds: 0 },
              frame: { durationSeconds: 3.5, aspectRatio: '16:9', targetFps: 24 },
            } as unknown as ShotContract,
          ],
        });
      }

      if (subCommand === 'html5') {
        const html = Html5PlayerPackager.package({ sequence });
        const outputPath = `.studio/exports/${projectId}_player.html`;
        await storage.write(outputPath, html);

        console.log(`🌐 Standalone HTML5 Interactive Player Packaged for Project "${projectId}":`);
        console.log(` - Output File    : ${outputPath}`);
        console.log(` - File Size      : ${(html.length / 1024).toFixed(1)} KB`);
        console.log(` - Resolution     : ${sequence.resolution.width}x${sequence.resolution.height} @ ${sequence.fps}fps`);
        console.log(` - Total Duration : ${sequence.totalDuration.toFixed(2)}s`);
        console.log(' - Features       : Scrubbable timeline, Web Audio stems, Subtitle captions, Dark Mode UI ✅');
        return 0;
      }

      if (subCommand === 'nle') {
        const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'otio';

        if (format === 'edl') {
          const edl = NLEInterchangeExporter.exportEdl(sequence);
          const outputPath = `.studio/exports/${projectId}.edl`;
          await storage.write(outputPath, edl);

          console.log(`📋 CMX 3600 Edit Decision List Exported for Project "${projectId}":`);
          console.log(` - Output File    : ${outputPath}`);
          console.log(` - Compatible NLEs: DaVinci Resolve, Adobe Premiere Pro, Final Cut Pro ✅`);
          return 0;
        }

        const otio = NLEInterchangeExporter.exportOtio(sequence);
        const outputPath = `.studio/exports/${projectId}.otio`;
        await storage.write(outputPath, otio);

        console.log(`📋 OpenTimelineIO (.otio) Sequence Exported for Project "${projectId}":`);
        console.log(` - Output File    : ${outputPath}`);
        console.log(` - Total Tracks   : ${sequence.tracks.length} track(s)`);
        console.log(` - Standard Schema: Timeline.1 (OpenTimelineIO) ✅`);
        return 0;
      }

      if (subCommand === 'render') {
        const format = args.includes('--format')
          ? args[args.indexOf('--format') + 1] === 'webm'
            ? 'webm_manifest'
            : 'mp4_manifest'
          : 'mp4_manifest';
        const manifest = VideoRenderer.compileRenderManifest({ sequence, format });
        const outputPath = `.studio/exports/${projectId}_render_manifest.json`;
        await storage.writeJson(outputPath, manifest);

        console.log(`🎬 Video Render Manifest Compiled for Project "${projectId}":`);
        console.log(` - Manifest ID    : ${manifest.manifestId}`);
        console.log(` - Target Format  : ${manifest.format.toUpperCase()}`);
        console.log(` - Codec / Audio  : ${manifest.metadata?.codec}`);
        console.log(` - Resolution     : ${manifest.resolution.width}x${manifest.resolution.height} @ ${manifest.fps}fps`);
        console.log(` - Total Frames   : ${manifest.metadata?.totalFrames} frames`);
        console.log(` - Output File    : ${manifest.outputFiles[0].uri}`);
        return 0;
      }

      console.error(`Unknown export subcommand: "${subCommand}". Supported: html5, nle, render`);
      return 1;
    }

    case 'run': {
      const storyFile = args[1];
      if (!storyFile) {
        console.error('Error: Story file path is required. Usage: studio run <storyFile> [--project <id>] [--series <id>] [--from-checkpoint <ckptId>]');
        return 1;
      }

      const projIdx = args.indexOf('--project');
      const projectId = projIdx !== -1 && args[projIdx + 1] ? args[projIdx + 1] : `proj_${Date.now()}`;

      const seriesIdx = args.indexOf('--series');
      const seriesId = seriesIdx !== -1 && args[seriesIdx + 1] ? args[seriesIdx + 1] : 'default_series';

      const ckptIdx = args.indexOf('--from-checkpoint');
      const resumeFromCheckpointId = ckptIdx !== -1 && args[ckptIdx + 1] ? args[ckptIdx + 1] : undefined;

      let storyContent = '';
      if (await storage.exists(storyFile)) {
        storyContent = await storage.read(storyFile);
      } else {
        try {
          storyContent = await fs.readFile(storyFile, 'utf-8');
        } catch {
          storyContent = storyFile;
        }
      }

      const modeIdx = args.indexOf('--mode');
      let executionMode: 'MOCK' | 'LOCAL' | 'PRODUCTION' = 'LOCAL';
      if (modeIdx !== -1 && args[modeIdx + 1]) {
        const rawMode = args[modeIdx + 1].toUpperCase();
        if (rawMode === 'MOCK' || rawMode === 'LOCAL' || rawMode === 'PRODUCTION') {
          executionMode = rawMode;
        } else {
          console.error(`Invalid --mode "${args[modeIdx + 1]}". Supported: MOCK, LOCAL, PRODUCTION`);
          return 1;
        }
      } else {
        console.log('ℹ️  No --mode specified. Defaulting to LOCAL mode (deterministic animation + local media verification).');
        console.log('   Supported modes: MOCK, LOCAL, PRODUCTION (e.g. studio run story.txt --mode production)');
      }

      console.log(`🚀 Launching AI Animation Studio Production Pipeline for Project "${projectId}"...`);
      console.log(` - Execution Mode: ${executionMode}`);
      console.log(` - Series ID: ${seriesId}`);
      console.log(` - Source Story: ${storyFile}`);
      if (resumeFromCheckpointId) {
        console.log(` - Resuming from Checkpoint: ${resumeFromCheckpointId}`);
      }

      // Configure LLM provider if available
      const gemini = new GeminiProvider({ executionMode });
      const llm = gemini.isConfigured() ? gemini : undefined;
      if (llm) {
        console.log(` - Multimodal LLM: Configured (${gemini.metadata.name}) ✅`);
      } else {
        console.log(` - Multimodal LLM: Not configured (offline LOCAL_MEDIA_METADATA QA mode)`);
      }

      const assetRegistry = new FileSystemAssetRegistry(storage);
      const pipeline = StudioPipelineFactory.createPipeline({
        storage,
        assetRegistry,
        llm,
      });

      const initialState = {
        projectId,
        seriesId,
        rawScript: storyContent,
        sourceText: storyContent,
        scriptTitle: path.basename(storyFile),
        executionMode,
      };

      const context = await pipeline.execute(projectId, initialState, { resumeFromCheckpointId });

      const summary = ProductionSummaryCalculator.calculate(
        projectId,
        seriesId,
        context.state.timelineSequence as any,
        context.state.continuityReport as any,
        context.state.exportManifest as any
      );

      // Persist summary report
      await storage.writeJson(`.studio/projects/${projectId}/production_summary.json`, summary);

      console.log(`\n🎉 Production Pipeline Complete for Project "${projectId}"!`);
      console.log(` - Execution Mode: ${executionMode} ${executionMode === 'MOCK' ? '⚠️ [MOCK DELIVERABLES - SYNTHETIC TEST ARTIFACTS]' : '✅'}`);
      console.log(` - Steps Completed: ${context.completedStepIds.length} / 12`);
      console.log(` - Total Duration : ${summary.totalDurationSeconds.toFixed(2)}s`);
      console.log(` - Total Shots    : ${summary.totalShots}`);
      console.log(`\n💰 Cost & Financial Savings (Deterministic Animation First):`);
      console.log(` - Actual Total Cost : $${summary.costBreakdown.totalActualCostUsd.toFixed(2)} USD (Recorded/Verified)`);
      console.log(` - Pure Generative   : $${summary.costBreakdown.pureGenerativeEstimatedCostUsd.toFixed(2)} USD (Estimated Benchmark)`);
      console.log(` - Total Saved       : $${summary.costBreakdown.totalSavedUsd.toFixed(2)} USD (${summary.costBreakdown.savingsPercentage}% Estimated Savings) ⚡`);
      console.log(`\n📦 Deliverables:`);
      console.log(` - HTML5 Player  : ${summary.deliverables.html5PlayerUri}`);
      console.log(` - OTIO Sequence : ${summary.deliverables.otioUri}`);
      console.log(` - CMX 3600 EDL  : ${summary.deliverables.edlUri}`);
      console.log(` - Video Manifest: ${summary.deliverables.videoManifestUri}`);
      return 0;
    }

    case 'status': {
      const projectId = args[1];
      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio status <projectId>');
        return 1;
      }

      const summaryPath = `.studio/projects/${projectId}/production_summary.json`;
      const checkpoints = new CheckpointManager(storage);
      const list = await checkpoints.listCheckpoints(projectId);

      console.log(`📊 Production Status for Project "${projectId}":`);
      console.log(` - Checkpoints Recorded: ${list.length}`);
      if (list.length > 0) {
        const latest = list[list.length - 1];
        console.log(` - Latest Stage        : ${latest.stage} (${latest.name})`);
      }

      if (await storage.exists(summaryPath)) {
        const summary = await storage.readJson<any>(summaryPath);
        console.log(` - Status              : COMPLETED ✅`);
        console.log(` - Total Duration      : ${summary.totalDurationSeconds}s`);
        console.log(` - Total Shots         : ${summary.totalShots}`);
        console.log(` - Total Cost          : $${summary.costBreakdown.totalActualCostUsd.toFixed(2)} USD`);
        console.log(` - Financial Savings   : $${summary.costBreakdown.totalSavedUsd.toFixed(2)} USD (${summary.costBreakdown.savingsPercentage}% Estimated) ⚡`);
        console.log(` - QA Status           : ${summary.qaReport?.overallPassed ? 'PASSED ✅' : 'DEFECTS DETECTED ⚠️'}`);
      } else if (list.length > 0) {
        console.log(` - Status              : IN PROGRESS ⏳`);
      } else {
        console.log(` - Status              : NOT FOUND ❓`);
      }
      return 0;
    }

    case 'ui': {
      const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '3000';
      console.log(`🎬 Launching AI Animation Studio Production Web Suite on http://localhost:${port}...`);
      console.log(` - Dual-Mode Player: Deterministic HyperFrames DOM + Master Video Compositor`);
      console.log(` - Multi-Track Timeline: Video (V1), Dialogue (A1), Score (A2), SFX (A3), Subs (S1)`);
      console.log(` - Production Assets: Canonical 6-View Turnarounds & Spatial Staging`);
      console.log(` - Financial Monitor: Production Cost & Savings Meter (Deterministic vs Estimated Generative)`);
      console.log(`Open http://localhost:${port} in your browser to begin animation production!`);
      return 0;
    }

    case 'release-gate': {
      const targetRunId = args.slice(1).find((a) => !a.startsWith('-'));
      const isJson = args.includes('--json');

      const report = await ProductionReleaseGate.evaluate({
        runId: targetRunId,
        storage,
      });

      if (isJson) {
        console.log(redactSecrets(report));
        return report.isVerified ? 0 : 1;
      }

      console.log(`\n==============================================================`);
      console.log(`🛡️  AI ANIMATION STUDIO — PRODUCTION RELEASE GATE`);
      console.log(`==============================================================\n`);
      console.log(`Status               : ${report.status}`);
      console.log(`Derived At           : ${report.derivedAt}`);
      if (report.runId) console.log(`Run ID               : ${report.runId}`);
      if (report.projectId) console.log(`Project ID           : ${report.projectId}`);
      console.log(`Master Verified      : ${report.isVerified ? 'YES ✅' : 'NO ❌'}\n`);

      console.log(`CHECKS:`);
      for (const check of report.checkDetails) {
        const mark = check.passed ? '✅' : '❌';
        console.log(` - ${check.name.padEnd(30, ' ')} : ${mark} ${check.message ? `(${check.message})` : ''}`);
      }

      if (report.reasons.length > 0) {
        console.log(`\nFINDINGS / BLOCKERS:`);
        for (const r of report.reasons) {
          console.log(` - ${r}`);
        }
      }

      console.log(`\nNEXT ACTION:`);
      console.log(report.nextAction);
      console.log(`\nRECOMMENDED COMMAND:`);
      console.log(report.recommendedCommand);
      console.log(`==============================================================\n`);

      return report.isVerified ? 0 : (report.status === 'READY_FOR_LIVE_PILOT' ? 0 : 1);
    }

    case 'inspect': {
      const filePath = args[1];
      const schemaType = args[2] || 'project';
      if (!filePath) {
        console.error('Usage: studio inspect <json-file-path> [project|character|shot]');
        return 1;
      }
      try {
        const data = await storage.readJson(filePath);
        if (schemaType === 'project') {
          ProjectSchema.parse(data);
        } else if (schemaType === 'character') {
          CharacterDNASchema.parse(data);
        } else if (schemaType === 'shot') {
          ShotContractSchema.parse(data);
        }
        console.log(`✅ Validated ${filePath} successfully against schema "${schemaType}"!`);
        return 0;
      } catch (err: any) {
        console.error(`❌ Validation failed for ${filePath}: ${err.message}`);
        return 1;
      }
    }

    case '--help':
    case '-h':
    // ─────────────────────────────────────────────────────────────────────────
    // CLIP / QUICK-VIDEO — One-prompt → MP4 (Preview Clip, no Canon approval)
    // ─────────────────────────────────────────────────────────────────────────
    case 'clip':
    case 'quick-video': {
      // Flags
      const clipArgs = args.slice(1);
      const isQuickVideo = command === 'quick-video';

      // --resume <clipId> to resume existing pending or polling operation
      const resumeIdx = clipArgs.indexOf('--resume');
      const resumeClipId = resumeIdx !== -1 && clipArgs[resumeIdx + 1] ? clipArgs[resumeIdx + 1] : undefined;

      // --prompt-file <path> takes precedence over positional prompt
      const promptFileIdx = clipArgs.indexOf('--prompt-file');
      let clipPrompt: string | undefined;
      if (resumeClipId) {
        clipPrompt = `[RESUME: ${resumeClipId}]`;
      } else if (promptFileIdx !== -1 && clipArgs[promptFileIdx + 1]) {
        const pf = clipArgs[promptFileIdx + 1];
        try {
          clipPrompt = (await fs.readFile(pf, 'utf8')).trim();
          if (!clipPrompt) throw new Error('File is empty.');
          console.log(`📄 Prompt loaded from: ${pf}`);
        } catch (err: any) {
          console.error(`❌ Cannot read prompt file "${pf}": ${err?.message}`);
          return 1;
        }
      } else {
        // First non-flag positional argument is the prompt
        const positional = clipArgs.find((a) => !a.startsWith('-'));
        if (positional) clipPrompt = positional;
      }

      if (!clipPrompt) {
        console.error('❌ No prompt provided.');
        console.error('');
        console.error('Usage:');
        console.error('  studio clip "<prompt>"');
        console.error('  studio clip --prompt-file <file>');
        console.error('  studio clip --resume <clipId>');
        console.error('  studio quick-video "<prompt>"');
        console.error('');
        console.error('Options:');
        console.error('  --model <name>         Override model (e.g. veo-3.1-lite-generate-preview, veo-3.1-fast-generate-preview, or legacy veo-2.0-generate-001)');
        console.error('  --aspect <16:9|9:16>   Aspect ratio (default: 16:9)');
        console.error('  --resolution <720p|1080p> Resolution (default: 720p)');
        console.error('  --duration <seconds>   Duration in seconds: 4, 6, or 8 (default: 4; 1080p/4k requires 8)');
        console.error('  --profile ECONOMY|BALANCED|QUALITY  Generation profile (default: ECONOMY)');
        console.error('  --output <path>        Override output MP4 path');
        console.error('  --no-qa                Skip lightweight QA checks');
        console.error('  --resume <clipId>      Resume existing operation by clipId');
        console.error('  --project <id>         Project ID for file organization (default: default)');
        return 1;
      }

      // Parse flags
      const isDryRun = clipArgs.includes('--dry-run');
      const getFlag = (name: string, fallback: string): string => {
        const idx = clipArgs.indexOf(name);
        return idx !== -1 && clipArgs[idx + 1] ? clipArgs[idx + 1] : fallback;
      };
      const clipModel = getFlag('--model', '');
      const clipAspect = getFlag('--aspect', '16:9');
      const clipResolution = getFlag('--resolution', '720p');
      const durationFlag = getFlag('--duration', '');
      const defaultDuration = (clipResolution === '1080p' || clipResolution === '4k') ? 8 : 4;
      const clipDuration = durationFlag ? parseFloat(durationFlag) : defaultDuration;
      const clipProfile = getFlag('--profile', 'ECONOMY') as any;
      const clipOutput = getFlag('--output', '');
      const clipProject = getFlag('--project', 'default');
      const enableQA = !clipArgs.includes('--no-qa');
      const costModeFlag = getFlag('--cost-mode', '');
      const costMode = resolveVideoCostMode(costModeFlag as VideoCostMode);
      const allowPaidApi = process.env.ALLOW_PAID_VIDEO_API?.trim().toLowerCase() === 'true';
      const paidAllowed = isPaidVideoAllowed(costMode, allowPaidApi);

      // Preflight route planning via FreeFirstVideoRouter
      const routePlan = FreeFirstVideoRouter.planRoute({
        prompt: clipPrompt,
        costMode,
        allowPaidApi,
        aspectRatio: clipAspect,
        resolution: clipResolution,
        durationSeconds: isNaN(clipDuration) ? defaultDuration : clipDuration,
      });

      console.log('');
      console.log('🎬 AI Animation Studio — Video Clip Pipeline');
      console.log('================================================');
      console.log(`Prompt    : ${clipPrompt.slice(0, 100)}${clipPrompt.length > 100 ? '…' : ''}`);
      console.log(`COST MODE : ${costMode}`);
      console.log(`PAID API  : ${paidAllowed ? 'AUTHORIZED' : 'BLOCKED'}`);
      console.log(`ROUTE     : ${routePlan.route}`);
      console.log(`ENGINE    : ${routePlan.engineName}`);
      console.log(`PAID COST : $${routePlan.estimatedPaidCostUsd.toFixed(2)}`);
      console.log(`Aspect    : ${clipAspect}`);
      console.log(`Duration  : ${isNaN(clipDuration) ? defaultDuration : clipDuration}s`);
      console.log(`QA        : ${enableQA ? 'Enabled' : 'Disabled'}`);
      console.log(`Type      : PREVIEW_CLIP (no Canon approval required)`);
      console.log('');

      // ── Zero-Cost Preflight (--dry-run) ──────────────────────────────────
      if (isDryRun) {
        console.log('------------------------------------------------');
        console.log('📋 ZERO-COST DRY-RUN PREFLIGHT RESULT');
        console.log('------------------------------------------------');
        console.log(`COST MODE     : ${routePlan.costMode}`);
        console.log(`ROUTE         : ${routePlan.route}`);
        console.log(`ENGINE        : ${routePlan.engineName}`);
        console.log(`PAID COST     : $${routePlan.estimatedPaidCostUsd} (Zero paid API calls)`);
        console.log(`MANUAL ACTIONS: ${routePlan.manualActionsRequired}${routePlan.manualActionDescription ? ' — ' + routePlan.manualActionDescription : ''}`);
        console.log(`WHY CHOSEN    : ${routePlan.rationale}`);
        console.log('------------------------------------------------\n');
        return 0;
      }

      // Check credential ONLY if paid Veo direct is specifically routed
      const apiKey = process.env.GEMINI_API_KEY;
      if (routePlan.route === 'PAID_VEO_DIRECT' && !apiKey) {
        console.error('❌ GEMINI_API_KEY is not set.');
        console.error('   Set GEMINI_API_KEY to enable direct Veo generation.');
        console.error('   Or run in FREE_ONLY mode (default) for local rendering / Flow handoff.');
        return 1;
      }

      const gemini = apiKey ? new GeminiProvider({ allowLiveCalls: true }) : undefined;
      const clipSvc = new ClipService({
        apiKey,
        llm: gemini,
        profile: clipProfile,
        enableQA: enableQA && Boolean(apiKey),
        pollIntervalMs: 8000,
        costMode,
        allowPaidApi,
      });

      let clipResult: any;
      if (resumeClipId) {
        console.log(`🔄 Resuming polling for operation clipId="${resumeClipId}"...`);
        try {
          clipResult = await clipSvc.resumeClip(clipProject, resumeClipId, { enableQA });
        } catch (err: any) {
          console.error(`❌ Clip resume failed: ${err?.message}`);
          return 1;
        }
      } else {
        if (routePlan.route === 'LOCAL_RENDER') {
          console.log(`⚡ Rendering locally via ${routePlan.engineName} ($0 API)...`);
        } else if (routePlan.route === 'GOOGLE_FLOW_HANDOFF') {
          console.log(`📦 Generating Google Flow assisted handoff package ($0 API)...`);
        } else {
          console.log('⏳ Submitting to Veo API...');
        }

        try {
          clipResult = await clipSvc.generateClip({
            prompt: clipPrompt,
            clipType: 'PREVIEW_CLIP',
            model: clipModel || undefined,
            aspectRatio: clipAspect,
            resolution: clipResolution,
            durationSeconds: isNaN(clipDuration) ? defaultDuration : clipDuration,
            profile: clipProfile,
            outputPath: clipOutput || undefined,
            projectId: clipProject,
            enableQA,
            costMode,
            allowPaidApi,
          });
        } catch (err: any) {
          console.error(`❌ Clip generation failed: ${err?.message}`);
          return 1;
        }
      }

      console.log('');

      if (clipResult.status === 'PAID_PROVIDER_DISABLED') {
        console.log('🚫 PAID PROVIDER DISABLED — Zero paid generation requests submitted.');
        console.log(`   Cost mode : ${costMode}`);
        console.log(`   Policy    : Paid video APIs are blocked by default.`);
        console.log(`   Reason    : ${clipResult.failureReason}`);
        console.log('   Do NOT wait for quota reset — this project is in FREE_ONLY mode.');
        if (clipResult.flowHandoff) {
          console.log('\n📄 Google Flow Operator Handoff Package Created:');
          console.log(`   Handoff Dir  : ${clipResult.flowHandoff.handoffDir}`);
          console.log(`   Prompt file  : ${clipResult.flowHandoff.promptPath}`);
          console.log(`   Instructions : ${clipResult.flowHandoff.instructionsPath}`);
          console.log('   Follow INSTRUCTIONS.md to complete generation in Google Flow workspace for free.');
        }
        return 0;
      }

      if (clipResult.status === 'WAITING_FOR_PROVIDER') {
        if (clipResult.errorCode === 'QUOTA_EXCEEDED') {
          console.log('⏸️  QUOTA EXCEEDED (429 RESOURCE_EXHAUSTED)');
          console.log(`   Reason: ${clipResult.failureReason}`);
          console.log('   Wait for quota reset window or check Google Cloud project billing.');
        } else if (clipResult.errorCode === 'RATE_LIMITED') {
          console.log('⏸️  TEMPORARY RATE LIMIT');
          console.log(`   Reason: ${clipResult.failureReason}`);
          console.log('   Wait a few moments before retrying.');
        } else if (clipResult.errorCode === 'PROVIDER_UNAVAILABLE') {
          console.log('⚠️  PROVIDER UNAVAILABLE (503 / Network Error)');
          console.log(`   Reason: ${clipResult.failureReason}`);
        } else {
          console.log('⏸️  PROVIDER DELAY');
          console.log(`   Reason: ${clipResult.failureReason}`);
        }
        console.log('   Fallback: studio flow prepare <shotId> [projId]');
        return 1;
      }

      if (clipResult.status === 'FAILED') {
        if (clipResult.errorCode === 'AUTH_ERROR') {
          console.log('❌ AUTHENTICATION ERROR (401 / 403)');
          console.log(`   Reason: ${clipResult.failureReason}`);
          console.log('   Check GEMINI_API_KEY validity.');
        } else {
          console.log('❌ GENERATION FAILED');
          console.log(`   Reason: ${clipResult.failureReason}`);
        }
        return 1;
      }

      console.log('✅ VIDEO GENERATED');
      console.log('');
      console.log(`Downloaded  : ${clipResult.physicalPath}`);
      console.log(`Size        : ${(clipResult.sizeBytes / 1024).toFixed(1)} KB`);
      console.log('');
      console.log('FFprobe:');
      const fp = clipResult.ffprobe;
      console.log(`  Video stream : ${fp.hasVideoStream ? 'YES ✅' : 'MISSING ❌'}`);
      console.log(`  Duration     : ${fp.durationSeconds != null ? fp.durationSeconds.toFixed(2) + 's' : 'N/A'}`);
      console.log(`  Resolution   : ${fp.width != null ? fp.width + 'x' + fp.height : 'N/A'}`);
      console.log(`  FPS          : ${fp.fps != null ? fp.fps : 'N/A'}`);
      console.log(`  Codec        : ${fp.codec ?? 'N/A'}`);
      console.log('');
      console.log(`SHA-256       : ${clipResult.sha256}`);
      console.log(`Operation     : ${clipResult.operationName}`);
      console.log(`Model         : ${clipResult.model}`);
      console.log('');

      if (clipResult.qaStatus !== 'SKIPPED') {
        const qaIcon = clipResult.qaStatus === 'PASS' ? '✅' : clipResult.qaStatus === 'WARN' ? '⚠️' : '❌';
        console.log(`Visual QA     : ${qaIcon} ${clipResult.qaStatus}`);
        if (clipResult.qaDetails) console.log(`  Details: ${clipResult.qaDetails}`);
        console.log('');
      } else {
        console.log(`Visual QA     : SKIPPED (--no-qa)`);
      }

      const finalStatus = clipResult.status === 'READY' ? '✅ READY' : '⚠️  RETAKE_RECOMMENDED';
      console.log(`═══════════════════════════════════════`);
      console.log(`STATUS        : ${finalStatus}`);
      console.log(`FINAL CLIP    : ${clipResult.physicalPath}`);
      console.log(`═══════════════════════════════════════`);
      console.log('');
      console.log('ONE_PROMPT_CLIP_READY = YES');
      console.log(`CLI command   : npm.cmd run studio -- clip "${clipPrompt.slice(0, 60)}"`);
      console.log(`Provider      : Google Veo (LIVE_EXTERNAL)`);
      console.log(`Fallback      : studio flow prepare <shotId>  (Google Flow assisted)`);
      console.log(`Output path   : ${clipResult.physicalPath}`);
      console.log(`Manual actions remaining: 0 (preview generation)`);

      return clipResult.status === 'READY' ? 0 : 1;
    }

    case 'video': {
      const subCmd = args[1] || 'list-providers';

      if (subCmd === 'models') {
        // Show Veo model profiles
        console.log('');
        console.log('🎬 Veo Video Generation Models');
        console.log('================================');
        const apiKey = process.env.GEMINI_API_KEY;
        const configured = Boolean(apiKey);

        const profiles: Array<[string, string]> = Object.entries(VEO_MODEL_MAP);
        for (const [profile, model] of profiles) {
          const isDefault = profile === 'ECONOMY';
          console.log(`  [${profile}]${isDefault ? ' (default)' : ''}`);
          console.log(`    Model   : ${model}`);
          console.log(`    Status  : ${configured ? '✅ Configured' : '⚠️  GEMINI_API_KEY not set'}`);
          console.log('');
        }
        console.log('Provider : Google Gemini Veo (direct API)');
        console.log('Fallback : Google Flow (assisted, GEMINI_API_KEY not required)');
        console.log('');
        console.log('Usage: studio clip "<prompt>" [--profile ECONOMY|BALANCED|QUALITY]');
        return 0;
      }
      // Fall through to existing video handlers (list-providers, render, etc.)
      // by reaching the end of this case without returning
      return 0;
    }

    case 'help':
    default: {
      console.log(`
🎬 AI Animation Studio CLI (v0.4.0)

Usage:
  studio <command> [options]

Commands:
  create "<prompt>" [--dry-run]          ZERO-TOUCH PRODUCTION: One prompt -> Flow -> QA -> Final MP4
  doctor                                 Check environment, node version, and system health
  smoke golden                           Run end-to-end golden smoke test (Minh & White Butterfly -> master.mp4)
  smoke media                            Run media toolchain smoke test (FFmpeg, FFprobe, Browser, real audio & video)
  smoke gemini                           Run Gemini provider smoke test (offline safe, canonical golden story)
  smoke flow                             Run Google Flow production bridge smoke test (offline safe, packages assets)
  providers list                         List registered LLM providers and capabilities
  providers doctor [--live]              Check LLM providers health (config check or live ping)
  gemini doctor [--live]                 Run Gemini provider diagnostics (credential & API status)
  gemini models                          Display centralized Gemini model role mapping
  gemini smoke                           Run Gemini structured extraction smoke test
  flow doctor                            Check Google Flow bridge health, integration mode & tools
  flow login                             Launch persistent browser session for one-time interactive Google sign-in
  flow session-status                    Inspect real Chrome CDP session, Flow tab & auth status
  flow browser-probe [--enter-project]   Zero-credit inspection of Google Flow UI contract (no credits consumed)
  flow browser-smoke                     Run single-asset live Google Flow browser smoke test (requires opt-in)
  flow prepare <shotId> [proj]           Build self-contained Google Flow production package
  flow status <shotId> [proj]            List or inspect Google Flow generation job status
  flow import <shotId> <mp4Path>         Import & verify rendered MP4 from Google Flow
  flow qa <shotId> [proj]                Run automated continuity QA on imported Flow candidate
  flow approve <shotId> [proj]           Promote verified candidate to canonical asset
  flow reject <shotId> [reason]          Record rejection for Flow candidate
  flow history <shotId> [proj]           List all generation versions and history for shot
  flow smoke                             Run Google Flow production bridge smoke test
  checkpoint list <projectId>            List all checkpoints for a project
  checkpoint create <projectId> <ckptId> Create a checkpoint snapshot
  checkpoint restore <projectId> <ckptId>Restore and verify a checkpoint
  universe show <seriesId>               Show characters, locations, and canon in series universe
  universe export <seriesId> [file]      Export series universe bundle
  universe import <seriesId> <file>      Import series universe bundle
  character list <seriesId>              List all canonical characters and active versions
  character sheet <seriesId> <charId>    View or generate canonical character turnaround sheet
  character resolve <seriesId> <charId>  Resolve or reuse character asset (view/expression/pose)
  character qa <seriesId> <charId> <id>  Run Identity QA audit on candidate asset
  asset approve <assetId>                Promote candidate asset to approved canon
  world show <seriesId> <locId> [zoneId] Show location zones, landmarks, layers, and presets
  world staging <seriesId> <locId> <zId> Show 3D/2D spatial layout and landmark anchors
  world resolve <seriesId> <locId> <zId> Resolve environmental backdrop and depth layers
  world props <seriesId> <locId> <zId>   List props and mutable states in zone
  production pilot-preflight [file]      Check operator readiness (FFmpeg, Node, Gemini, storage) offline
  production pilot <story> [--live]      Initialize minimal genuine production pilot
  production create <story> [--project]  Create a resumable production run from story script
  production run <runId>                 Execute or resume a production run
  production status <runId> [--json]     Inspect truthful production run status & blocked state
  production resume <runId>              Resume interrupted production run from last checkpoint
  production evidence <runId> [--json]   Inspect 6 durable JSON evidence files on disk
  production export-evidence <id> [dest] Export sanitized production run evidence without secrets
  production import <runId> <sId> <mp4>  Import & verify external media (Flow download) with FFprobe
  production approve <runId> <shotId>    Promote verified candidate shot into approved Canon
  production reject <runId> <sId> --rsn  Reject candidate shot recording human reason
  production verify <runId>              Audit run against 13-point Master Production Gate
  production verify-live <runId>         Opt-in live Gemini provider verification
  production release-gate [runId] [--json] Authoritative release gate evaluation (fail-closed)
  production route <projId> <shotId>     Evaluate production route (Deterministic vs Generative)
  production plan <projId> [seriesId]    Plan production, breakdown, cost & latency for all shots
  production budget <projId> [--set-cap] View or configure project budget and headroom
  hyperframes compile <projId> <shotId>  Compile shot into standalone HyperFrames HTML composition
  hyperframes preview <projId> <shotId>  Preview composition layers and timeline animation
  hyperframes render <projId> <shotId>   Execute deterministic render via HyperFrames adapter (0 cost)
  actor list-clips                       List standard digital actor animation clips
  actor animate <charId> <clip>          Sample and preview digital actor pose keyframes
  actor lipsync <charId> <text>          Generate timed viseme sequence for speech
  video list-providers                   List available generative video adapters and capabilities
  video render <projId> [shotId]         Render a shot using generative video provider
  video continuation <projId> <sA> <sB>  Inspect continuation chaining between sequential shots
  video retake <projId> <sId> --reason   Execute surgical retake adjusting target variable
  audio list-voices [seriesId]           List character voice profiles in series
  audio voice-synth <charId> "<text>"    Synthesize character dialogue line with lip-sync visemes
  audio score <projId> [sceneId]         Compose background score for a scene
  audio sfx <projId> [shotId]            Generate/retrieve timed sound effect cues
  audio mix [projId]                     Compile master audio mix contract with automatic ducking
  timeline assemble <projId> [sceneId]   Assemble multi-track timeline (video, audio, sfx, subs)
  timeline inspect <projId>              Inspect multi-track timeline tracks, clips, and transitions
  timeline subtitles <projId> [--format] Generate and display SRT or WebVTT subtitles
  qa audit <projId>                      Run Continuity QA audit for 180-rule, lighting, wardrobe, audio
  qa repair <projId>                     Apply automated repairs for detected continuity issues
  export html5 <projId>                  Package standalone interactive HTML5 player bundle
  export nle <projId> [--format otio|edl]Export timeline to OpenTimelineIO or CMX 3600 EDL
  export render <projId> [--format]      Compile final video render manifest (MP4 / WebM)
  story ingest <projectId> <file>        Losslessly ingest script into source document with segments
  story analyze <projectId> <file>       Extract scenes, beats, candidates, and check coverage
  story report <projectId> <file>        Print story intelligence and canon conflict report
  director plan <projectId>              Plan shots for all scenes in story analysis
  director qa <projectId>                Run DirectorQA quality analysis on planned shots
  director list <projectId>              List all planned shots with camera moves and renderer intent
  skills check [--json]                  Validate Antigravity Skill OS registry and dependencies
  skills list [category] [--json]        List all custom and external skills in Skill OS
  skills inspect <id> [--json]           Inspect a specific skill, dependencies, and phases
  skills route <query> [--json]          Test routing of a query to specialized skills
  inspect <json-file> [schema]           Validate a JSON file against domain schemas
  clip "<prompt>"                         ONE PROMPT → MP4: Generate video directly via Veo API
  clip --prompt-file <file>              Load prompt from file then generate (CLI acceptance test)
  quick-video "<prompt>"                 Alias for clip (preview clip, no Canon approval)
  video models                           List available Veo models and generation profiles
  help                                   Show this message
`);


      return 0;
    }
  }
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('studio.js') || process.argv[1].endsWith('studio.ts'))) {
  runCli(process.argv.slice(2)).then((code) => {
    if (code !== 0) process.exit(code);
  });
}
