#!/usr/bin/env node

/**
 * AI Animation Studio CLI
 */

import * as process from 'node:process';
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
} from '@ai-studio/core';
import * as path from 'node:path';

export interface CliContext {
  cwd: string;
  storage: FileSystemStorage;
}

export async function runCli(args: string[], context?: CliContext): Promise<number> {
  const cwd = context?.cwd ?? process.cwd();
  const storage = context?.storage ?? new FileSystemStorage(cwd);

  const command = args[0] || 'help';

  switch (command) {
    case 'doctor': {
      console.log('🩺 Running AI Animation Studio Doctor...');
      console.log(`- Node.js Version: ${process.version}`);
      console.log(`- Working Directory: ${cwd}`);
      console.log(`- Registered Semantic Skills: ${STANDARD_CINEMATIC_SKILLS.length} skills loaded`);
      const hasGit = await storage.exists('.git');
      console.log(`- Git Repository: ${hasGit ? 'Detected ✅' : 'Missing ⚠️'}`);
      console.log('System is healthy and ready for animation pipelines! 🚀');
      return 0;
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
      const subCommand = args[1] || 'list';
      const skillsDir = path.resolve(cwd, '.agents/skills');
      const registryPath = path.resolve(skillsDir, 'registry.json');

      if (!(await storage.exists(registryPath))) {
        console.error(`Error: Skill registry not found at "${registryPath}".`);
        return 1;
      }

      const registry = await SkillRegistry.fromFile(registryPath);

      if (subCommand === 'check') {
        console.log('🔍 Validating Antigravity Skill OS Registry...');
        const result = await registry.validate(skillsDir);
        const manifest = registry.getManifest();

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
        const categoryFilter = args[2] as AgentSkillCategory | undefined;
        const skills = registry.listSkills(categoryFilter);
        const external = registry.listExternalSkills();

        console.log(`🧠 AI Animation Studio Skill OS (${skills.length + external.length} total skills):`);
        console.log('\n--- CUSTOM DOMAIN SKILLS ---');
        for (const s of skills) {
          console.log(` • [${s.category.toUpperCase()}] ${s.id.padEnd(24)} v${s.version.padEnd(6)} | ${s.description}`);
        }

        if (!categoryFilter) {
          console.log('\n--- EXTERNAL PRODUCTION SKILLS ---');
          for (const ext of external) {
            console.log(` • [EXTERNAL] ${ext.id.padEnd(24)} (${ext.source}) | ${ext.description}`);
          }
        }
        return 0;
      }

      if (subCommand === 'route') {
        const query = args.slice(2).join(' ');
        if (!query) {
          console.error('Error: Query text required for skill routing. Usage: studio skills route <query>');
          return 1;
        }

        const router = new SkillRouter(registry);
        const match = router.route(query);

        console.log(`🎯 Skill Route for query: "${query}"`);
        console.log(` - Primary Category: ${match.primaryCategory ?? 'General'}`);
        console.log(` - Matched Keywords: ${match.matchedKeywords.join(', ') || 'None'}`);
        console.log(` - Recommended Skills: ${match.recommendedSkills.map((s) => s.id).join(', ') || 'None'}`);
        if (match.externalSkills.length > 0) {
          console.log(` - External Skills: ${match.externalSkills.map((s) => s.id).join(', ')}`);
        }
        console.log(` - Reasoning: ${match.reasoning}`);
        return 0;
      }

      console.error(`Unknown skills subcommand: "${subCommand}". Supported: check, list, route`);
      return 1;
    }

    case 'production': {
      const subCommand = args[1];
      const projectId = args[2];
      const targetId = args[3];

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio production <route|plan|budget> <projectId> [targetId]');
        return 1;
      }

      const providerRegistry = new ProviderRegistry();
      const promptCompiler = new PromptCompiler();
      const benchmarkTracker = new ProviderBenchmarkTracker();
      const budgetController = new BudgetController();

      // Read budget if persisted
      const budgetPath = `.studio/production/${projectId}_budget.json`;
      if (await storage.exists(budgetPath)) {
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

      console.error(`Unknown production subcommand: "${subCommand}". Supported: route, plan, budget`);
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
    case 'help':
    default: {
      console.log(`
🎬 AI Animation Studio CLI (v0.4.0)

Usage:
  studio <command> [options]

Commands:
  doctor                                 Check environment, node version, and system health
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
  story ingest <projectId> <file>        Losslessly ingest script into source document with segments
  story analyze <projectId> <file>       Extract scenes, beats, candidates, and check coverage
  story report <projectId> <file>        Print story intelligence and canon conflict report
  director plan <projectId>              Plan shots for all scenes in story analysis
  director qa <projectId>                Run DirectorQA quality analysis on planned shots
  director list <projectId>              List all planned shots with camera moves and renderer intent
  skills check                           Validate Antigravity Skill OS registry and dependencies
  skills list [category]                 List all custom and external skills in Skill OS
  skills route <query>                   Test routing of a query to specialized skills
  inspect <json-file> [schema]           Validate a JSON file against domain schemas
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
