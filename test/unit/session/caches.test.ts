import { describe, it, expect, vi } from 'vitest';
import { ScriptCache } from '../../../src/session/caches.js';

describe('ScriptCache.possibleBreakpoints', () => {
  it('getOrComputePositions caches per (id, line) and re-uses on hit', async () => {
    const cache = new ScriptCache();
    cache.put({ id: 'script-a', url: '/x.js', source: 'var x=1;\nvar y=2;', hash: 'h1' });
    const fetcher = vi.fn().mockResolvedValue([{ line: 1, column: 4 }]);

    const first = await cache.getOrComputePositions('script-a', 1, fetcher);
    const second = await cache.getOrComputePositions('script-a', 1, fetcher);

    expect(first).toEqual([{ line: 1, column: 4 }]);
    expect(second).toEqual([{ line: 1, column: 4 }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('put() with a new hash drops the cached positions', async () => {
    const cache = new ScriptCache();
    cache.put({ id: 'script-a', url: '/x.js', source: 'a', hash: 'h1' });
    const fetcher = vi.fn().mockResolvedValue([{ line: 1, column: 4 }]);
    await cache.getOrComputePositions('script-a', 1, fetcher);

    cache.put({ id: 'script-a', url: '/x.js', source: 'b', hash: 'h2' });
    const fetcher2 = vi.fn().mockResolvedValue([{ line: 1, column: 9 }]);
    const positions = await cache.getOrComputePositions('script-a', 1, fetcher2);

    expect(positions).toEqual([{ line: 1, column: 9 }]);
    expect(fetcher2).toHaveBeenCalledTimes(1);
  });

  it('getOrComputePositions returns [] without caching when fetcher returns []', async () => {
    const cache = new ScriptCache();
    cache.put({ id: 'script-a', url: '/x.js', source: 'a', hash: 'h1' });
    const fetcher = vi.fn().mockResolvedValue([]);

    const first = await cache.getOrComputePositions('script-a', 1, fetcher);
    const second = await cache.getOrComputePositions('script-a', 1, fetcher);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
