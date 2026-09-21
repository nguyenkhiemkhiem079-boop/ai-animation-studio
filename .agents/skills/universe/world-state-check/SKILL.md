---
name: world-state-check
description: World state and continuity tracking skill. Tracks character locations, zone positioning, prop possession, and continuity snapshots.
version: 1.0.0
category: universe
---

# World State & Continuity Tracking Skill (`world-state-check`)

Use this skill to track the dynamic state of characters, locations, and props across scenes and episodes.

---

## 🗺️ State Tracking Guidelines

1. **State Transitions**:
   - All movements and transfers must be applied via `WorldStateTracker.applyTransition()`.
   - Validate that characters and locations exist in the series universe.
   - Enforce zone validity (e.g. `living_room` must belong to `LOC_OLD_HOUSE`).
2. **Prop Possession**:
   - Track current holder of props (`propHolders` mapping prop ID to character ID or location ID).
3. **Continuity Snapshots**:
   - Capture snapshots at scene boundaries and episode cliffhangers (`createContinuitySnapshot()`).
   - Store snapshots in `universe.history` for instant rollback or continuity verification.
