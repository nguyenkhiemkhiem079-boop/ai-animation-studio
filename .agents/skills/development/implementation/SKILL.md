---
name: implementation
description: Controlled step-by-step implementation workflow skill. Guides agents through READ -> PLAN -> IMPLEMENT -> TEST -> REVIEW -> FIX -> VALIDATE -> REPORT.
version: 1.0.0
category: development
---

# Implementation Workflow Skill (`implementation`)

Use this skill to guide the controlled execution of new features and phase tasks.

---

## 🛠️ Step-by-Step Workflow

1. **READ**: Thoroughly review requirements, existing domain models, and schemas.
2. **PLAN**: Write or update `implementation_plan.md` artifact; do not modify code until plan is reviewed.
3. **IMPLEMENT**: Build components in logical order (domain models/schemas first, core engine second, CLI/adapters third).
4. **TEST**: Write comprehensive Vitest unit tests covering positive, edge, and error cases.
5. **REVIEW**: Inspect git diff for unintended changes, dead code, or secrets.
6. **FIX**: Address any lint, typecheck, or test failures immediately.
7. **VALIDATE**: Run full verification suite (`build`, `typecheck`, `test`).
8. **REPORT**: Update `walkthrough.md` with accomplishments, test results, and checkpoint references.
