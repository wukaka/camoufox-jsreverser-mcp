import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeOpenAiCompatibleProvider } from '../../../../src/llm/providers/openai-compatible.js';

describe('openai-compatible provider', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis as any, 'fetch'); });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('requires baseUrl', () => {
    expect(() => makeOpenAiCompatibleProvider({ provider: 'openai-compatible', apiKey: 'k' }))
      .toThrow(/requires baseUrl/);
  });

  it('trims trailing slash and POSTs to /chat/completions', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    } as any);

    const p = makeOpenAiCompatibleProvider({
      provider: 'openai-compatible',
      apiKey: 'k',
      baseUrl: 'http://localhost:8000/v1/',
      defaultModel: 'local',
    });
    const res = await p.call({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.text).toBe('ok');
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:8000/v1/chat/completions');
  });
});
