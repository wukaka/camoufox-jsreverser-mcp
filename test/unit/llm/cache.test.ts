import { describe, it, expect } from 'vitest';
import { cacheKey, makeLruCache } from '../../../src/llm/cache.js';

describe('llm/cache', () => {
  it('cacheKey is stable for same inputs', () => {
    const opts = { messages: [{ role: 'user' as const, content: 'hi' }], model: 'm', maxTokens: 100, temperature: 0 };
    expect(cacheKey('openai', opts)).toBe(cacheKey('openai', opts));
  });

  it('cacheKey differs across providers / models / messages', () => {
    const base = { messages: [{ role: 'user' as const, content: 'hi' }] };
    expect(cacheKey('openai', base)).not.toBe(cacheKey('anthropic', base));
    expect(cacheKey('openai', { ...base, model: 'a' })).not.toBe(cacheKey('openai', { ...base, model: 'b' }));
    expect(cacheKey('openai', base)).not.toBe(cacheKey('openai', { messages: [{ role: 'user', content: 'bye' }] }));
  });

  it('LRU evicts oldest beyond maxEntries', () => {
    const c = makeLruCache(2);
    c.set('a', { text: 'A', model: 'm' });
    c.set('b', { text: 'B', model: 'm' });
    c.set('c', { text: 'C', model: 'm' });
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')?.text).toBe('B');
    expect(c.get('c')?.text).toBe('C');
    expect(c.size()).toBe(2);
  });

  it('get refreshes recency', () => {
    const c = makeLruCache(2);
    c.set('a', { text: 'A', model: 'm' });
    c.set('b', { text: 'B', model: 'm' });
    c.get('a');
    c.set('c', { text: 'C', model: 'm' });
    expect(c.get('a')?.text).toBe('A');
    expect(c.get('b')).toBeUndefined();
  });

  it('clear empties the cache', () => {
    const c = makeLruCache();
    c.set('a', { text: 'A', model: 'm' });
    c.clear();
    expect(c.size()).toBe(0);
  });
});
