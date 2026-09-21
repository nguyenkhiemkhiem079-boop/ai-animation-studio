---
name: character-resolve
description: Character DNA and immutable versioning skill. Enforces that Character v1 historical records remain frozen when v2 or v3 are created.
version: 1.0.0
category: universe
---

# Character Resolution & Versioning Skill (`character-resolve`)

Use this skill to manage Character DNA and guarantee historical immutability across multi-episode series.

---

## 🎭 Versioning Rules

1. **Initial Creation (v1)**:
   - Sets `currentVersion = 1` and creates initial snapshot in `versions[0]`.
   - Binds visual anchor prompt, voice timbre, and canonical sheet asset IDs.
2. **Evolution (v2, v3)**:
   - When a character appearance changes (e.g. scars, new hairstyle, aging):
     - Deep-copy existing versions array.
     - Append new version object with incremented version number.
     - Set `currentVersion = currentVersion + 1`.
   - **Crucial Rule**: Updating Character v2 MUST NOT modify or overwrite Character v1 data. Past episodes rely on historical versions.
3. **Outfits**:
   - Outfits are version-agnostic or tied to specific versions; managed as distinct entries with reference asset IDs.
