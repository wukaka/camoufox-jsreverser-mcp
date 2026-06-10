import type { LlmProviderImpl, LlmCallOptions, LlmCallResult, LlmProviderConfig } from '../provider.js';

export function makeOpenAiProvider(cfg: LlmProviderConfig): LlmProviderImpl {
  const baseUrl = cfg.baseUrl ?? 'https://api.openai.com/v1';
  const defaultModel = cfg.defaultModel ?? 'gpt-4o-mini';

  return {
    name: 'openai',
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
        throw new Error(`openai http ${res.status}: ${text}`);
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
