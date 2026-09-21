import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, UniverseManager, ProjectManager, ContinuityError } from '../src/index.js';

describe('Universe Persistence, Import & Export', () => {
  let storage: MemoryStorage;
  let universeManager: UniverseManager;
  let projectManager: ProjectManager;
  const seriesId = 'series_sci_fi';

  beforeEach(async () => {
    storage = new MemoryStorage();
    universeManager = new UniverseManager(storage);
    projectManager = new ProjectManager(storage);

    await projectManager.createSeries({
      id: seriesId,
      name: 'Chronicles of Nova',
      visualStyle: 'Ghibli watercolor meets Cyberpunk',
      metadata: {},
    });

    await universeManager.addCharacter(seriesId, {
      id: 'CHAR_NOVA',
      seriesId,
      name: 'Nova',
      description: 'Navigator',
      visualAnchorPrompt: 'Silver haired girl with goggles',
    });
  });

  it('exports universe to bundle and imports it back with checksum verification', async () => {
    const bundle = await universeManager.exportUniverse(seriesId);
    expect(bundle.seriesId).toBe(seriesId);
    expect(bundle.checksum).toBeDefined();
    expect(bundle.universe.characters['CHAR_NOVA']).toBeDefined();

    // Import into a backup or new series namespace
    const imported = await universeManager.importUniverse('series_sci_fi_backup', bundle);
    expect(imported.seriesId).toBe('series_sci_fi_backup');
    expect(imported.characters['CHAR_NOVA'].name).toBe('Nova');
  });

  it('detects tampering and rejects corrupted import bundles', async () => {
    const bundle = await universeManager.exportUniverse(seriesId);

    // Tamper with data without updating checksum
    bundle.universe.characters['CHAR_NOVA'].name = 'Hacked Character';

    await expect(universeManager.importUniverse('series_tampered', bundle)).rejects.toThrow(ContinuityError);
  });

  it('links Projects and Episodes to Series', async () => {
    const episode = await projectManager.createEpisode(seriesId, {
      id: 'EP_01',
      episodeNumber: 1,
      title: 'Departure from Terra',
    });
    expect(episode.title).toBe('Departure from Terra');

    const project = await projectManager.createProject({
      id: 'proj_ep01',
      name: 'Episode 1 Production',
      seriesId,
      episodeId: 'EP_01',
      config: { aspectRatio: '16:9' },
    });
    expect(project.seriesId).toBe(seriesId);
    expect(project.status).toBe('draft');

    const loaded = await projectManager.getProject('proj_ep01');
    expect(loaded.name).toBe('Episode 1 Production');
  });
});
