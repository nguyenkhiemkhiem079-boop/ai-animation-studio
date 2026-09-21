import { describe, it, expect } from 'vitest';
import { InMemoryAssetRegistry } from '../src/index.js';

describe('Asset Registry Foundation', () => {
  it('registers new asset and allows retrieval by ID and hash', async () => {
    const registry = new InMemoryAssetRegistry();

    const asset = await registry.register({
      id: 'asset_minh_neutral_v1',
      seriesId: 'series_001',
      type: 'character_pose',
      status: 'candidate',
      name: 'Minh Neutral Pose',
      contentHash: 'hash_abc123456789',
      storageUri: 'assets/characters/minh_neutral_v1.png',
      mimeType: 'image/png',
      sizeBytes: 102400,
      entityId: 'CHAR_MINH_001',
      version: 1,
      tags: ['neutral', 'front_view'],
      metadata: {},
    });

    expect(asset.id).toBe('asset_minh_neutral_v1');

    const byId = await registry.findById('asset_minh_neutral_v1');
    expect(byId).toEqual(asset);

    const byHash = await registry.findByHash('series_001', 'hash_abc123456789');
    expect(byHash).toEqual(asset);
  });

  it('deduplicates identical assets by content hash within series', async () => {
    const registry = new InMemoryAssetRegistry();

    const asset1 = await registry.register({
      id: 'asset_first',
      seriesId: 'series_001',
      type: 'location_backdrop',
      status: 'candidate',
      name: 'Old House Living Room',
      contentHash: 'hash_identical_room',
      storageUri: 'assets/loc/room.png',
      mimeType: 'image/png',
      sizeBytes: 50000,
      version: 1,
      tags: [],
      metadata: {},
    });

    // Register again with different ID but same hash & series
    const asset2 = await registry.register({
      id: 'asset_second_duplicate',
      seriesId: 'series_001',
      type: 'location_backdrop',
      status: 'candidate',
      name: 'Old House Living Room Duplicate',
      contentHash: 'hash_identical_room',
      storageUri: 'assets/loc/room_dup.png',
      mimeType: 'image/png',
      sizeBytes: 50000,
      version: 1,
      tags: [],
      metadata: {},
    });

    // Deduplication returns the first registered canonical asset!
    expect(asset2.id).toBe(asset1.id);
  });

  it('promotes candidate to approved canon', async () => {
    const registry = new InMemoryAssetRegistry();

    await registry.register({
      id: 'asset_to_approve',
      seriesId: 'series_001',
      type: 'character_sheet',
      status: 'candidate',
      name: 'Minh Turnaround Sheet',
      contentHash: 'hash_sheet_01',
      storageUri: 'assets/sheet.png',
      mimeType: 'image/png',
      sizeBytes: 204800,
      version: 1,
      tags: ['sheet'],
      metadata: {},
    });

    const approved = await registry.approveCanon('asset_to_approve');
    expect(approved.status).toBe('approved_canon');
    expect(approved.approvedAt).toBeDefined();

    const fetched = await registry.findById('asset_to_approve');
    expect(fetched?.status).toBe('approved_canon');
  });

  it('filters assets by query tags, entityId, and status', async () => {
    const registry = new InMemoryAssetRegistry();

    await registry.register({
      id: 'a1',
      seriesId: 's1',
      type: 'character_pose',
      status: 'approved_canon',
      name: 'Minh Scared',
      contentHash: 'h1',
      storageUri: 'u1',
      mimeType: 'image/png',
      sizeBytes: 100,
      entityId: 'CHAR_MINH',
      version: 1,
      tags: ['scared', 'side_view'],
      metadata: {},
    });

    await registry.register({
      id: 'a2',
      seriesId: 's1',
      type: 'character_pose',
      status: 'candidate',
      name: 'Minh Happy',
      contentHash: 'h2',
      storageUri: 'u2',
      mimeType: 'image/png',
      sizeBytes: 100,
      entityId: 'CHAR_MINH',
      version: 1,
      tags: ['happy', 'front_view'],
      metadata: {},
    });

    const results = await registry.query({
      seriesId: 's1',
      entityId: 'CHAR_MINH',
      status: 'approved_canon',
      tags: ['scared'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a1');
  });
});
