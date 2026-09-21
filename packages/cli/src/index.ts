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
      const universeManager = new UniverseManager(storage);

      if (!seriesId) {
        console.error('Error: Series ID is required. Usage: studio character list <seriesId>');
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

      console.error(`Unknown character subcommand: "${subCommand}". Supported: list`);
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
