# Google AI Studio Setup Guide — AI Animation Studio

This guide explains how to configure Google AI Studio / Gemini API credentials for AI Animation Studio.

---

## 1. Get an API Key from Google AI Studio

1. Navigate to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **Get API key** in the left navigation sidebar.
4. Click **Create API key** (select an existing Google AI Studio project or create a free project).
5. Copy your newly generated API key (`AIza...`).

> [!CAUTION]
> **Keep your API key strictly confidential**:
> - Never commit your API key to Git.
> - Never hardcode API keys in source files or test files.
> - Do not post API keys in issues, PRs, or public chats.

---

## 2. Configure Local Environment

Copy `.env.example` to `.env` in the root of the repository:

```bash
cp .env.example .env
```

Open `.env` and set your key:

```env
GEMINI_API_KEY=AIzaSyYourRealKeyHere
GEMINI_MODEL_FAST=gemini-3.5-flash
GEMINI_MODEL_REASONING=gemini-3.5-flash
GEMINI_MODEL_STRUCTURED=gemini-3.5-flash
GEMINI_MODEL_QA=gemini-3.5-flash
RUN_LIVE_PROVIDER_TESTS=false
```

> [!NOTE]
> `.env` is listed in `.gitignore` and will never be committed to Git.

---

## 3. Verify Configuration with Doctor

Run the studio provider diagnostics:

```bash
# Configuration check (safe, does not spend tokens)
npm run studio -- gemini doctor
```

Expected output when configured:
```text
🩺 Running Gemini Doctor (CONFIG ONLY)...
- Provider: Google Gemini (Google AI Studio)
- Status: AVAILABLE
- Configured: Yes ✅
- API Key: AIza...xxxx
- Diagnostics: Gemini API Client initialized. Key: AIza...xxxx
- Active Model: gemini-3.5-flash
```

To test live reachability:
```bash
npm run studio -- gemini doctor --live
```

---

## 4. Run the Gemini Smoke Test

Test structured extraction on the canonical golden story:

```bash
# Offline check (verifies configuration status safely)
npm run smoke:gemini

# To run a live minimal extraction:
RUN_LIVE_PROVIDER_TESTS=true npm run smoke:gemini
```

---

## 5. Free-Tier vs Paid Quota Limitations

Google AI Studio provides a free tier for Gemini models:

- **Free Tier (Rate Limits)**:
  - Typically 15 Requests Per Minute (RPM) and 1,500 Requests Per Day (RPD) on Flash models.
  - Flash models are significantly more economical and have higher rate limits than Pro models.
- **Google AI Studio vs Google Cloud / Vertex AI**:
  - Google AI Studio API keys are distinct from Google Cloud Service Accounts.
  - You do **NOT** need Google Cloud, Cloud Console, or Vertex AI for AI Animation Studio.
  - Google One AI Premium subscriptions apply to the consumer web chat (gemini.google.com), **NOT** to API token quotas in Google AI Studio.

---

## 6. Troubleshooting Common Issues

| Status Code / Error | Category | Cause & Solution |
|---|---|---|
| `401 Unauthorized` / `API_KEY_INVALID` | `AUTH_ERROR` | The key in `GEMINI_API_KEY` is invalid or expired. Check `.env` and recreate the key in Google AI Studio. |
| `403 Forbidden` / `Permission Denied` | `AUTH_ERROR` | The project associated with the key may be disabled or region-restricted. |
| `429 Too Many Requests` | `RATE_LIMITED` | Exceeded RPM (requests per minute). The Studio will automatically retry with exponential backoff and jitter. |
| `RESOURCE_EXHAUSTED: Daily quota` | `QUOTA_EXCEEDED` | Daily free tier request limit reached (1,500 RPD). Wait for quota reset at midnight UTC or use a paid billing project. |
| `DEADLINE_EXCEEDED` | `TIMEOUT` | Network latency or model load timeout. Studio automatically retries once before failing. |
