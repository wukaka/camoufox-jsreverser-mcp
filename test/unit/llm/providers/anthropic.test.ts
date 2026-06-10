import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeAnthropicProvider } from '../../../../src/llm/providers/anthropic.js';

describe('anthropic provider', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis as any, 'fetch'); });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('POSTs to /messages with x-api-key header, separates system msg', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'hi back' }],
        usage: { input_tokens: 4, output_tokens: 3 },
      }),
    } as any);

    const p = makeAnthropicProvider({ provider: 'anthropic', apiKey: 'k', defaultModel: 'claude-test' });
    const res = await p.call({
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
    });

    expect(res.text).toBe('hi back');
    expect(res.usage?.promptTokens).toBe(4);
    expect(res.usage?.completionTokens).toBe(3);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init as any).headers['x-api-key']).toBe('k');
    expect((init as any).headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse((init as any).body);
    expect(body.system).toBe('be brief');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('throws on non-ok', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauth' } as any);
    const p = makeAnthropicProvider({ provider: 'anthropic', apiKey: 'k' });
    await expect(p.call({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/anthropic http 401/);
  });
});
