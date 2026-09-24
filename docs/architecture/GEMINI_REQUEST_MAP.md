# Architecture: Gemini & Google Video Live Request Map

This document provides an exhaustive, authoritative audit of all call paths capable of issuing live external network requests to Google Gemini and Google Veo in **AI Animation Studio**, the gates that authorize them, their cache/reuse mechanisms, and their fail-fast behaviors.

---

## 1. Single Credential Architecture

All live Google AI and Video requests in AI Animation Studio use **exactly ONE credential**:
- Environment variable: `GEMINI_API_KEY`
- Prohibited: `GEMINI_API_KEY_2`, `BACKUP_GEMINI_KEY`, key rotation pools, automatic secondary fallback.
- Quota isolation is enforced at the Google Cloud Project level, never through credential rotation in Studio code.

---

## 2. Request Map Overview

| Component | Method | Role / Task | Default Offline Behavior | Live Authorization Gate | Cache-First Reuse | Fail-Fast Policy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GeminiProvider** | `diagnoseHealth(live)` | Ping (5 tokens) | `live=false`: 0 calls, validates API key format | `--live` flag OR `RUN_LIVE_PROVIDER_TESTS=true` | N/A (Diagnostic) | Daily quota fails immediately without retry |
| **GeminiProvider** | `generateText(req)` | `FAST` / `REASONING` | Throws `ProductionSafetyError` if unconfigured | `allowLiveCalls=true` OR `RUN_LIVE_PROVIDER_TESTS=true` | `LLMCache` (seriesId, model, prompt, promptVersion) | Daily quota (RPD, 429 daily) fails fast with 0 retries; transient 429 retries max 2-3 |
| **GeminiProvider** | `generateStructured(req)` | `STRUCTURED` / `QA` / `VISION_QA` | Throws `ProductionSafetyError` if unconfigured | `allowLiveCalls=true` OR `RUN_LIVE_PROVIDER_TESTS=true` | `LLMCache` (seriesId, model, schema, prompt) | Schema errors fail fast (0 retries); daily quota fails fast |
| **ProviderStoryAnalyzer** | `analyze(sourceDoc)` | `STORY_ANALYSIS` (`STRUCTURED`) | Uses local mock analyzer if LLM absent | Gated by `GeminiProvider.generateStructured` | `LLMCache` keyed by story text hash + seriesId | Daily quota fails fast |
| **VisualSemanticQAEvaluator** | `evaluateShotVideo(opts)` | `CONTINUITY_QA` (`VISION_QA`) | Falls back to `LOCAL_MEDIA_METADATA` | Gated by `GeminiProvider.generateStructured` | Composite cache on mediaSha256 + shotId + canonical refs | Quota exhaustion sets `WAITING_FOR_PROVIDER` immediately |
| **GeminiVeoVideoProvider** | `generateClip(req)` | Video Gen (`veo-2.0-generate-001`) | Throws if unconfigured | `allowLiveCalls=true` (requires `GEMINI_API_KEY`) | `VeoOperationStore` deduplication by promptHash | Quota exhaustion throws `VeoQuotaError` (0 retries) |
| **GeminiVeoVideoProvider** | `resumeOperation(...)` | Polling / Download | Reads store | Reconnects to existing operation name | Store returns `DONE` directly if file exists | Polling 429 records status, no duplicate generation |
| **ClipService** | `generateClip(req)` | One-Prompt Clip | Throws if unconfigured | Gated by Veo Provider | Checks `VeoOperationStore` before submission | Quota returns `WAITING_FOR_PROVIDER` |
| **ClipService** | `resumeClip(proj, clipId)` | Clip Resume | Reads operation store | Resumes existing polling operation | Reuses existing MP4 if already downloaded | 0 duplicate paid generation |
| **ProductionOrchestrator** | `execute(proj, runId)` | Pilot / Story / HF / QA | Deterministic HF first, Flow/Veo second | Gated by `GeminiProvider` | Checkpoint DAG + Asset Registry | Fails fast, transitions to `WAITING_FOR_PROVIDER` |
| **ProductionOrchestrator** | `resumeVisualQAFromExistingMedia` | QA Resume | Reuses existing `GOOGLE_FLOW_REAL` or `LIVE_PROVIDER` media | Gated by `GeminiProvider` | Reuses existing media on disk, preserves exact SHA-256 | Fails fast to `WAITING_FOR_PROVIDER` on quota |
| **CLI `studio gemini doctor`** | `diagnoseHealth(isLive)` | Health check | Default `isLive=false`: ZERO network calls | `--live` flag explicitly required | N/A | Prints status and latency |
| **CLI `studio clip`** | One-Prompt Video | Veo Generation + Visual QA | N/A (Operator tool) | Explicit operator CLI command | Duplicate prompt hash resumes existing operation | Quota returns `WAITING_FOR_PROVIDER` |

---

## 3. Quota Fail-Fast Rules

When the Google API returns an error containing:
- `RESOURCE_EXHAUSTED` (and not a transient rate limit)
- `RequestsPerDay` or `GenerateRequestsPerDay`
- `PerDayPerProjectPerModel`
- `quota exceeded` or `daily quota`
- `rpd`

The system classifies it as **`QUOTA_EXCEEDED`** and **FAILS FAST WITH ZERO RETRIES**:
1. No retry storm is ever triggered.
2. The current operation or production run transitions cleanly to `WAITING_FOR_PROVIDER`.
3. Checkpoint metadata is preserved on disk (`resumeStage: 'VISUAL_QA'`, `canResume: true`).
4. Physical media files and SHA-256 bindings remain intact.

Transient rate limits (`RATE_LIMITED` / standard 429) use bounded exponential backoff with jitter:
- Maximum retry count: **2 retries** (default).
- Max backoff: **4000ms**.

---

## 4. Cache-First Policy

To avoid consuming quota unnecessarily, authoritative artifacts are cached and reused:
1. **Identical Video Media QA**: When `evaluateShotVideo` runs against a physical video file whose SHA-256, shot contract, and canonical character references match an existing authoritative `LIVE_EXTERNAL` pass, the evaluation result is reused without invoking Gemini.
2. **Story Analysis**: Analyzed source document candidates are cached per `seriesId` and document hash in `LLMCache`.
3. **Structured Extractions**: Schema validation results are cached with schema and prompt version tags.
4. **Veo Duplicate Submission Protection**: `VeoOperationStore.findExistingOperation(projectId, promptHash)` checks for existing `SUBMITTED`, `POLLING`, or `DONE` records before sending any new video generation request to the Google API.
5. **Config Diagnostics**: `studio gemini doctor` defaults to configuration check only (0 network calls).

---

## 5. Usage Telemetry

GeminiProvider records sanitized in-memory metrics for operator visibility:
- `liveRequestsAttempted`: Total network attempts initiated
- `liveRequestsSucceeded`: Total network requests returning 200 OK
- `liveRequestsBlocked`: Total calls intercepted offline without network activity
- `liveRequestsFailed`: Total calls failing after bounded retries or failing fast
- `cacheHits`: Total requests fulfilled from cache without network activity
- Breakdown by role: `FAST`, `REASONING`, `STRUCTURED`, `QA`, `VISION_QA`

Telemetry contains **no secret keys, prompts, or sensitive payloads** and can be viewed via:
```bash
npm.cmd run studio -- gemini telemetry
```
