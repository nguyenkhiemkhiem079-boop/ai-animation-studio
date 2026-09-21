# Architecture: Provider Model

## Philosophy
External AI providers and rendering engines are stateless workers. The Studio coordinates execution and guarantees schema compliance.

```
┌──────────────────────────────────────────────┐
│               ProviderRegistry               │
└──────────────┬────────────────┬──────────────┘
               │                │
       routes to                routes to
               ▼                ▼
     ┌──────────────────┐  ┌──────────────────┐
     │   LLMProvider    │  │   VideoProvider  │
     │(Gemini, Claude)  │  │(Veo, Seedance,   │
     └──────────────────┘  │ Comfy, Local)    │
                           └──────────────────┘
```

## `IProvider` Contract
Every provider implements:
- `id`: Unique identifier (e.g. `mock-provider`, `gemini-pro`, `veo-2`).
- `capabilities`: Set of `ProviderCapability` (`llm`, `image_gen`, `video_gen`, `audio_gen`, `deterministic_anim`, `qa`).
- `healthCheck()`: Async test of connectivity / credentials.
- `executeTask(task)`: Generic typed execution with telemetry and cost estimation.

## Provider Independence Rules
- Core modules cannot import `@google/genai` or any vendor-specific library.
- Concrete providers are implemented as decoupled plugins conforming to `IProvider`.
- Fallbacks are automatic: If a primary provider is unavailable or over budget, the registry falls back to secondary or local mock implementations.
