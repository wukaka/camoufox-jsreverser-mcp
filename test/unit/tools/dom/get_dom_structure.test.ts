import { describe, it, expect, vi } from 'vitest';
import { get_dom_structure } from '../../../../src/tools/dom/get_dom_structure.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('get_dom_structure', () => {
  it('returns walk() result from evaluate', async () => {
    const sh = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: { tag: 'html', id: undefined, classes: [], childCount: 1, children: [{ tag: 'body', classes: [], childCount: 0, children: [] }] } } }),
      listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]),
    };
    const session = { isReady: () => true, caps: { scriptHost: sh }, activeContextId: 'c1' } as any;
    const r = await executeTool(get_dom_structure, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.root as any).tag).toBe('html');
  });

  it('target_not_found without active context', async () => {
    const session = { isReady: () => true, caps: { scriptHost: { listRealms: vi.fn(), evaluate: vi.fn() } }, activeContextId: null } as any;
    const r = await executeTool(get_dom_structure, {}, session);
    expect(r.ok).toBe(false);
  });

  it('target_not_found when no window realm', async () => {
    const sh = {
      evaluate: vi.fn(),
      listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'worker' }]),
    };
    const session = { isReady: () => true, caps: { scriptHost: sh }, activeContextId: 'c1' } as any;
    const r = await executeTool(get_dom_structure, {}, session);
    expect(r.ok).toBe(false);
  });
});
