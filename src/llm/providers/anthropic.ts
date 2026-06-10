import type { LlmProviderImpl, LlmCallOptions, LlmCallResult, LlmProviderConfig, LlmMessage } from '../provider.js';

export function makeAnthropicProvider(cfg: LlmProviderConfig): LlmProviderImpl {
  const baseUrl = cfg.baseUrl ?? 'https://api.anthropic.com/v1';
  const defaultModel = cfg.defaultModel ?? 'claude-sonnet-4-6';

  return {
    name: 'anthropic',
    async call(opts: LlmCallOptions): Promise<LlmCallResult> {
      const model = opts.model ?? defaultModel;
      // Anthropic separates system message from chat messages
      const systemMsgs = opts.messages.filter(m => m.role === 'system');
      const chatMsgs = opts.messages.filter((m): m is LlmMessage & { role: 'user' | 'assistant' } => m.role !== 'system');
      const system = systemMsgs.map(m => m.content).join('\n\n');
      const body = {
        model,
        system: system || undefined,
        messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature,
      };
      const res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`anthropic http ${res.status}: ${text}`);
      }
      const json: any = await res.json();
      const text = Array.isArray(json?.content)
        ? json.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
        : '';
      return {
        text,
        model,
        usage: {
          promptTokens: json?.usage?.input_tokens,
          completionTokens: json?.usage?.output_tokens,
        },
      };
    },
  };
}
