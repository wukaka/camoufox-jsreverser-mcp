import type { LlmProvider, LlmCallRequest, LlmCallResponse } from './types.js';
import type { LlmProviderImpl, LlmProviderConfig } from '../llm/provider.js';
import { makeOpenAiProvider } from '../llm/providers/openai.js';
import { makeAnthropicProvider } from '../llm/providers/anthropic.js';
import { makeOpenAiCompatibleProvider } from '../llm/providers/openai-compatible.js';
import { makeLruCache, cacheKey, type LlmCache } from '../llm/cache.js';
import { LlmNotConfiguredError, LlmFailedError } from './errors.js';

export interface LlmProviderDeps {
  env?: Record<string, string | undefined>;
  cache?: LlmCache;
  /** sleep used between retries; overridable for tests */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readConfig(env: Record<string, string | undefined>): LlmProviderConfig | null {
  const providerRaw = (env.LLM_PROVIDER ?? '').trim().toLowerCase();
  if (!providerRaw) return null;
  if (providerRaw !== 'openai' && providerRaw !== 'anthropic' && providerRaw !== 'openai-compatible') {
    return null;
  }
  const apiKey = (env.LLM_API_KEY ?? '').trim();
  if (!apiKey) return null;
  if (providerRaw === 'openai-compatible' && !(env.LLM_BASE_URL ?? '').trim()) return null;
  return {
    provider: providerRaw,
    apiKey,
    baseUrl: env.LLM_BASE_URL?.trim() || undefined,
    defaultModel: env.LLM_DEFAULT_MODEL?.trim() || undefined,
  };
}

function buildImpl(cfg: LlmProviderConfig): LlmProviderImpl {
  if (cfg.provider === 'openai') return makeOpenAiProvider(cfg);
  if (cfg.provider === 'anthropic') return makeAnthropicProvider(cfg);
  return makeOpenAiCompatibleProvider(cfg);
}

export function makeLlmProvider(deps: LlmProviderDeps = {}): LlmProvider {
  const env = deps.env ?? (process.env as Record<string, string | undefined>);
  const cache = deps.cache ?? makeLruCache();
  const sleep = deps.sleep ?? defaultSleep;
  const cfg = readConfig(env);
  const impl: LlmProviderImpl | null = cfg ? buildImpl(cfg) : null;

  return {
    isConfigured(): boolean {
      return impl !== null;
    },
    providerName(): string | null {
      return impl?.name ?? null;
    },
    async call(req: LlmCallRequest): Promise<LlmCallResponse> {
      if (!impl) throw new LlmNotConfiguredError();

      const key = cacheKey(impl.name, req);
      const hit = cache.get(key);
      if (hit) {
        return { text: hit.text, model: hit.model, cached: true, usage: hit.usage };
      }

      const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const result = await impl.call({
            messages: req.messages,
            model: req.model,
            maxTokens: req.maxTokens,
            temperature: req.temperature,
            timeoutMs,
            signal: controller.signal,
          });
          clearTimeout(timer);
          cache.set(key, result);
          return { text: result.text, model: result.model, cached: false, usage: result.usage };
        } catch (err) {
          clearTimeout(timer);
          lastErr = err;
          if (attempt < MAX_RETRIES) {
            const backoff = 200 * Math.pow(2, attempt);
            await sleep(backoff);
            continue;
          }
        }
      }
      throw new LlmFailedError(lastErr);
    },
  };
}
