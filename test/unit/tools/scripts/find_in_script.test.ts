import { describe, it, expect } from 'vitest';
import { find_in_script } from '../../../../src/tools/scripts/find_in_script.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ScriptCache } from '../../../../src/session/caches.js';

describe('find_in_script', () => {
  it('returns matches with line numbers', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://a/x.js', hash: 'h', source: 'line1\nfoo bar\nline3\nfoo again' });
    const session = { isReady: () => true, scripts } as any;
    const r = await executeTool(find_in_script, { url: 'https://a/x.js', pattern: 'foo' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.matches).toHaveLength(2);
      expect(r.data.matches[0]).toMatchObject({ line: 2 });
    }
  });

  it('returns script_not_collected_yet when URL not in cache', async () => {
    const session = { isReady: () => true, scripts: new ScriptCache() } as any;
    const r = await executeTool(find_in_script, { url: 'https://missing/x.js', pattern: 'x' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('script_not_collected_yet');
  });

  it('regex flag enables regex search', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://a.js', hash: 'h', source: 'foo123\nbar' });
    const session = { isReady: () => true, scripts } as any;
    const r = await executeTool(find_in_script, { url: 'https://a.js', pattern: 'foo\\d+', regex: true }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.matches).toHaveLength(1);
  });
});
