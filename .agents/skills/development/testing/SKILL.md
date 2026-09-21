---
name: testing
description: Testing quality gates skill. Defines mandatory test levels (unit, integration, regression, typecheck, build) before concluding work.
version: 1.0.0
category: development
---

# Testing Quality Gates Skill (`testing`)

Use this skill to ensure all code passes rigorous local validation without requiring cloud services.

---

## 🧪 Mandatory Project Gates

1. **Typecheck Gate**:
   - Command: `npm.cmd run typecheck`
   - Requirement: Zero TypeScript errors across all composite workspaces.
2. **Build Gate**:
   - Command: `npm.cmd run build`
   - Requirement: All workspaces (`@ai-studio/core`, `@ai-studio/cli`) compile with exit code 0.
3. **Unit & Integration Test Gate**:
   - Command: `npm.cmd run test`
   - Requirement: 100% test pass rate in Vitest. No skipped or failing tests.
4. **Regression Gate**:
   - All tests from previous phases (Phase 0, 1, 2, 3) must continue to pass.
5. **No Cloud Mocking Policy**:
   - All tests must run locally using in-memory or filesystem storage and mock providers.
