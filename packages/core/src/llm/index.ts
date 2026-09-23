export * from './llm-provider.js';
export * from './model-policy.js';
export * from './llm-cache.js';
export * from './schema-converter.js';
export * from './gemini-provider.js';
export * from './mock-llm-provider.js';
export * from './prompts/index.js';
export * from './live-authorization.js';

import { LLMProviderRegistry } from './llm-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { defaultProviderRegistry } from '../providers/index.js';

// Auto-register Gemini provider in registries
const defaultGemini = new GeminiProvider();
LLMProviderRegistry.getInstance().registerProvider(defaultGemini, true);
if (!defaultProviderRegistry.has(defaultGemini.metadata.id)) {
  defaultProviderRegistry.register(defaultGemini);
}
