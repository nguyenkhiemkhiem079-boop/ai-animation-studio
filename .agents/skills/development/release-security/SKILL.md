---
name: release-security
version: 1.0.0
category: development
description: "Audits repository, artifacts, and CLI invocations for secret leakage, command injection, path traversal, and test-to-production boundary leakage."
dependencies:
  - repo-audit
  - architecture-review
applicablePhases:
  - "Phase 20"
  - "Phase 21"
  - "Phase 22"
  - "Phase 23"
  - "Phase 24"
  - "Live Production"
---

# Release Security Skill

## Purpose
The `release-security` skill enforces security standards across the studio codebase, CLI scripts, pipeline orchestrations, and release artifacts. It audits against credential leaks, injection vectors (especially FFmpeg/FFprobe CLI calls), filesystem boundary violations, and test fixture contamination of production environments.

## Threat Model & Audit Vectors

```
┌─────────────────────────────────┬─────────────────────────────────────────────────┐
│ Vector Category                 │ Risk & Inspection Focus                         │
├─────────────────────────────────┼─────────────────────────────────────────────────┤
│ Secret Exposure                 │ GEMINI_API_KEY, Bearer tokens, hardcoded keys   │
│ Command Injection               │ FFmpeg/FFprobe parameter concatenation          │
│ Path Traversal                  │ Unsanitized shot IDs, relative ../ escapes      │
│ Boundary Contamination         │ Test doubles or mock media written into release │
│ Evidence Tampering              │ Inconsistent SHA-256 digests in manifests       │
└─────────────────────────────────┴─────────────────────────────────────────────────┘
```

## Security Invariants

### 1. Zero Secret Exposure
- No API keys (e.g. `AIza...`), auth tokens, or private endpoints may appear in:
  - Source code files (`.ts`, `.js`, `.json`).
  - Git commit history or staging area.
  - Log output, error stack traces, or console messages.
  - Persisted evidence manifests or export bundles.
- All secrets must be accessed strictly through runtime environment variables (`process.env.GEMINI_API_KEY`).
- `.env` files must be ignored in `.gitignore`.

### 2. Command Execution & Process Isolation
- External binaries (such as `ffmpeg` and `ffprobe`) must be invoked safely:
  - **PROHIBITED**: `exec(` or `execSync(` using unescaped string interpolation (e.g. ``execSync(`ffmpeg -i ${userInput}`)``).
  - **REQUIRED**: Use argument arrays with `spawn` or `execFile` where inputs are passed as discrete elements without a shell (`shell: false`).
- Validate all user-supplied paths, codecs, and durations against strict regex allowlists before passing to processes.

### 3. Filesystem Containment & Path Traversal
- Project IDs, episode IDs, and shot IDs must match strict identifier patterns (e.g. `/^[a-zA-Z0-9_-]+$/`).
- Never concatenate unvalidated input into filesystem paths using simple string addition.
- Resolve all paths against designated workspace roots and verify `resolvedPath.startsWith(allowedRoot)`. Reject any path containing `../` or `..\\`.

### 4. Test-to-Production Separation
- Fixture files, mock media, and test doubles must never leak into release distributions (`dist/`, `packages/cli/bin`, or production release bundles).
- Verify that `Candidate` objects cannot be promoted to `Canon` via automated test harness bypasses.

## Recommended Source Audit Vocabulary

When conducting a security audit before release, inspect for these patterns:

| Pattern | Inspection Rationale | Safe Practice |
| :--- | :--- | :--- |
| `GEMINI_API_KEY`, `AIza` | Hardcoded API keys or test keys | Must only appear as `process.env.GEMINI_API_KEY` |
| `Bearer`, `secret`, `token` | Authorization headers, private tokens | Sanitize before logging or persisting |
| `exec(`, `execSync(` | Arbitrary shell execution | Replace with `spawn` or `execFile` without shell |
| `shell: true` | Shell spawning (cmd.exe / sh injection) | Set `shell: false` and pass argv array |
| `child_process` | Raw OS process invocation | Centralize in a validated executor module |
| `../`, `..\\` | Directory traversal attempt | Use `path.resolve` and check boundary confinement |

*Note: Interpret matches contextually; do not blindly replace strings.*

## Audit Procedure for Agents

1. **Static Analysis & Grep Audit**:
   - Run grep scans across the repository for credentials, suspicious tokens, and raw `exec` calls.
2. **Review Git Status & Diffs**:
   - Ensure no `.env`, private configuration, or credential artifacts are staged for commit.
3. **Verify Process Execution Architecture**:
   - Inspect media verification modules to ensure FFmpeg/FFprobe invocations use safe argument arrays.
4. **Inspect Acceptance Manifests**:
   - Verify that all media files bound to the release bundle are real assets within allowed workspace directories.

## Do / Do Not Rules

- **DO** run credential and security checks before any phase release or git commit.
- **DO** sanitize error logs so that network exception traces do not leak query strings or auth headers.
- **DO** validate all file paths against workspace root boundaries.
- **DO NOT** commit `.env` or temporary credential files.
- **DO NOT** use raw shell interpolation for media commands.
- **DO NOT** allow mock artifacts or synthetic test fixtures to be included in production release manifests.

## Architecture References
- `packages/core/src/logging/` (Structured contextual logger with redaction)
- `packages/core/src/errors/` (StudioError hierarchy with safe error reporting)
- `AGENTS.md` (Section 3: Development Workflow & Rules, Section 4: Skill Security)
