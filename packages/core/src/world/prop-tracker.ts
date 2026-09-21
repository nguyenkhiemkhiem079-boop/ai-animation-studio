import {
  PropPlacement,
  PropPlacementSchema,
  PropState,
  EnvironmentState,
  EnvironmentStateSchema,
} from '../domain/world.js';
import { ValidationError } from '../errors/index.js';

export class PropPlacementTracker {
  private states = new Map<string, EnvironmentState>(); // key: `${seriesId}:${locationId}:${zoneId}`

  private makeKey(seriesId: string, locationId: string, zoneId: string): string {
    return `${seriesId}:${locationId}:${zoneId}`;
  }

  public getOrCreateState(
    seriesId: string,
    locationId: string,
    zoneId: string
  ): EnvironmentState {
    const key = this.makeKey(seriesId, locationId, zoneId);
    let state = this.states.get(key);
    if (!state) {
      state = EnvironmentStateSchema.parse({
        locationId,
        zoneId,
        props: {},
        damagedElements: [],
        updatedAt: new Date().toISOString(),
      });
      this.states.set(key, state);
    }
    return state;
  }

  public placeProp(
    seriesId: string,
    locationId: string,
    zoneId: string,
    placement: PropPlacement
  ): PropPlacement {
    const state = this.getOrCreateState(seriesId, locationId, zoneId);
    const validated = PropPlacementSchema.parse(placement);
    state.props[validated.propId] = validated;
    state.updatedAt = new Date().toISOString();
    return validated;
  }

  public mutatePropState(
    seriesId: string,
    locationId: string,
    zoneId: string,
    propId: string,
    newState: PropState,
    shotId?: string
  ): PropPlacement {
    const state = this.getOrCreateState(seriesId, locationId, zoneId);
    const prop = state.props[propId];
    if (!prop) {
      throw new ValidationError(
        `Prop "${propId}" not found in location "${locationId}" zone "${zoneId}"`
      );
    }

    prop.state = newState;
    if (shotId) {
      prop.lastMutatedInShotId = shotId;
    }
    if (newState === 'damaged' || newState === 'destroyed') {
      if (!state.damagedElements.includes(prop.propName)) {
        state.damagedElements.push(prop.propName);
      }
    }
    state.updatedAt = new Date().toISOString();
    return prop;
  }

  public getProps(
    seriesId: string,
    locationId: string,
    zoneId: string
  ): PropPlacement[] {
    const state = this.getOrCreateState(seriesId, locationId, zoneId);
    return Object.values(state.props);
  }

  public setActiveLighting(
    seriesId: string,
    locationId: string,
    zoneId: string,
    presetId: string
  ): void {
    const state = this.getOrCreateState(seriesId, locationId, zoneId);
    state.activeLightingPresetId = presetId;
    state.updatedAt = new Date().toISOString();
  }

  public setActiveAtmosphere(
    seriesId: string,
    locationId: string,
    zoneId: string,
    presetId: string
  ): void {
    const state = this.getOrCreateState(seriesId, locationId, zoneId);
    state.activeAtmospherePresetId = presetId;
    state.updatedAt = new Date().toISOString();
  }
}
