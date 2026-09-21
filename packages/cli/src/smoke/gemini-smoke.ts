/**
 * Gemini Smoke Test
 * Tests Gemini provider configuration, health, and structured output.
 * If GEMINI_API_KEY is not configured or RUN_LIVE_PROVIDER_TESTS != 'true',
 * outputs status = NOT_CONFIGURED cleanly (exit 0) without spending tokens or failing.
 */

import * as process from 'node:process';

// Automatically load .env if present
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile();
  }
} catch {
  // ignore
}
import {
  GeminiProvider,
  getCentralizedModelPolicy,
  ProviderStoryAnalyzer,
  SourceDocumentManager,
} from '@ai-studio/core';

export interface GeminiSmokeResult {
  status: 'NOT_CONFIGURED' | 'CONFIGURED_OFFLINE' | 'LIVE_SUCCESS' | 'LIVE_FAILED';
  provider: string;
  configured: boolean;
  maskedKey: string;
  models: {
    fast: string;
    reasoning: string;
    structured: string;
    qa: string;
  };
  liveCheckRun: boolean;
  structuredOutputValid?: boolean;
  extractedConcepts?: {
    characters: string[];
    locations: string[];
    props: string[];
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs?: number;
  error?: string;
}

export async function runGeminiSmoke(): Promise<GeminiSmokeResult> {
  console.log('🧪 Running Gemini Smoke Test...');

  const provider = new GeminiProvider();
  const health = await provider.diagnoseHealth(false);
  const models = getCentralizedModelPolicy();

  console.log(`- Provider: ${provider.metadata.name}`);
  console.log(`- Status: ${health.status}`);
  console.log(`- Configured: ${health.configured}`);
  console.log(`- Key: ${provider.getMaskedApiKey()}`);
  console.log(`- Fast Model: ${models.fast}`);
  console.log(`- Reasoning Model: ${models.reasoning}`);
  console.log(`- Structured Model: ${models.structured}`);
  console.log(`- QA Model: ${models.qa}`);

  // Canonical golden story text
  const canonicalGoldenText =
    'Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.';

  if (!provider.isConfigured()) {
    console.log('\n⚠️ GEMINI_API_KEY is not configured.');
    console.log('Result: status = NOT_CONFIGURED (Normal for offline / local-only environments)');
    return {
      status: 'NOT_CONFIGURED',
      provider: provider.metadata.name,
      configured: false,
      maskedKey: provider.getMaskedApiKey(),
      models: {
        fast: models.fast,
        reasoning: models.reasoning,
        structured: models.structured,
        qa: models.qa,
      },
      liveCheckRun: false,
    };
  }

  const runLive = process.env.RUN_LIVE_PROVIDER_TESTS === 'true';

  if (!runLive) {
    console.log('\nℹ️  GEMINI_API_KEY is configured, but RUN_LIVE_PROVIDER_TESTS is not "true".');
    console.log('Skipping paid/remote API invocation to preserve quota. Set RUN_LIVE_PROVIDER_TESTS=true to execute live call.');
    return {
      status: 'CONFIGURED_OFFLINE',
      provider: provider.metadata.name,
      configured: true,
      maskedKey: provider.getMaskedApiKey(),
      models: {
        fast: models.fast,
        reasoning: models.reasoning,
        structured: models.structured,
        qa: models.qa,
      },
      liveCheckRun: false,
    };
  }

  // Live call requested and key configured
  console.log('\n🚀 RUN_LIVE_PROVIDER_TESTS=true detected. Executing ONE minimal structured request...');
  const startTime = Date.now();

  try {
    const doc = SourceDocumentManager.createSourceDocument(
      'proj_smoke',
      'Golden Smoke Story',
      canonicalGoldenText,
      { documentId: 'doc_golden_smoke' }
    );

    const analyzer = new ProviderStoryAnalyzer(provider);
    const analysis = await analyzer.analyze(doc);
    const durationMs = Date.now() - startTime;

    const characters = analysis.characterCandidates.map((c) => c.suggestedName);
    const locations = analysis.locationCandidates.map((l) => l.suggestedName);
    const props = analysis.propCandidates.map((p) => p.suggestedName);

    console.log(`✅ Live Gemini Structured Output parsed and validated via Zod! (${durationMs}ms)`);
    console.log(`- Extracted Characters: ${characters.join(', ')}`);
    console.log(`- Extracted Locations: ${locations.join(', ')}`);
    console.log(`- Extracted Props: ${props.join(', ')}`);
    console.log(`- Scenes: ${analysis.sceneCandidates.length}`);

    return {
      status: 'LIVE_SUCCESS',
      provider: provider.metadata.name,
      configured: true,
      maskedKey: provider.getMaskedApiKey(),
      models: {
        fast: models.fast,
        reasoning: models.reasoning,
        structured: models.structured,
        qa: models.qa,
      },
      liveCheckRun: true,
      structuredOutputValid: true,
      extractedConcepts: {
        characters,
        locations,
        props,
      },
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error(`❌ Live Gemini request failed: ${err.message}`);
    return {
      status: 'LIVE_FAILED',
      provider: provider.metadata.name,
      configured: true,
      maskedKey: provider.getMaskedApiKey(),
      models: {
        fast: models.fast,
        reasoning: models.reasoning,
        structured: models.structured,
        qa: models.qa,
      },
      liveCheckRun: true,
      structuredOutputValid: false,
      durationMs,
      error: err.message,
    };
  }
}
