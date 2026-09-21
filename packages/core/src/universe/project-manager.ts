/**
 * ProjectManager: Manages Series, Episodes, and Projects lifecycle with series namespace isolation.
 */

import {
  Series,
  SeriesSchema,
  Episode,
  EpisodeSchema,
  Project,
  ProjectSchema,
  ProjectStatus,
  ProjectConfig,
} from '../domain/project.js';
import { ValidationError } from '../errors/index.js';
import type { IStorageProvider } from '../storage/index.js';
import { UniverseManager } from './universe-manager.js';

export class ProjectManager {
  private storage: IStorageProvider;
  private universeManager: UniverseManager;

  constructor(storage: IStorageProvider) {
    this.storage = storage;
    this.universeManager = new UniverseManager(storage);
  }

  private getSeriesPath(seriesId: string): string {
    return `.studio/series/${seriesId}/series.json`;
  }

  private getProjectPath(projectId: string): string {
    return `.studio/projects/${projectId}/project.json`;
  }

  private getEpisodePath(seriesId: string, episodeId: string): string {
    return `.studio/series/${seriesId}/episodes/${episodeId}.json`;
  }

  public async createSeries(seriesData: Omit<Series, 'createdAt' | 'updatedAt'>): Promise<Series> {
    const path = this.getSeriesPath(seriesData.id);
    if (await this.storage.exists(path)) {
      throw new ValidationError(`Series with ID "${seriesData.id}" already exists`);
    }

    const now = new Date().toISOString();
    const series: Series = {
      ...seriesData,
      createdAt: now,
      updatedAt: now,
    };

    const validated = SeriesSchema.parse(series);
    await this.storage.writeJson(path, validated);

    // Initialize the universe memory for this series
    await this.universeManager.getOrCreateUniverse(validated.id);

    return validated;
  }

  public async getSeries(seriesId: string): Promise<Series> {
    const path = this.getSeriesPath(seriesId);
    if (!(await this.storage.exists(path))) {
      throw new ValidationError(`Series "${seriesId}" does not exist`);
    }
    const raw = await this.storage.readJson<Series>(path);
    return SeriesSchema.parse(raw);
  }

  public async createEpisode(
    seriesId: string,
    episodeData: Omit<Episode, 'createdAt' | 'updatedAt' | 'seriesId'>
  ): Promise<Episode> {
    await this.getSeries(seriesId); // verify series exists
    const path = this.getEpisodePath(seriesId, episodeData.id);
    if (await this.storage.exists(path)) {
      throw new ValidationError(`Episode "${episodeData.id}" already exists in series "${seriesId}"`);
    }

    const now = new Date().toISOString();
    const episode: Episode = {
      ...episodeData,
      seriesId,
      createdAt: now,
      updatedAt: now,
    };

    const validated = EpisodeSchema.parse(episode);
    await this.storage.writeJson(path, validated);
    return validated;
  }

  public async createProject(projectData: {
    id: string;
    name: string;
    seriesId: string;
    episodeId?: string;
    config?: Partial<ProjectConfig>;
  }): Promise<Project> {
    // Verify series exists
    await this.getSeries(projectData.seriesId);

    const path = this.getProjectPath(projectData.id);
    if (await this.storage.exists(path)) {
      throw new ValidationError(`Project "${projectData.id}" already exists`);
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: projectData.id,
      name: projectData.name,
      seriesId: projectData.seriesId,
      episodeId: projectData.episodeId,
      status: 'draft',
      config: {
        aspectRatio: '16:9',
        targetFps: 24,
        resolution: { width: 1920, height: 1080 },
        defaultRenderer: 'deterministic_first',
        ...projectData.config,
      },
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    const validated = ProjectSchema.parse(project);
    await this.storage.writeJson(path, validated);
    return validated;
  }

  public async getProject(projectId: string): Promise<Project> {
    const path = this.getProjectPath(projectId);
    if (!(await this.storage.exists(path))) {
      throw new ValidationError(`Project "${projectId}" does not exist`);
    }
    const raw = await this.storage.readJson<Project>(path);
    return ProjectSchema.parse(raw);
  }

  public async updateProjectStatus(projectId: string, status: ProjectStatus): Promise<Project> {
    const project = await this.getProject(projectId);
    const updated: Project = {
      ...project,
      status,
      updatedAt: new Date().toISOString(),
    };
    const validated = ProjectSchema.parse(updated);
    await this.storage.writeJson(this.getProjectPath(projectId), validated);
    return validated;
  }
}
