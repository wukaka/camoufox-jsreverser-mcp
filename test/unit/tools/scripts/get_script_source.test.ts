import { describe, it, expect, vi } from 'vitest';
import { get_script_source } from '../../../../src/tools/scripts/get_script_source.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ScriptCache } from '../../../../src/session/caches.js';

describe('get_script_source', () => {
  it('fetches via callFunction and stores in ScriptCache', async () => {
    const sh = {
      callFunction: vi.fn().mockResolvedValue({ result: { value: 'function foo(){return 1}' } }),
      listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]),
    };
    const scripts = new ScriptCache();
    const session = { isReady: () => true, caps: { scriptHost: sh }, scripts, activeContextId: 'c1' } as any;
    const r = await executeTool(get_script_source, { url: 'https://a/x.js' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.source).toContain('function foo');
    expect(scripts.list()).toHaveLength(1);
    expect(scripts.list()[0]?.url).toBe('https://a/x.js');
  });

  it('returns cached source if present', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 'cached', url: 'https://a/cached.js', source: 'cached source', hash: 'h' });
    const sh = { callFunction: vi.fn(), listRealms: vi.fn() };
    const session = { isReady: () => true, caps: { scriptHost: sh }, scripts, activeContextId: 'c1' } as any;
    const r = await executeTool(get_script_source, { url: 'https://a/cached.js' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.source).toBe('cached source');
    expect(sh.callFunction).not.toHaveBeenCalled();
  });

  it('surfaces fetch exception', async () => {
    const sh = {
      callFunction: vi.fn().mockResolvedValue({ result: undefined, exceptionDetails: { text: 'CORS blocked' } }),
      listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]),
    };
    const session = { isReady: () => true, caps: { scriptHost: sh }, scripts: new ScriptCache(), activeContextId: 'c1' } as any;
    const r = await executeTool(get_script_source, { url: 'https://other/x.js' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('script_not_collected_yet');
  });
});
