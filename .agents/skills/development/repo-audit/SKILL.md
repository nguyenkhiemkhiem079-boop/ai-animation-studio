---
name: repo-audit
description: Pre-phase repository inspection skill. Verifies architecture, schemas, tests, git status, and dependencies before modifying code.
version: 1.0.0
category: development
---

# Repository Audit Skill (`repo-audit`)

Use this skill **BEFORE** modifying any code at the start of a phase or major task.

---

## 🔍 Mandatory Pre-Flight Checklist

1. **Read Core Guidelines**:
   - Inspect [AGENTS.md](file:///c:/Users/khiem.nguyen/Documents/GitHub/ai-animation-studio/AGENTS.md).
   - Review relevant architectural documents in [docs/architecture/](file:///c:/Users/khiem.nguyen/Documents/GitHub/ai-animation-studio/docs/architecture/).
2. **Inspect Current State**:
   - Run `git status` to verify working tree cleanly reflects previous checkpoints.
   - Check existing schemas in `@ai-studio/core/src/domain/`.
3. **Run Existing Test Suite**:
   - Execute `npm.cmd run test` to ensure previous phases are not broken.
   - Execute `npm.cmd run typecheck` to verify zero TypeScript errors.
   - Execute `npm.cmd run build` to ensure all workspaces compile cleanly.
4. **Identify Technical Debt & Dead Code**:
   - Check for TODOs, duplicate modules, or commented-out blocks relevant to the requested task.
5. **Report Existing Failures First**:
   - If tests or builds fail, stop immediately and report existing issues before proceeding.
