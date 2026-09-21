/**
 * Domain models and schemas for World & Environment Studio, Scene Maps, Spatial Anchors, Depth Layers, and Presets.
 */

import { z } from 'zod';

export const LayerTypeSchema = z.enum([
  'background',
  'midground',
  'foreground',
  'depth_map',
]);
export type LayerType = z.infer<typeof LayerTypeSchema>;

export const EnvironmentLayerSchema = z.object({
  id: z.string().min(1),
  type: LayerTypeSchema,
  assetId: z.string().min(1),
  name: z.string().min(1),
  parallaxFactor: z.number().nonnegative().default(1.0),
  depthOrder: z.number().int().default(0), // 0: furthest back, higher: closer to camera
  opacity: z.number().min(0).max(1).default(1.0),
  storageUri: z.string().optional(),
});
export type EnvironmentLayer = z.infer<typeof EnvironmentLayerSchema>;

export const SpatialAnchorSchema = z.object({
  id: z.string().min(1), // e.g. "anchor_door", "anchor_altar", "anchor_window"
  name: z.string().min(1),
  position: z.object({
    x: z.number(), // -1.0 to 1.0 or normalized room coords
    y: z.number(),
    z: z.number(),
  }),
  facingAngleDeg: z.number().default(0), // 0 to 360 degrees
  associatedProps: z.array(z.string()).default([]),
});
export type SpatialAnchor = z.infer<typeof SpatialAnchorSchema>;

export const SceneMapSchema = z.object({
  locationId: z.string().min(1),
  zoneId: z.string().min(1),
  name: z.string().min(1),
  anchors: z.array(SpatialAnchorSchema).default([]),
  dimensions: z.object({
    widthMeters: z.number().positive().default(6.0),
    lengthMeters: z.number().positive().default(8.0),
    heightMeters: z.number().positive().default(3.0),
  }).default({ widthMeters: 6.0, lengthMeters: 8.0, heightMeters: 3.0 }),
  defaultCameraPositions: z.record(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      angle: z.string(),
    })
  ).default({}),
  updatedAt: z.string().datetime(),
});
export type SceneMap = z.infer<typeof SceneMapSchema>;

export const PropStateSchema = z.enum([
  'intact',
  'damaged',
  'open',
  'closed',
  'moved',
  'active',
  'destroyed',
]);
export type PropState = z.infer<typeof PropStateSchema>;

export const PropPlacementSchema = z.object({
  propId: z.string().min(1),
  propName: z.string().min(1),
  anchorId: z.string().min(1),
  state: PropStateSchema.default('intact'),
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
  lastMutatedInShotId: z.string().optional(),
});
export type PropPlacement = z.infer<typeof PropPlacementSchema>;

export const TimeOfDaySchema = z.enum([
  'dawn',
  'morning',
  'noon',
  'afternoon',
  'sunset',
  'dusk',
  'night',
]);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const LightingPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  keyLightDirection: z.string().default('side_left'),
  colorTemperatureK: z.number().positive().default(5500),
  intensity: z.enum(['low', 'medium', 'high', 'dramatic']).default('medium'),
  mood: z.string().default('natural'),
  timeOfDay: TimeOfDaySchema.default('noon'),
});
export type LightingPreset = z.infer<typeof LightingPresetSchema>;

export const WeatherTypeSchema = z.enum([
  'clear',
  'cloudy',
  'rain',
  'heavy_rain',
  'fog',
  'snow',
  'storm',
]);
export type WeatherType = z.infer<typeof WeatherTypeSchema>;

export const AtmospherePresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weather: WeatherTypeSchema.default('clear'),
  hazeDensity: z.number().min(0).max(1).default(0.0),
  particles: z.string().optional(), // e.g. "dust_motes", "rain_streaks", "ember_sparks"
  ambientSoundscape: z.string().optional(),
});
export type AtmospherePreset = z.infer<typeof AtmospherePresetSchema>;

export const LocationReferenceSetSchema = z.object({
  locationId: z.string().min(1),
  zoneId: z.string().min(1),
  wideEstablishingAssetId: z.string().optional(),
  layers: z.array(EnvironmentLayerSchema).default([]),
  lightingPresets: z.record(LightingPresetSchema).default({}),
  atmospherePresets: z.record(AtmospherePresetSchema).default({}),
  updatedAt: z.string().datetime(),
});
export type LocationReferenceSet = z.infer<typeof LocationReferenceSetSchema>;

export const EnvironmentStateSchema = z.object({
  locationId: z.string().min(1),
  zoneId: z.string().min(1),
  activeLightingPresetId: z.string().optional(),
  activeAtmospherePresetId: z.string().optional(),
  props: z.record(PropPlacementSchema).default({}),
  damagedElements: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
});
export type EnvironmentState = z.infer<typeof EnvironmentStateSchema>;
