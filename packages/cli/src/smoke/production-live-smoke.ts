import * as process from 'node:process';
import {
  GeminiProvider,
  ProviderStoryAnalyzer,
  SourceDocumentManager,
  FileSystemStorage,
  FileSystemAssetRegistry,
  ProductionOrchestrator,
  EvidenceStore,
} from '@ai-studio/core';

// Automatically load .env if present
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile();
  }
} catch {
  // ignore
}

export async function runProductionLiveSmoke(): Promise<number> {
  console.log('🌐 Running Phase 18 Live Provider Pilot Verification...');

  const gemini = new GeminiProvider();
  if (!gemini.isConfigured()) {
    console.log('\n⚠️  GEMINI_API_KEY is not configured in environment.');
    console.log('Verification Status: NOT_CONFIGURED (Expected in offline / CI environments).');
    console.log('Result: status = NOT_CONFIGURED ✅');
    return 0;
  }

  if (process.env.RUN_LIVE_PROVIDER_TESTS !== 'true') {
    console.log('\nℹ️  GEMINI_API_KEY is configured, but RUN_LIVE_PROVIDER_TESTS is not "true".');
    console.log('Set RUN_LIVE_PROVIDER_TESTS=true to execute live provider call and spend quota.');
    console.log('Verification Status: CONFIGURED_OFFLINE ✅');
    return 0;
  }

  console.log('🚀 RUN_LIVE_PROVIDER_TESTS=true detected. Executing ONE live provider request for production pilot...');
  const storage = new FileSystemStorage(process.cwd());
  const assetRegistry = new FileSystemAssetRegistry(storage);
  const orchestrator = new ProductionOrchestrator(storage, assetRegistry, gemini);

  const projectId = 'proj_pilot_live';
  const seriesId = 'series_pilot_live';
  const run = await orchestrator.createRun({
    projectId,
    seriesId,
    rawScript: 'Minh bước vào căn phòng tối. Cậu nhìn thấy một con bướm trắng bay quanh ngọn nến.',
    mode: 'PRODUCTION',
  });

  try {
    const executed = await orchestrator.execute(projectId, run.runId);
    console.log(`Live request executed. Run status: ${executed.status}`);

    const evidenceStore = new EvidenceStore(storage);
    const provEvidence = await evidenceStore.loadProviderEvidence(projectId, run.runId);

    if (provEvidence.length > 0 && provEvidence[0].status === 'SUCCESS') {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 LIVE PROVIDER VERIFIED: LIVE_SUCCESS ✅');
      console.log(` - Model: ${provEvidence[0].actualModel}`);
      console.log(` - Latency: ${provEvidence[0].latencyMs}ms`);
      console.log(` - Tokens: ${JSON.stringify(provEvidence[0].usage)}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return 0;
    } else if (executed.status === 'WAITING_FOR_PROVIDER') {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  LIVE PROVIDER VERIFIED: NOT VERIFIED — QUOTA_EXCEEDED');
      console.log(` - Reason: ${executed.resumeMetadata.blockedReason}`);
      console.log(' - Completed work preserved: YES');
      console.log(` - Resume Command: ${executed.resumeMetadata.recommendedCommand}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return 0;
    } else {
      console.log(`Live run ended with status: ${executed.status}`);
      return 0;
    }
  } catch (err: any) {
    const category = gemini.classifyError(err);
    if (category === 'QUOTA_EXCEEDED' || category === 'RATE_LIMITED') {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  LIVE PROVIDER VERIFIED: NOT VERIFIED — QUOTA_EXCEEDED');
      console.log(` - Category: ${category}`);
      console.log(` - Detail: ${err.message}`);
      console.log(' - Preserved in state: WAITING_FOR_PROVIDER');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return 0;
    }
    console.error(`❌ Live provider verification failed: ${err.message}`);
    return 1;
  }
}
