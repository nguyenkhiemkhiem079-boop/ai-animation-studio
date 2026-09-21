---
name: architecture-review
description: Architecture guardrails skill. Enforces provider independence, series isolation, candidate vs canon, source preservation, and deterministic animation first.
version: 1.0.0
category: development
---

# Architecture Review Skill (`architecture-review`)

Use this skill to protect the core design principles of the AI Animation Studio repository.

---

## 🏛️ Guardrail Checks

1. **Provider Independence**:
   - Verify that core domain logic (`@ai-studio/core`) never imports third-party SDKs (`@google/genai`, ElevenLabs, OpenAI, etc.).
   - All external generation must route through `IProvider` and `ProviderRegistry`.
2. **Series Isolation**:
   - Verify that all entity lookups and mutations require a `seriesId`.
   - Ensure entities from Series A cannot be retrieved or matched in Series B.
3. **Candidate != Canon**:
   - Extracted or generated characters/locations/props must remain `Candidate` entities until explicitly approved or resolved against Canon.
4. **Historical Immutability**:
   - Updating Character v2 must deep-copy and freeze Character v1 without mutating it.
5. **Source Preservation**:
   - Original user script must be preserved losslessly. Every beat and shot must trace back to source character offsets via `SourceTraceability`.
6. **Deterministic Animation First**:
   - Ensure `RendererIntent` prefers `deterministic_hyperframes` and `deterministic_rigged_2d` before falling back to `generative_full_video`.
