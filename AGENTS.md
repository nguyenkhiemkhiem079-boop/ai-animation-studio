# AGENTS.md — AI Animation Studio Agent Guidelines

Welcome to the **AI Animation Studio** repository. This document defines the engineering standards, architecture rules, and mental models that any AI coding agent or human contributor must strictly adhere to.

---

## 1. Core Architectural Tenets

1. **Provider-Independent**:
   - External systems (Gemini, Veo, Seedance, HyperFrames, ElevenLabs, ComfyUI, etc.) are **workers/providers**, NOT the core product.
   - Core domain logic must never import or depend directly on third-party provider SDKs.
   - All provider interactions go through typed `IProvider` abstractions and `ProviderRegistry`.

2. **Series-Aware & Universe-Persistent**:
   - Series must remain completely isolated from each other.
   - Character DNA and Location DNA are persistent across episodes.
   - Updating Character v2 MUST NOT modify or mutate Character v1 (immutability of historical versions).

3. **Candidate != Canon**:
   - AI generation and extraction produces **Candidates** (`CharacterCandidate`, `LocationCandidate`, `SceneCandidate`, `AssetCandidate`).
   - Candidates are only promoted to **Canon** upon passing validation, QA, or human approval.
   - Never overwrite Canon with unverified Candidates.

4. **Source-Preserving & Traceability**:
   - The user's original script/story must remain intact.
   - "Preserve Original" mode is strictly lossless.
   - Every downstream entity (`NarrativeBeat`, `SceneCandidate`, `ShotContract`) must trace back to source text hashes/offsets via `source_traceability`.

5. **Deterministic Animation First**:
   - Prioritize deterministic tools (e.g. HyperFrames, layer transforms, parallax, camera moves) before calling expensive generative video models.
   - Cost and latency awareness is baked into production routing.

6. **Resumable & Checkpoint-Driven**:
   - Every phase of the pipeline records checkpoints (`v0.1-foundation`, `v0.2-universe`, etc.).
   - A pipeline failure or user interruption must be resumable without re-running completed steps.

7. **100% Testable Locally**:
   - Core domain logic, schemas, asset registry, and pipeline orchestrator must execute locally without cloud credentials.
   - Always provide mock/in-memory provider implementations for testing.

---

## 2. Monorepo Organization

```
ai-animation-studio/
├── .agents/                    # Antigravity agent configuration & skills
│   └── skills/                 # Project-native Skill OS & external production skills
├── .github/workflows/          # CI pipelines
├── docs/                       # Architecture and skill documentation
│   ├── architecture/
│   └── skills/                 # Skill OS reference & guide
├── packages/
│   ├── core/                   # Domain models, schemas, pipeline, storage, providers, checkpoints, skill-os
│   │   ├── src/
│   │   │   ├── domain/         # Zod schemas & TypeScript types
│   │   │   ├── errors/         # StudioError hierarchy
│   │   │   ├── logging/        # Structured contextual logger
│   │   │   ├── events/         # Strongly-typed event bus
│   │   │   ├── storage/        # IStorageProvider (Fs & Memory)
│   │   │   ├── checkpoint/     # CheckpointManager
│   │   │   ├── pipeline/       # DAG Pipeline execution engine
│   │   │   ├── providers/      # IProvider & ProviderRegistry
│   │   │   ├── asset-registry/ # AssetRegistry (dedup, versioning, canon)
│   │   │   ├── director/       # ShotContract & Director abstractions
│   │   │   ├── cinematic-skills/# Semantic cinematic skills registry
│   │   │   ├── skill-os/       # Skill OS registry, validator, and router
│   │   │   └── index.ts        # Public exports
│   │   └── tests/              # Vitest test suite
│   └── cli/                    # Studio CLI (doctor, checkpoint, inspect, skills)
│       ├── src/
│       └── tests/
├── AGENTS.md                   # This guideline file
├── README.md                   # Project overview & quickstart
├── package.json                # Workspaces root
└── tsconfig.json               # Composite project references
```

---

## 3. Development Workflow & Rules

- **Language & Runtime**: TypeScript 5.x, Node.js >= 20.0.0 (NodeNext module resolution, ESM).
- **Validation**: Every external payload, persisted JSON, or cross-boundary contract MUST be validated via **Zod** schemas.
- **Command Line on Windows**: When running npm in Windows PowerShell, use `npm.cmd` if script execution policies block `npm.ps1`.
- **Testing**: Unit test every new component using Vitest. Run `npm.cmd run test` and `npm.cmd run typecheck` before concluding tasks.
- **Semantic Commit Messages**: Use conventional commits (`feat:`, `chore:`, `fix:`, `docs:`, `test:`).

---

## 4. Antigravity Skill OS & Production Knowledge

1. **Inspect Relevant Skills First**:
   - Before undertaking specialized tasks, inspect relevant skills in `.agents/skills/`.
   - Use the Studio Router (`.agents/skills/studio/SKILL.md` or `studio skills route <query>`) to identify domain skills.
2. **External vs Internal Skills**:
   - Official HyperFrames skills (`/hyperframes`, `/hyperframes-core`, `/hyperframes-animation`) are installed as external skills and are authoritative on HyperFrames syntax.
   - Do NOT duplicate external skills into our custom skills. Use `hyperframes-production` to define Studio-to-HyperFrames compilation.
3. **Architecture Authority**:
   - Skills provide **knowledge** and **workflow discipline**, but application code and Zod schemas remain **authoritative**.
   - A skill must never override core architectural tenets or schema constraints.
4. **Skill Security**:
   - Skills must never exfiltrate secrets, print API keys, or recommend destructive commands without approval.
