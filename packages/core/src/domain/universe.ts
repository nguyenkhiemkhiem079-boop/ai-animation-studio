/**
 * Domain models and schemas for Universe, Character DNA, Location DNA, Canon, World State, and Export Bundles.
 */

import { z } from 'zod';

export const OutfitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  season: z.string().optional(),
  referenceAssetIds: z.array(z.string()).default([]),
});
export type Outfit = z.infer<typeof OutfitSchema>;

export const CharacterVersionSchema = z.object({
  version: z.number().int().positive(),
  summary: z.string(),
  visualChanges: z.string().optional(),
  visualAnchorPrompt: z.string().optional(),
  canonicalAssetIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});
export type CharacterVersion = z.infer<typeof CharacterVersionSchema>;

export const CharacterDNASchema = z.object({
  id: z.string().min(1), // e.g. CHAR_MINH_001
  seriesId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  archetype: z.string().optional(),
  description: z.string(),
  visualAnchorPrompt: z.string(),
  traits: z.array(z.string()).default([]),
  voiceTimbre: z.string().optional(),
  currentVersion: z.number().int().positive().default(1),
  versions: z.array(CharacterVersionSchema).default([]),
  outfits: z.array(OutfitSchema).default([]),
  canonicalSheetAssetId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CharacterDNA = z.infer<typeof CharacterDNASchema>;

export const LocationZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  lightingLogic: z.string().optional(),
  keyProps: z.array(z.string()).default([]),
});
export type LocationZone = z.infer<typeof LocationZoneSchema>;

export const LocationDNASchema = z.object({
  id: z.string().min(1), // e.g. LOC_OLD_HOUSE_001
  seriesId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string(),
  zones: z.array(LocationZoneSchema).default([]),
  atmospherePrompt: z.string().optional(),
  lightingPresets: z.record(z.string()).default({}),
  canonicalAssetIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LocationDNA = z.infer<typeof LocationDNASchema>;

export const PropDNASchema = z.object({
  id: z.string().min(1), // e.g. PROP_ANCIENT_AMULET_001
  seriesId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string(),
  visualPrompt: z.string(),
  isCanonical: z.boolean().default(true),
  canonicalAssetIds: z.array(z.string()).default([]),
});
export type PropDNA = z.infer<typeof PropDNASchema>;

export const RelationshipDNASchema = z.object({
  id: z.string().min(1),
  sourceCharacterId: z.string().min(1),
  targetCharacterId: z.string().min(1),
  type: z.string(), // e.g. "sibling", "rival", "mentor", "ally"
  description: z.string().optional(),
  sentiment: z.enum(['friendly', 'hostile', 'neutral', 'ambivalent']).default('neutral'),
});
export type RelationshipDNA = z.infer<typeof RelationshipDNASchema>;

export const CanonStateSchema = z.object({
  lockedCharacterIds: z.array(z.string()).default([]),
  lockedLocationIds: z.array(z.string()).default([]),
  lockedPropIds: z.array(z.string()).default([]),
  worldFacts: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
});
export type CanonState = z.infer<typeof CanonStateSchema>;

export const WorldStateSchema = z.object({
  timestamp: z.string().datetime(),
  episodeId: z.string().optional(),
  sceneId: z.string().optional(),
  characterLocations: z.record(
    z.object({
      locationId: z.string(),
      zoneId: z.string().optional(),
      status: z.string().optional(), // e.g. "active", "injured", "hidden"
    })
  ).default({}),
  propHolders: z.record(z.string()).default({}), // propId -> characterId or locationId
  worldFacts: z.array(z.string()).default([]),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

export const StateTransitionSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  trigger: z.string(), // e.g. "Minh enters the living room and picks up the amulet"
  episodeId: z.string().optional(),
  sceneId: z.string().optional(),
  changes: z.object({
    characterMovements: z.array(
      z.object({
        characterId: z.string(),
        fromLocationId: z.string().optional(),
        toLocationId: z.string(),
        toZoneId: z.string().optional(),
      })
    ).default([]),
    propTransfers: z.array(
      z.object({
        propId: z.string(),
        fromHolder: z.string().optional(),
        toHolder: z.string(),
      })
    ).default([]),
    factsAdded: z.array(z.string()).default([]),
    factsRemoved: z.array(z.string()).default([]),
  }),
});
export type StateTransition = z.infer<typeof StateTransitionSchema>;

export const ContinuitySnapshotSchema = z.object({
  id: z.string().min(1),
  seriesId: z.string().min(1),
  timestamp: z.string().datetime(),
  episodeId: z.string().optional(),
  sceneId: z.string().optional(),
  worldState: WorldStateSchema,
  notes: z.string().optional(),
});
export type ContinuitySnapshot = z.infer<typeof ContinuitySnapshotSchema>;

export const UniverseSchema = z.object({
  seriesId: z.string().min(1),
  characters: z.record(CharacterDNASchema).default({}),
  locations: z.record(LocationDNASchema).default({}),
  props: z.record(PropDNASchema).default({}),
  relationships: z.array(RelationshipDNASchema).default([]),
  canonState: CanonStateSchema.default({
    lockedCharacterIds: [],
    lockedLocationIds: [],
    lockedPropIds: [],
    worldFacts: [],
    updatedAt: new Date(0).toISOString(),
  }),
  currentWorldState: WorldStateSchema.default({
    timestamp: new Date(0).toISOString(),
    characterLocations: {},
    propHolders: {},
    worldFacts: [],
  }),
  transitions: z.array(StateTransitionSchema).default([]),
  history: z.array(ContinuitySnapshotSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Universe = z.infer<typeof UniverseSchema>;

export const UniverseExportBundleSchema = z.object({
  schemaVersion: z.string().default('1.0.0'),
  seriesId: z.string().min(1),
  exportedAt: z.string().datetime(),
  checksum: z.string().min(1),
  universe: UniverseSchema,
});
export type UniverseExportBundle = z.infer<typeof UniverseExportBundleSchema>;
