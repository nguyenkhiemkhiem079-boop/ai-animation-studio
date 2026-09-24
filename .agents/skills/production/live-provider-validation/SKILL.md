---
name: live-provider-validation
version: 1.0.0
category: production
description: "Governs live external AI provider execution (Gemini), role-based model policies, single-credential enforcement, quota discipline, and provider provenance without faking live evidence."
dependencies:
  - architecture-review
  - production-route
applicablePhases:
  - "Phase 18"
  - "Phase 19"
  - "Phase 20"
  - "Phase 23"
  - "Phase 24"
  - "Live Production"
---

# Live Provider Validation Skill

## Purpose
The `live-provider-validation` skill governs all interactions where offline provider abstractions cross into genuine external multimodal / LLM execution (specifically Google Gemini). It guarantees strict provider-independent architecture, enforces single-credential discipline, adheres to role-based model policies, and preserves uncompromised provider provenance.

## Core Architectural Invariants

1. **Provider Independence**:
   - Core domain logic never imports `@google/genai` or third-party provider SDKs directly.
   - All external execution flows through the typed `IProvider` / `GeminiProvider` abstraction registered in `ProviderRegistry`.

2. **Single Credential Architecture**:
   - **Exactly ONE** Gemini credential environment variable is recognized: `GEMINI_API_KEY`.
   - **STRICT PROHIBITION**: Never implement, propose, or accept secondary keys (`GEMINI_API_KEY_2`, `SECONDARY_GEMINI_KEY`, `BACKUP_GEMINI_KEY`, `GEMINI_API_KEYS`), automatic account cycling, or credential pools.
   - Multiple models and role policies are supported; multiple Gemini credentials are NOT.

3. **Provenance Integrity**:
   - A mock or offline test double PASS is **never** a live PASS.
   - Offline test doubles MUST tag runs as `OFFLINE_TEST_DOUBLE` or `MOCK`.
   - Only genuine network execution against external Google APIs with valid responses may produce `LIVE_EXTERNAL` provenance evidence.
   - Never manufacture, simulate, or fabricate live evidence artifacts.

## Role-Based Model Policies

The studio routes LLM capabilities based on role policies rather than hardcoded model strings:

| Role Policy | Typical Model / Target | Purpose / Workload | Structured Schema? |
| :--- | :--- | :--- | :--- |
| `FAST` | `gemini-2.5-flash` / flash tier | Rapid extraction, triage, draft outlines | Optional |
| `REASONING` | `gemini-2.5-pro` / thinking tier | Deep narrative analysis, beat mapping, director choices | Optional |
| `STRUCTURED` | `gemini-2.5-flash` | Strict Zod-validated JSON extraction (Character DNA, ShotContracts) | Required (JSON mode) |
| `QA` | `gemini-2.5-pro` | Textual continuity, logic audit, canon contradiction audit | Optional |
| `VISION_QA` | `gemini-2.5-flash` / vision multimodal | Frame comparison, identity drift detection, visual continuity | Optional |

## Quota Awareness & Rate Limiting

- **Minimal Live-Test Strategy**: Live testing consumes API tokens and rate quotas. Execute exactly **one** successful call per capability to establish live proof unless active debugging explicitly requires more.
- **Handling 429 / RESOURCE_EXHAUSTED**:
  - When encountering HTTP 429 or quota exhaustion:
    1. Mark execution state as `WAITING_FOR_PROVIDER`.
    2. Capture retry-after headers or exponential backoff parameters.
    3. Do NOT rapidly spin retries or bypass with fake results.
    4. Inform the operator with clear timing and retry status.

## Inputs & Outputs

- **Inputs**:
  - Task capability request (e.g. Character Candidate extraction, ShotContract formulation, Visual QA).
  - Environment configuration (`GEMINI_API_KEY`).
  - Target role policy (`FAST`, `REASONING`, `STRUCTURED`, `QA`, `VISION_QA`).
  - Input payload with source traceability.
- **Outputs**:
  - Validated domain output conforming to Zod schema.
  - Provider provenance metadata: `{ provider: 'gemini', model: string, callType: 'LIVE_EXTERNAL', latencyMs: number, tokenUsage?: object, timestamp: string }`.

## Validation Workflow

```
[Request Capability] ───► Verify GEMINI_API_KEY Present?
                                 │
                 ┌───────────────┴───────────────┐
                 ▼ (No)                          ▼ (Yes)
          Fail-Closed                    Select Role Model
          State: OFFLINE_ONLY            Check Quota & Schema
          (Use Test Double)                      │
                                                 ▼
                                         Execute Provider Call
                                                 │
                 ┌───────────────────────────────┴───────────────────────────────┐
                 ▼ (Success)                                                     ▼ (429 / Error)
          Validate Zod Schema                                             Capture Error Code
          Record LIVE_EXTERNAL Evidence                                   Set WAITING_FOR_PROVIDER
          Pass Downstream to Candidate                                    Do NOT Fake Output
```

1. **Pre-flight Credential & Role Check**:
   - Check `process.env.GEMINI_API_KEY`. If unset, fail-closed: do not attempt live network calls.
   - Match requested capability to appropriate role policy.
2. **Schema & Structured Output Enforcement**:
   - When role is `STRUCTURED`, configure provider response schema using Zod definition.
   - Validate received raw JSON against target domain schema before downstream ingestion.
3. **Evidence Recording**:
   - Store invocation fingerprint (model name, parameters, execution timestamp, latency, SHA-256 of payload) in production run metadata.
4. **Error & Escalation**:
   - If schema validation fails, trigger retry with error feedback (up to configured max retries).
   - If provider unavailable, escalate to operator with `WAITING_FOR_PROVIDER`.

## Do / Do Not Rules

- **DO** verify external provider health using dedicated minimal doctor probes.
- **DO** validate all provider outputs against runtime Zod schemas before candidate creation.
- **DO** record accurate provider provenance (`LIVE_EXTERNAL` vs `OFFLINE_TEST_DOUBLE`).
- **DO NOT** create secondary Gemini keys or credential rotation workarounds.
- **DO NOT** claim live provider verification when running against mocks, fixtures, or test doubles.
- **DO NOT** print or log `GEMINI_API_KEY` or authorization headers in logs, traces, or artifacts.
- **DO NOT** flood live API endpoints with redundant batch requests when an offline rehearsal suffices.

## Architecture References
- `packages/core/src/providers/` (`IProvider`, `GeminiProvider`, `ProviderRegistry`)
- `packages/core/src/domain/` (Zod schemas for domain contracts)
- `packages/core/src/production-verifier/` (Provenance models and evidence checkers)
- `AGENTS.md` (Tenet 1: Provider-Independent, Tenet 7: 100% Testable Locally)
