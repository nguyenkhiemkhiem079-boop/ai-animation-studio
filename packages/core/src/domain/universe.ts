/**
 * Domain models and schemas for Universe, Character DNA, Location DNA, and Canon.
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
  canonicalAssetIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});
export type CharacterVersion = z.infer<typeof CharacterVersionSchema>;

export const CharacterDNASchema = z.object({
  id: z.string().min(1), // e.g. CHAR_MINH_001
  seriesId: z.string().min(1),
  name: z.string().min(1),
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

export const ContinuitySnapshotSchema = z.object({
  id: z.string().min(1),
  seriesId: z.string().min(1),
  timestamp: z.string().datetime(),
  characterStates: z.record(z.record(z.unknown())),
  locationStates: z.record(z.record(z.unknown())),
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
  history: z.array(ContinuitySnapshotSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Universe = z.infer<typeof UniverseSchema>;
