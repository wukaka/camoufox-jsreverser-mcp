import { describe, it, expect } from 'vitest';
import { search_in_sources } from '../../../../src/tools/scripts/search_in_sources.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ScriptCache } from '../../../../src/session/caches.js';

describe('search_in_sources', () => {
  it('finds hits across cached scripts (alias of search_in_scripts in v1)', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://a/x.js', hash: 'h', source: 'token = "abc"' });
    const session = { isReady: () => true, scripts } as any;
    const r = await executeTool(search_in_sources, { pattern: 'token' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.totalHits).toBe(1);
  });
});
