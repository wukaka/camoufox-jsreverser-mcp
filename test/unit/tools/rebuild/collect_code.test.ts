import { describe, it, expect } from 'vitest';
import { collect_code } from '../../../../src/tools/rebuild/collect_code.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { ScriptCache } from '../../../../src/session/caches.js';

function makeShMock(scripts: string[], fetchMap: Record<string, string>) {
  return {
    listRealms: async () => [{ realmId: 'r1', origin: 'https://x', type: 'window' as const }],
    evaluate: async () => ({ result: { value: scripts } }),
    callFunction: async (_r: string, _fn: string, args: any[]) => {
      const url = args[0].value;
      if (url in fetchMap) return { result: { value: fetchMap[url] } };
      return { exceptionDetails: { text: '404' } };
    },
  };
}

describe('collect_code', () => {
  it('fetches all listed scripts and caches them', async () => {
    const sh = makeShMock(
      ['https://a/x.js', 'https://a/y.js'],
      { 'https://a/x.js': 'console.log("x")', 'https://a/y.js': 'console.log("y")' },
    );
    const session = {
      isReady: () => true,
      caps: { scriptHost: sh },
      activeContextId: 'c1',
      scripts: new ScriptCache(),
    } as any;
    const r = await executeTool(collect_code, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.collected).toHaveLength(2);
      expect(r.data.skipped).toEqual([]);
    }
    expect(session.scripts.list()).toHaveLength(2);
  });

  it('uses fromCache=true when script already cached', async () => {
    const cache = new ScriptCache();
    cache.put({ id: 's1', url: 'https://a/x.js', source: 'cached', hash: 'h1' });
    const sh = makeShMock(['https://a/x.js'], { 'https://a/x.js': 'fresh' });
    const session = {
      isReady: () => true,
      caps: { scriptHost: sh },
      activeContextId: 'c1',
      scripts: cache,
    } as any;
    const r = await executeTool(collect_code, { urls: ['https://a/x.js'] }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.collected[0]?.fromCache).toBe(true);
      expect(r.data.collected[0]?.hash).toBe('h1');
    }
  });

  it('records skipped on fetch error', async () => {
    const sh = makeShMock(['https://gone'], {});
    const session = {
      isReady: () => true,
      caps: { scriptHost: sh },
      activeContextId: 'c1',
      scripts: new ScriptCache(),
    } as any;
    const r = await executeTool(collect_code, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.skipped).toHaveLength(1);
      expect(r.data.skipped[0]?.url).toBe('https://gone');
    }
  });

  it('filters by urlSubstring', async () => {
    const sh = makeShMock(
      ['https://a/x.js', 'https://b/y.js'],
      { 'https://a/x.js': 'x', 'https://b/y.js': 'y' },
    );
    const session = {
      isReady: () => true,
      caps: { scriptHost: sh },
      activeContextId: 'c1',
      scripts: new ScriptCache(),
    } as any;
    const r = await executeTool(collect_code, { urlSubstring: 'a/' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.collected).toHaveLength(1);
      expect(r.data.collected[0]?.url).toBe('https://a/x.js');
    }
  });

  it('returns TargetNotFound when no active page', async () => {
    const sh = makeShMock([], {});
    const session = {
      isReady: () => true,
      caps: { scriptHost: sh },
      activeContextId: null,
      scripts: new ScriptCache(),
    } as any;
    const r = await executeTool(collect_code, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.TargetNotFound);
  });
});
