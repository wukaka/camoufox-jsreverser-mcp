import type { LlmProviderImpl, LlmCallOptions, LlmCallResult, LlmProviderConfig } from '../provider.js';

export function makeOpenAiCompatibleProvider(cfg: LlmProviderConfig): LlmProviderImpl {
  if (!cfg.baseUrl) {
    throw new Error('openai-compatible provider requires baseUrl');
  }
  const baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  const defaultModel = cfg.defaultModel ?? 'default';

  return {
    name: 'openai-compatible',
    async call(opts: LlmCallOptions): Promise<LlmCallResult> {
      const model = opts.model ?? defaultModel;
      const body = {
        model,
        messages: opts.messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      };
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`openai-compatible http ${res.status}: ${text}`);
      }
      const json: any = await res.json();
      const text = json?.choices?.[0]?.message?.content ?? '';
      return {
        text,
        model,
        usage: {
          promptTokens: json?.usage?.prompt_tokens,
          completionTokens: json?.usage?.completion_tokens,
        },
      };
    },
  };
}
