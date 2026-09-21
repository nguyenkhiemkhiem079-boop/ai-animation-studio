---
name: universe-resolve
description: Universe entity resolution skill. Resolves candidate names against canonical characters, locations, and props within strict series boundaries.
version: 1.0.0
category: universe
---

# Universe Entity Resolution Skill (`universe-resolve`)

Use this skill to bind story elements to canonical universe records and prevent redundant entity creation.

---

## 🎯 Resolution Order

1. **Exact ID Match**: Check if query string matches an existing entity ID (e.g. `CHAR_MINH_001`, `LOC_OLD_HOUSE_001`).
2. **Canonical Name Match**: Check normalized, case-insensitive, punctuation-stripped canonical name.
3. **Alias Match**: Check registered aliases list (e.g. "Detective Minh", "The Haunted Villa").
4. **Unresolved Candidate**: If no match is found, preserve as `Candidate` (`resolved: false`). Do NOT auto-promote to Canon.
5. **Series Isolation**: Never search or match across series boundaries. Resolution is strictly namespaced by `seriesId`.
