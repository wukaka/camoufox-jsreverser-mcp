import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeLlmProvider } from '../../../src/capabilities/llmProvider.js';
import { makeLruCache } from '../../../src/llm/cache.js';
import { LlmNotConfiguredError, LlmFailedError } from '../../../src/capabilities/errors.js';

describe('capability: llmProvider', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis as any, 'fetch'); });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('isConfigured=false when env empty', () => {
    const p = makeLlmProvider({ env: {} });
    expect(p.isConfigured()).toBe(false);
    expect(p.providerName()).toBeNull();
  });

  it('isConfigured=false when LLM_PROVIDER set but no LLM_API_KEY', () => {
    const p = makeLlmProvider({ env: { LLM_PROVIDER: 'openai' } });
    expect(p.isConfigured()).toBe(false);
  });

  it('isConfigured=false for unknown provider', () => {
    const p = makeLlmProvider({ env: { LLM_PROVIDER: 'bogus', LLM_API_KEY: 'k' } });
    expect(p.isConfigured()).toBe(false);
  });

  it('openai-compatible requires LLM_BASE_URL', () => {
    const p = makeLlmProvider({ env: { LLM_PROVIDER: 'openai-compatible', LLM_API_KEY: 'k' } });
    expect(p.isConfigured()).toBe(false);
  });

  it('call throws LlmNotConfigured when not configured', async () => {
    const p = makeLlmProvider({ env: {} });
    await expect(p.call({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });

  it('happy path: call returns text and caches result', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] }),
    } as any);
    const cache = makeLruCache();
    const p = makeLlmProvider({
      env: { LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' },
      cache,
    });
    expect(p.isConfigured()).toBe(true);
    expect(p.providerName()).toBe('openai');

    const r1 = await p.call({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r1.text).toBe('hi');
    expect(r1.cached).toBe(false);

    const r2 = await p.call({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r2.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries 2 times on failure, then throws LlmFailed', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    const p = makeLlmProvider({
      env: { LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' },
      sleep: async () => {},
    });
    await expect(p.call({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(LlmFailedError);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('succeeds on second attempt after one failure', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('flake'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
      } as any);
    const p = makeLlmProvider({
      env: { LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' },
      sleep: async () => {},
    });
    const r = await p.call({ messages: [{ role: 'user', content: 'ping' }] });
    expect(r.text).toBe('pong');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('switches provider based on LLM_PROVIDER env', () => {
    const a = makeLlmProvider({ env: { LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'k' } });
    expect(a.providerName()).toBe('anthropic');
    const o = makeLlmProvider({ env: { LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' } });
    expect(o.providerName()).toBe('openai');
    const c = makeLlmProvider({ env: { LLM_PROVIDER: 'openai-compatible', LLM_API_KEY: 'k', LLM_BASE_URL: 'http://x' } });
    expect(c.providerName()).toBe('openai-compatible');
  });

  it('aborts on timeout', async () => {
    fetchSpy.mockImplementation(async (_url: string, init: any) => {
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const p = makeLlmProvider({
      env: { LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' },
      sleep: async () => {},
    });
    await expect(p.call({ messages: [{ role: 'user', content: 'x' }], timeoutMs: 5 }))
      .rejects.toBeInstanceOf(LlmFailedError);
  });
});
