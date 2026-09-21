import { describe, it, expect } from 'vitest';
import { ProviderRegistry, MockProvider, ProviderError } from '../src/index.js';

describe('Provider Abstraction & Registry', () => {
  it('registers and retrieves providers', () => {
    const registry = new ProviderRegistry();
    const mock = new MockProvider({ id: 'gemini-mock', capabilities: ['llm'] });

    registry.register(mock);
    expect(registry.has('gemini-mock')).toBe(true);
    expect(registry.get('gemini-mock')).toBe(mock);
    expect(registry.list()).toHaveLength(1);
  });

  it('filters providers by capability and selects best based on cost & local preference', () => {
    const registry = new ProviderRegistry();

    const localAnim = new MockProvider({
      id: 'hyperframes-local',
      capabilities: ['deterministic_anim'],
      cost: 0.0,
      latencyMs: 50,
    });
    const cloudVideo = new MockProvider({
      id: 'veo-cloud',
      capabilities: ['video_gen'],
      cost: 0.35,
      latencyMs: 8000,
    });
    const cheapVideo = new MockProvider({
      id: 'seedance-fast',
      capabilities: ['video_gen'],
      cost: 0.10,
      latencyMs: 3000,
    });

    registry.register(localAnim);
    registry.register(cloudVideo);
    registry.register(cheapVideo);

    const animProvider = registry.selectBest('deterministic_anim');
    expect(animProvider.metadata.id).toBe('hyperframes-local');

    // Should choose the cheaper video provider ($0.10 vs $0.35)
    const videoProvider = registry.selectBest('video_gen');
    expect(videoProvider.metadata.id).toBe('seedance-fast');
  });

  it('enforces budget limits during provider selection', () => {
    const registry = new ProviderRegistry();
    registry.register(
      new MockProvider({
        id: 'expensive-video',
        capabilities: ['video_gen'],
        cost: 1.50,
      })
    );

    expect(() => registry.selectBest('video_gen', { maxCostUsd: 0.50 })).toThrow(ProviderError);
  });

  it('executes task deterministically using MockProvider', async () => {
    const mock = new MockProvider({ id: 'test-exec' });
    mock.setHandler('analyze_script', (input: { text: string }) => ({
      scenesDetected: 3,
      characters: ['Minh'],
    }));

    const result = await mock.execute({
      taskType: 'analyze_script',
      input: { text: 'Scene 1: Minh walks...' },
    });

    expect(result.output).toEqual({
      scenesDetected: 3,
      characters: ['Minh'],
    });
    expect(result.providerId).toBe('test-exec');
  });
});
