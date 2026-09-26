import { ShotContract } from '../domain/director.js';

export interface PropStateMutationEvent {
  eventId: string;
  seriesId: string;
  projectId: string;
  sceneId: string;
  shotId: string;
  propId: string;
  propName: string;
  previousState: string;
  newState: string;
  timestamp: string;
}

export interface ScenePropRecord {
  propId: string;
  propName: string;
  currentState: string;
  initialState: string;
  lastMutatedInShotId?: string;
  history: PropStateMutationEvent[];
}

export class ScenePropStateTracker {
  // Key: `${seriesId}:${projectId}:${sceneId}` -> Map<propId, ScenePropRecord>
  private scenePropsMap = new Map<string, Map<string, ScenePropRecord>>();

  private getSceneKey(seriesId: string, projectId: string, sceneId: string): string {
    return `${seriesId}:${projectId}:${sceneId}`;
  }

  private getOrCreateSceneMap(seriesId: string, projectId: string, sceneId: string): Map<string, ScenePropRecord> {
    const key = this.getSceneKey(seriesId, projectId, sceneId);
    let sceneMap = this.scenePropsMap.get(key);
    if (!sceneMap) {
      sceneMap = new Map<string, ScenePropRecord>();
      this.scenePropsMap.set(key, sceneMap);
    }
    return sceneMap;
  }

  /**
   * Registers a prop with its initial state in a specific scene.
   */
  public registerProp(
    seriesId: string,
    projectId: string,
    sceneId: string,
    propId: string,
    propName: string,
    initialState: string
  ): ScenePropRecord {
    const sceneMap = this.getOrCreateSceneMap(seriesId, projectId, sceneId);
    let record = sceneMap.get(propId);
    if (!record) {
      record = {
        propId,
        propName,
        currentState: initialState,
        initialState,
        history: [],
      };
      sceneMap.set(propId, record);
    }
    return record;
  }

  /**
   * Records a mutation to a prop during a specific shot.
   * Creates an immutable event and updates current scene prop state.
   */
  public mutateProp(
    seriesId: string,
    projectId: string,
    sceneId: string,
    shotId: string,
    propId: string,
    propName: string,
    newState: string
  ): PropStateMutationEvent {
    const sceneMap = this.getOrCreateSceneMap(seriesId, projectId, sceneId);
    let record = sceneMap.get(propId);
    if (!record) {
      record = this.registerProp(seriesId, projectId, sceneId, propId, propName, 'default');
    }

    const previousState = record.currentState;
    const event: PropStateMutationEvent = {
      eventId: `prop_ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      seriesId,
      projectId,
      sceneId,
      shotId,
      propId,
      propName,
      previousState,
      newState,
      timestamp: new Date().toISOString(),
    };

    record.currentState = newState;
    record.lastMutatedInShotId = shotId;
    record.history.push(event);

    return event;
  }

  /**
   * Returns current active prop states for a scene.
   */
  public getActiveProps(seriesId: string, projectId: string, sceneId: string): Record<string, string> {
    const sceneMap = this.getOrCreateSceneMap(seriesId, projectId, sceneId);
    const result: Record<string, string> = {};
    for (const [propId, record] of sceneMap.entries()) {
      result[record.propName || propId] = record.currentState;
    }
    return result;
  }

  /**
   * Binds current scene prop states into a downstream ShotContract's visual elements and prompt text.
   */
  public applyPropsToShotContract(
    shot: ShotContract,
    seriesId: string,
    projectId: string,
    sceneId: string
  ): ShotContract {
    const activeProps = this.getActiveProps(seriesId, projectId, sceneId);
    const propDescriptions = Object.entries(activeProps).map(([name, val]) => `${name}: ${val}`);

    if (propDescriptions.length === 0) {
      return shot;
    }

    const propPromptSuffix = `[Scene Props: ${propDescriptions.join(', ')}]`;

    const updatedActing = shot.acting.map((act) => {
      const prompt = act.actionPrompt || '';
      return {
        ...act,
        actionPrompt: prompt.includes('[Scene Props:')
          ? prompt.replace(/\[Scene Props:.*?\]/, propPromptSuffix)
          : `${prompt} ${propPromptSuffix}`.trim(),
      };
    });

    const result: ShotContract = {
      ...shot,
      acting: updatedActing,
    };

    if ((shot as any).promptEngineering) {
      const existingPrompt = (shot as any).promptEngineering.compiledPromptText || '';
      const updatedPrompt = existingPrompt.includes('[Scene Props:')
        ? existingPrompt.replace(/\[Scene Props:.*?\]/, propPromptSuffix)
        : `${existingPrompt} ${propPromptSuffix}`.trim();

      (result as any).promptEngineering = {
        ...(shot as any).promptEngineering,
        compiledPromptText: updatedPrompt,
      };
    }

    return result;
  }

  /**
   * Surgically invalidates mutations caused by an upstream shot.
   * Rolls back prop states to their state before the specified shot was executed.
   */
  public invalidateMutationsForShot(
    seriesId: string,
    projectId: string,
    sceneId: string,
    shotId: string
  ): { invalidatedEvents: PropStateMutationEvent[]; affectedProps: string[] } {
    const sceneMap = this.getOrCreateSceneMap(seriesId, projectId, sceneId);
    const invalidatedEvents: PropStateMutationEvent[] = [];
    const affectedProps: string[] = [];

    for (const [propId, record] of sceneMap.entries()) {
      const shotEvents = record.history.filter((e) => e.shotId === shotId);
      if (shotEvents.length > 0) {
        invalidatedEvents.push(...shotEvents);
        affectedProps.push(propId);

        // Remove these events from history
        record.history = record.history.filter((e) => e.shotId !== shotId);

        // Recalculate currentState from remaining history
        if (record.history.length > 0) {
          const lastEvent = record.history[record.history.length - 1];
          record.currentState = lastEvent.newState;
          record.lastMutatedInShotId = lastEvent.shotId;
        } else {
          record.currentState = record.initialState;
          record.lastMutatedInShotId = undefined;
        }
      }
    }

    return { invalidatedEvents, affectedProps };
  }
}
