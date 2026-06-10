import { describe, it, expect } from 'vitest';
import { search_in_scripts } from '../../../../src/tools/scripts/search_in_scripts.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ScriptCache } from '../../../../src/session/caches.js';

describe('search_in_scripts', () => {
  it('searches all cached scripts and aggregates hits', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://a/x.js', hash: 'h', source: 'foo bar' });
    scripts.put({ id: 's2', url: 'https://a/y.js', hash: 'h', source: 'baz\nfoo qux' });
    const session = { isReady: () => true, scripts } as any;
    const r = await executeTool(search_in_scripts, { pattern: 'foo' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.totalHits).toBe(2);
      expect(r.data.hits).toHaveLength(2);
    }
  });

  it('empty cache returns no hits', async () => {
    const session = { isReady: () => true, scripts: new ScriptCache() } as any;
    const r = await executeTool(search_in_scripts, { pattern: 'x' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.totalHits).toBe(0);
  });
});
