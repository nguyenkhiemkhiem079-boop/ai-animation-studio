---
name: debugging
description: Systematic debugging and defect isolation skill. Reproduce -> Isolate -> Root Cause -> Regression Test -> Fix -> Verify.
version: 1.0.0
category: development
---

# Debugging Workflow Skill (`debugging`)

Use this skill when resolving test failures, runtime errors, or unexpected pipeline behaviors.

---

## 🐞 Systematic Debugging Protocol

1. **Reproduce**: Run the specific failing test or command in isolation to confirm the symptom.
2. **Isolate**: Narrow down the failure to the specific module, schema validation, or state transition.
3. **Identify Root Cause**: Inspect stack traces, logger outputs, and input payloads. Never hide errors with broad empty `catch` blocks.
4. **Write Regression Test**: Add a test case that replicates the bug so it cannot reoccur in future phases.
5. **Fix Root Cause**: Apply the minimal, necessary architectural fix.
6. **Rerun & Verify**: Ensure both the regression test and all related test suites pass.
