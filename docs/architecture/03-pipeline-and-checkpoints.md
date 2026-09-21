# Architecture: Pipeline & Checkpoints

## Pipeline Architecture
The Studio pipeline is a step-based directed execution engine.

```
[Start] ──> [Step 1: Ingest] ──> [Checkpoint: v0.1-ingest]
                 │
                 ▼
        [Step 2: Analysis] ──> [Checkpoint: v0.2-analysis]
                 │
                 ▼
        [Step 3: Planning] ──> [Checkpoint: v0.3-planning]
```

## Checkpoint Guarantees
- Checkpoints are named, immutable snapshots of project state.
- Format: JSON metadata + state files stored under `.studio/checkpoints/<checkpoint-id>/`.
- Atomic writes: Checkpoint creation writes to temporary files first before swapping into final location.
- Resumption: A stopped or crashed pipeline loads the latest valid checkpoint and skips already completed steps.
- Rollback: Reverting to a prior checkpoint resets active state while preserving history.
