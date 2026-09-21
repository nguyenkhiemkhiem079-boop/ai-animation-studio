---
name: phase-gate
description: Mandatory phase completion gate. Validates acceptance checklist, tests, typecheck, build, git status, and checkpoint tagging before concluding a phase.
version: 1.0.0
category: development
---

# Phase Gate Skill (`phase-gate`)

Use this skill as the final mandatory checkpoint before declaring any phase complete.

---

## 🏁 Phase Gate Checklist

Before declaring a phase complete, verify:

- [ ] All acceptance criteria defined in the phase prompt are satisfied.
- [ ] `npm.cmd run build` passes with code 0.
- [ ] `npm.cmd run typecheck` passes with code 0.
- [ ] `npm.cmd run test` passes 100% across all packages.
- [ ] No secrets, API keys, or temporary debugging code committed.
- [ ] Documentation updated (`README.md`, `walkthrough.md`, architecture docs).
- [ ] Git commit created using conventional commit format (e.g. `feat: ...`, `chore: ...`).
- [ ] Git tag created matching phase checkpoint (e.g. `v0.1-foundation`, `v0.2-universe`, `v0.3-story-intelligence`, `v0.4-director`).

**Gate Output**:
- If all checks pass: `PHASE STATUS = COMPLETE`
- If any check fails: `PHASE STATUS = NOT COMPLETE` (Report failures immediately).
