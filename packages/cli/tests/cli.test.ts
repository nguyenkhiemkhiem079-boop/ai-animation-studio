import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { runCli } from '../src/index.js';
import { FileSystemStorage, UniverseManager } from '@ai-studio/core';

describe('CLI Commands', () => {
  let tempDir: string;
  let storage: FileSystemStorage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-cli-test-'));
    storage = new FileSystemStorage(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('runs doctor command successfully', async () => {
    const code = await runCli(['doctor'], { cwd: tempDir, storage });
    expect(code).toBe(0);
  });

  it('shows help when requested', async () => {
    const code = await runCli(['help'], { cwd: tempDir, storage });
    expect(code).toBe(0);
  });

  it('creates and lists checkpoints via CLI', async () => {
    const projectId = 'test_proj';
    const ckptId = 'v0.1-foundation';

    const createCode = await runCli(['checkpoint', 'create', projectId, ckptId], {
      cwd: tempDir,
      storage,
    });
    expect(createCode).toBe(0);

    const listCode = await runCli(['checkpoint', 'list', projectId], {
      cwd: tempDir,
      storage,
    });
    expect(listCode).toBe(0);

    const restoreCode = await runCli(['checkpoint', 'restore', projectId, ckptId], {
      cwd: tempDir,
      storage,
    });
    expect(restoreCode).toBe(0);
  });

  it('inspects and validates JSON domain artifacts', async () => {
    const validProject = {
      id: 'p_inspect',
      name: 'Inspect Project',
      seriesId: 's_inspect',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await storage.writeJson('project.json', validProject);

    const code = await runCli(['inspect', 'project.json', 'project'], {
      cwd: tempDir,
      storage,
    });
    expect(code).toBe(0);
  });

  it('manages universe display, export, import, and character listing via CLI', async () => {
    const universeManager = new UniverseManager(storage);
    const seriesId = 'series_cli_test';

    // Seed a character
    await universeManager.addCharacter(seriesId, {
      id: 'CHAR_CLI_01',
      seriesId,
      name: 'Agent Zero',
      description: 'Undercover detective',
      visualAnchorPrompt: 'Black suit, sunglasses',
      traits: ['calm'],
    });

    // 1. universe show
    const showCode = await runCli(['universe', 'show', seriesId], { cwd: tempDir, storage });
    expect(showCode).toBe(0);

    // 2. character list
    const charListCode = await runCli(['character', 'list', seriesId], { cwd: tempDir, storage });
    expect(charListCode).toBe(0);

    // 3. universe export
    const exportFile = 'exports/test_universe.json';
    const exportCode = await runCli(['universe', 'export', seriesId, exportFile], { cwd: tempDir, storage });
    expect(exportCode).toBe(0);
    expect(await storage.exists(exportFile)).toBe(true);

    // 4. universe import into backup series
    const importCode = await runCli(['universe', 'import', 'series_cli_backup', exportFile], { cwd: tempDir, storage });
    expect(importCode).toBe(0);
  });

  it('ingests, analyzes, and reports stories via CLI', async () => {
    const projectId = 'proj_cli_story';
    const scriptFile = 'scripts/episode1.txt';
    const scriptContent = `INT. ROOFTOP - NIGHT

Heavy rain falls.
MINH: It ends tonight.
VICTOR: You cannot stop what has started.`;

    await storage.write(scriptFile, scriptContent);

    // 1. story ingest
    const ingestCode = await runCli(['story', 'ingest', projectId, scriptFile], {
      cwd: tempDir,
      storage,
    });
    expect(ingestCode).toBe(0);
    expect(await storage.exists(`.studio/projects/${projectId}/source_doc.json`)).toBe(true);

    // 2. story analyze
    const analyzeCode = await runCli(['story', 'analyze', projectId, scriptFile], {
      cwd: tempDir,
      storage,
    });
    expect(analyzeCode).toBe(0);
    expect(await storage.exists(`.studio/projects/${projectId}/story_analysis.json`)).toBe(true);

    // 3. story report
    const reportCode = await runCli(['story', 'report', projectId, scriptFile], {
      cwd: tempDir,
      storage,
    });
    expect(reportCode).toBe(0);
  });

  it('plans shots, runs DirectorQA, and lists shots via CLI', async () => {
    const projectId = 'proj_cli_director';
    const scriptFile = 'scripts/scene1.txt';
    const scriptContent = `INT. DETECTIVE OFFICE - NIGHT

MINH: The evidence is conclusive.
LAN: Then we move tonight.`;

    await storage.write(scriptFile, scriptContent);

    // Prepare story analysis first
    await runCli(['story', 'analyze', projectId, scriptFile], { cwd: tempDir, storage });

    // 1. director plan
    const planCode = await runCli(['director', 'plan', projectId], { cwd: tempDir, storage });
    expect(planCode).toBe(0);
    expect(await storage.exists(`.studio/projects/${projectId}/production_scenes.json`)).toBe(true);

    // 2. director qa
    const qaCode = await runCli(['director', 'qa', projectId], { cwd: tempDir, storage });
    expect(qaCode).toBe(0);

    // 3. director list
    const listCode = await runCli(['director', 'list', projectId], { cwd: tempDir, storage });
    expect(listCode).toBe(0);
  });

  it('runs skills check, list, and route via CLI', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const rootStorage = new FileSystemStorage(repoRoot);

    // 1. skills check
    const checkCode = await runCli(['skills', 'check'], { cwd: repoRoot, storage: rootStorage });
    expect(checkCode).toBe(0);

    // 2. skills list
    const listCode = await runCli(['skills', 'list'], { cwd: repoRoot, storage: rootStorage });
    expect(listCode).toBe(0);

    // 3. skills list with category filter
    const listDevCode = await runCli(['skills', 'list', 'development'], { cwd: repoRoot, storage: rootStorage });
    expect(listDevCode).toBe(0);

    // 4. skills route
    const routeCode = await runCli(
      ['skills', 'route', 'Check whether Minh stays visually consistent.'],
      { cwd: repoRoot, storage: rootStorage }
    );
    expect(routeCode).toBe(0);
  });

  it('manages character turnaround sheets, asset resolution, QA, and approval via CLI', async () => {
    const universeManager = new UniverseManager(storage);
    const seriesId = 'series_cli_char_test';
    const charId = 'CHAR_CLI_02';

    // 1. Seed character
    await universeManager.addCharacter(seriesId, {
      id: charId,
      seriesId,
      name: 'Elena Rostova',
      description: 'Master tactician',
      visualAnchorPrompt: 'Female, 28, silver hair, cybernetic monocle',
      traits: ['tactical', 'composed'],
    });

    // 2. character sheet
    const sheetCode = await runCli(['character', 'sheet', seriesId, charId], { cwd: tempDir, storage });
    expect(sheetCode).toBe(0);

    // 3. character resolve view
    const resolveViewCode = await runCli(
      ['character', 'resolve', seriesId, charId, 'front'],
      { cwd: tempDir, storage }
    );
    expect(resolveViewCode).toBe(0);

    // 4. character resolve expression
    const resolveExprCode = await runCli(
      ['character', 'resolve', seriesId, charId, 'afraid'],
      { cwd: tempDir, storage }
    );
    expect(resolveExprCode).toBe(0);

    // 5. character qa
    const qaCode = await runCli(
      ['character', 'qa', seriesId, charId, `ASSET_TURN_${charId}_FRONT_V1`],
      { cwd: tempDir, storage }
    );
    expect(qaCode).toBe(0);

    // 6. asset approve
    const approveCode = await runCli(
      ['asset', 'approve', `ASSET_TURN_${charId}_FRONT_V1`],
      { cwd: tempDir, storage }
    );
    expect(approveCode).toBe(0);
  });

  it('manages world location staging, scene maps, resolve, and props via CLI', async () => {
    const universeManager = new UniverseManager(storage);
    const seriesId = 'series_cli_world_test';
    const locId = 'LOC_CLI_01';

    // 1. Seed location in universe
    await universeManager.addLocation(seriesId, {
      id: locId,
      seriesId,
      name: 'Old Observatory',
      aliases: ['The Tower'],
      description: 'Mountain top dome observatory with brass telescope.',
      zones: [
        {
          id: 'dome_room',
          name: 'Telescope Dome Room',
          description: 'Circular room with revolving dome slit.',
          keyProps: ['brass_telescope', 'star_chart_table'],
        },
      ],
    });

    // 2. world show
    const showCode = await runCli(['world', 'show', seriesId, locId, 'dome_room'], { cwd: tempDir, storage });
    expect(showCode).toBe(0);

    // 3. world staging
    const stagingCode = await runCli(['world', 'staging', seriesId, locId, 'dome_room'], { cwd: tempDir, storage });
    expect(stagingCode).toBe(0);

    // 4. world resolve
    const resolveCode = await runCli(['world', 'resolve', seriesId, locId, 'dome_room'], { cwd: tempDir, storage });
    expect(resolveCode).toBe(0);

    // 5. world props
    const propsCode = await runCli(['world', 'props', seriesId, locId, 'dome_room'], { cwd: tempDir, storage });
    expect(propsCode).toBe(0);
  });

  it('manages production routing, plans, and budget via CLI', async () => {
    const projectId = 'proj_cli_prod_test';

    // 1. production route
    const routeCode = await runCli(['production', 'route', projectId, 'SHOT_DEMO_01'], { cwd: tempDir, storage });
    expect(routeCode).toBe(0);

    // 2. production plan
    const planCode = await runCli(['production', 'plan', projectId], { cwd: tempDir, storage });
    expect(planCode).toBe(0);

    // 3. production budget (default status)
    const budgetCode = await runCli(['production', 'budget', projectId], { cwd: tempDir, storage });
    expect(budgetCode).toBe(0);

    // 4. production budget (--set-cap)
    const setCapCode = await runCli(['production', 'budget', projectId, '--set-cap', '75.50'], { cwd: tempDir, storage });
    expect(setCapCode).toBe(0);
  });

  it('manages hyperframes compilation, preview, and deterministic render via CLI', async () => {
    const projectId = 'proj_cli_hf_test';

    // 1. hyperframes compile
    const compileCode = await runCli(['hyperframes', 'compile', projectId, 'SHOT_HF_01'], { cwd: tempDir, storage });
    expect(compileCode).toBe(0);

    // 2. hyperframes preview
    const previewCode = await runCli(['hyperframes', 'preview', projectId, 'SHOT_HF_01'], { cwd: tempDir, storage });
    expect(previewCode).toBe(0);

    // 3. hyperframes render
    const renderCode = await runCli(['hyperframes', 'render', projectId, 'SHOT_HF_01'], { cwd: tempDir, storage });
    expect(renderCode).toBe(0);
  });

  it('manages digital actor animation clips, poses, and lip-sync via CLI', async () => {
    // 1. actor list-clips
    const listClipsCode = await runCli(['actor', 'list-clips'], { cwd: tempDir, storage });
    expect(listClipsCode).toBe(0);

    // 2. actor animate
    const animateCode = await runCli(
      ['actor', 'animate', 'char_kaito', 'walk', '--dialogue', 'Halt! Who goes there?'],
      { cwd: tempDir, storage }
    );
    expect(animateCode).toBe(0);

    // 3. actor lipsync
    const lipsyncCode = await runCli(
      ['actor', 'lipsync', 'char_kaito', 'We must secure the perimeter.'],
      { cwd: tempDir, storage }
    );
    expect(lipsyncCode).toBe(0);
  });

  it('manages generative video providers, rendering, continuation, and retakes via CLI', async () => {
    const projectId = 'proj_cli_video_test';

    // 1. video list-providers
    const listProvidersCode = await runCli(['video', 'list-providers'], { cwd: tempDir, storage });
    expect(listProvidersCode).toBe(0);

    // 2. video render
    const renderCode = await runCli(['video', 'render', projectId, 'SHOT_V01'], { cwd: tempDir, storage });
    expect(renderCode).toBe(0);

    // 3. video continuation
    const contCode = await runCli(['video', 'continuation', projectId, 'SHOT_V01', 'SHOT_V02'], { cwd: tempDir, storage });
    expect(contCode).toBe(0);

    // 4. video retake
    const retakeCode = await runCli(
      ['video', 'retake', projectId, 'SHOT_V01', '--reason', 'More rim lighting', '--type', 'lighting_adjustment'],
      { cwd: tempDir, storage }
    );
    expect(retakeCode).toBe(0);
  });

  it('manages character voice profiles, dialogue synthesis, scoring, sfx, and mix via CLI', async () => {
    const projectId = 'proj_cli_audio_test';
    const seriesId = 'series_cli_audio';

    // 1. audio list-voices
    const listVoicesCode = await runCli(['audio', 'list-voices', seriesId], { cwd: tempDir, storage });
    expect(listVoicesCode).toBe(0);

    // 2. audio voice-synth
    const synthCode = await runCli(
      ['audio', 'voice-synth', 'char_kaito', 'Shields at seventy percent.'],
      { cwd: tempDir, storage }
    );
    expect(synthCode).toBe(0);

    // 3. audio score
    const scoreCode = await runCli(['audio', 'score', projectId, 'SCENE_01'], { cwd: tempDir, storage });
    expect(scoreCode).toBe(0);

    // 4. audio sfx
    const sfxCode = await runCli(['audio', 'sfx', projectId, 'SHOT_01', '--name', 'plasma_blast'], { cwd: tempDir, storage });
    expect(sfxCode).toBe(0);

    // 5. audio mix
    const mixCode = await runCli(['audio', 'mix', projectId], { cwd: tempDir, storage });
    expect(mixCode).toBe(0);
  });

  it('manages multi-track timeline assembly, inspection, and subtitles via CLI', async () => {
    const projectId = 'proj_cli_timeline_test';

    // 1. timeline assemble
    const assembleCode = await runCli(['timeline', 'assemble', projectId], { cwd: tempDir, storage });
    expect(assembleCode).toBe(0);

    // 2. timeline inspect
    const inspectCode = await runCli(['timeline', 'inspect', projectId], { cwd: tempDir, storage });
    expect(inspectCode).toBe(0);

    // 3. timeline subtitles (SRT)
    const srtCode = await runCli(['timeline', 'subtitles', projectId, '--format', 'srt'], { cwd: tempDir, storage });
    expect(srtCode).toBe(0);

    // 4. timeline subtitles (VTT)
    const vttCode = await runCli(['timeline', 'subtitles', projectId, '--format', 'vtt'], { cwd: tempDir, storage });
    expect(vttCode).toBe(0);
  });

  it('manages continuity QA audit and automated repairs via CLI', async () => {
    const projectId = 'proj_cli_qa_test';

    // 1. qa audit
    const auditCode = await runCli(['qa', 'audit', projectId], { cwd: tempDir, storage });
    expect(auditCode).toBe(0);

    // 2. qa repair
    const repairCode = await runCli(['qa', 'repair', projectId], { cwd: tempDir, storage });
    expect(repairCode).toBe(0);
  });
});



