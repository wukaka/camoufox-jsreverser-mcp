import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeOpenAiProvider } from '../../../../src/llm/providers/openai.js';

describe('openai provider', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis as any, 'fetch'); });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('POSTs to /chat/completions with Bearer auth and returns text', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    } as any);

    const p = makeOpenAiProvider({ provider: 'openai', apiKey: 'sk-x', defaultModel: 'gpt-test' });
    const res = await p.call({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.text).toBe('hello');
    expect(res.model).toBe('gpt-test');
    expect(res.usage?.promptTokens).toBe(5);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as any).headers.Authorization).toBe('Bearer sk-x');
  });

  it('throws on non-ok response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' } as any);
    const p = makeOpenAiProvider({ provider: 'openai', apiKey: 'k' });
    await expect(p.call({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/openai http 500/);
  });
});
