import { createHash } from 'node:crypto';
import type { LlmCallOptions, LlmCallResult } from './provider.js';

export interface LlmCache {
  get(key: string): LlmCallResult | undefined;
  set(key: string, value: LlmCallResult): void;
  size(): number;
  clear(): void;
}

export function cacheKey(providerName: string, opts: LlmCallOptions): string {
  const payload = JSON.stringify({
    provider: providerName,
    model: opts.model ?? null,
    messages: opts.messages,
    maxTokens: opts.maxTokens ?? null,
    temperature: opts.temperature ?? null,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function makeLruCache(maxEntries = 256): LlmCache {
  const map = new Map<string, LlmCallResult>();
  return {
    get(key) {
      const v = map.get(key);
      if (!v) return undefined;
      // refresh LRU
      map.delete(key);
      map.set(key, v);
      return v;
    },
    set(key, value) {
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      if (map.size > maxEntries) {
        const first = map.keys().next().value;
        if (first !== undefined) map.delete(first);
      }
    },
    size() {
      return map.size;
    },
    clear() {
      map.clear();
    },
  };
}
