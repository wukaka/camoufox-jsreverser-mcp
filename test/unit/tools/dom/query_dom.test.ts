import { describe, it, expect, vi } from 'vitest';
import { query_dom } from '../../../../src/tools/dom/query_dom.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('query_dom', () => {
  it('returns NodeRef array', async () => {
    const da = { query: vi.fn().mockResolvedValue([{ sharedId: 'n1' }, { sharedId: 'n2' }]) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    const r = await executeTool(query_dom, { selector: '.btn' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.nodes).toHaveLength(2);
    expect(da.query).toHaveBeenCalledWith('c1', '.btn');
  });

  it('target_not_found without active context', async () => {
    const session = { isReady: () => true, caps: { domAccess: { query: vi.fn() } }, activeContextId: null } as any;
    const r = await executeTool(query_dom, { selector: 'a' }, session);
    expect(r.ok).toBe(false);
  });

  it('uses explicit contextId when provided', async () => {
    const da = { query: vi.fn().mockResolvedValue([{ sharedId: 'n1' }]) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    const r = await executeTool(query_dom, { selector: 'div', contextId: 'c2' }, session);
    expect(r.ok).toBe(true);
    expect(da.query).toHaveBeenCalledWith('c2', 'div');
  });
});
