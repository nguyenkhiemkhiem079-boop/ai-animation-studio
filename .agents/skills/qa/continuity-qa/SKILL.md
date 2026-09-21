---
name: continuity-qa
version: 1.0.0
category: qa
description: "Comprehensive continuity verification across character identities, outfits, props, spatial screen direction, lighting, and timeline states."
dependencies:
  - universe-resolve
  - world-state-check
applicablePhases:
  - "Phase 3.5"
  - "Phase 4"
  - "Phase 5"
  - "Phase 6"
---

# Continuity QA Skill

## Purpose
The `continuity-qa` skill establishes a rigorous multi-point audit of shot sequences to detect continuity errors across narrative, visual, spatial, and temporal dimensions before final assembly.

## The Continuity Inspection Matrix

| Dimension | Verification Check | Failure Consequence |
| :--- | :--- | :--- |
| **Character & Version** | Correct `character_id` and `version` present in scene | Character morphs or changes canonical age/state |
| **Outfit & Costume** | Designated outfit matches scene narrative context | Costume changes mid-scene without explanation |
| **Location & Geometry** | Architectural landmarks, exits, and windows match set plan | Set changes layout between reverse angles |
| **Props & State** | Held items, damaged objects, and placed props persist | Items vanish, duplicate, or spontaneously repair |
| **Screen Direction** | Eyelines and movement vectors respect the 180° line | Disorienting reverse-line cuts |
| **Lighting & Time** | Sun position, sky condition, and shadow direction match | Time of day fluctuates erratically across cuts |
| **Style & Palette** | Color grading, line weight, and art direction match show Bible | Visual style clashes across shots |
| **Voice & Timbre** | Audio character voice profile is consistent | Character voice changes pitch or timbre |
| **Timeline** | Total sequence duration matches scene beat timing | Pacing stalls or jumps abruptly |

## Audit Procedure for Agents
1. **Load Preceding Shot State**: Retrieve terminal state of Shot $N-1$ from sequence history.
2. **Compare Against Current Shot Contract / Render**: Inspect Shot $N$ for discrepancies in the 9 dimensions above.
3. **Generate Continuity Report**:
   - If 100% compliant: Issue `CONTINUITY_PASS`.
   - If discrepancy found: Flag specific failure dimension and invoke `retake` or `shot-plan` correction.
