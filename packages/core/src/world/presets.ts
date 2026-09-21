import {
  LightingPreset,
  LightingPresetSchema,
  AtmospherePreset,
  AtmospherePresetSchema,
  TimeOfDay,
  WeatherType,
} from '../domain/world.js';

export class LightingLibrary {
  private presets = new Map<string, LightingPreset>();

  constructor(initialPresets: LightingPreset[] = []) {
    for (const preset of initialPresets) {
      this.register(preset);
    }
  }

  public static createDefault(): LightingLibrary {
    const lib = new LightingLibrary();
    const defaults: LightingPreset[] = [
      {
        id: 'noir_chiaroscuro',
        name: 'Film Noir Chiaroscuro',
        keyLightDirection: 'side_left',
        colorTemperatureK: 3200,
        intensity: 'dramatic',
        mood: 'noir_suspense',
        timeOfDay: 'night',
      },
      {
        id: 'golden_hour',
        name: 'Golden Hour Sunset',
        keyLightDirection: 'low_side_right',
        colorTemperatureK: 3500,
        intensity: 'medium',
        mood: 'warm_nostalgic',
        timeOfDay: 'sunset',
      },
      {
        id: 'high_noon',
        name: 'High Noon Harsh Sunlight',
        keyLightDirection: 'top_down',
        colorTemperatureK: 5800,
        intensity: 'high',
        mood: 'harsh_sunlight',
        timeOfDay: 'noon',
      },
      {
        id: 'gloomy_rain',
        name: 'Gloomy Overcast Rain',
        keyLightDirection: 'ambient_diffuse',
        colorTemperatureK: 6500,
        intensity: 'low',
        mood: 'somber_melancholy',
        timeOfDay: 'afternoon',
      },
      {
        id: 'cyberpunk_neon',
        name: 'Cyberpunk Neon Rim',
        keyLightDirection: 'dual_rim',
        colorTemperatureK: 4500,
        intensity: 'dramatic',
        mood: 'electric_neon',
        timeOfDay: 'night',
      },
    ];

    for (const def of defaults) {
      lib.register(def);
    }
    return lib;
  }

  public register(preset: LightingPreset): void {
    const validated = LightingPresetSchema.parse(preset);
    this.presets.set(validated.id.toLowerCase(), validated);
  }

  public get(id: string): LightingPreset | undefined {
    return this.presets.get(id.toLowerCase());
  }

  public list(): LightingPreset[] {
    return Array.from(this.presets.values());
  }

  public findByTimeOfDay(timeOfDay: TimeOfDay): LightingPreset[] {
    return this.list().filter((p) => p.timeOfDay === timeOfDay);
  }
}

export class AtmosphereLibrary {
  private presets = new Map<string, AtmospherePreset>();

  constructor(initialPresets: AtmospherePreset[] = []) {
    for (const preset of initialPresets) {
      this.register(preset);
    }
  }

  public static createDefault(): AtmosphereLibrary {
    const lib = new AtmosphereLibrary();
    const defaults: AtmospherePreset[] = [
      {
        id: 'clear_day',
        name: 'Crystal Clear Day',
        weather: 'clear',
        hazeDensity: 0.0,
      },
      {
        id: 'heavy_downpour',
        name: 'Heavy Downpour & Thunder',
        weather: 'heavy_rain',
        hazeDensity: 0.6,
        particles: 'rain_streaks',
        ambientSoundscape: 'thunder_and_downpour',
      },
      {
        id: 'dense_fog',
        name: 'Dense Harbor Fog',
        weather: 'fog',
        hazeDensity: 0.85,
        particles: 'fog_mist',
        ambientSoundscape: 'muffled_wind',
      },
      {
        id: 'interior_dust_motes',
        name: 'Dusty Interior Sunbeam',
        weather: 'clear',
        hazeDensity: 0.2,
        particles: 'floating_dust',
        ambientSoundscape: 'creaking_floorboards',
      },
      {
        id: 'blizzard_storm',
        name: 'Howling Blizzard',
        weather: 'storm',
        hazeDensity: 0.75,
        particles: 'swirling_snow',
        ambientSoundscape: 'howling_gale',
      },
    ];

    for (const def of defaults) {
      lib.register(def);
    }
    return lib;
  }

  public register(preset: AtmospherePreset): void {
    const validated = AtmospherePresetSchema.parse(preset);
    this.presets.set(validated.id.toLowerCase(), validated);
  }

  public get(id: string): AtmospherePreset | undefined {
    return this.presets.get(id.toLowerCase());
  }

  public list(): AtmospherePreset[] {
    return Array.from(this.presets.values());
  }

  public findByWeather(weather: WeatherType): AtmospherePreset[] {
    return this.list().filter((p) => p.weather === weather);
  }
}
