import { describe, it, expect, vi } from 'vitest';
import { wait_for_element } from '../../../../src/tools/dom/wait_for_element.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('wait_for_element', () => {
  it('calls domAccess.waitFor and returns node', async () => {
    const da = { waitFor: vi.fn().mockResolvedValue({ sharedId: 'found-1' }) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    const r = await executeTool(wait_for_element, { selector: '.loaded' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.node as any).sharedId).toBe('found-1');
    expect(da.waitFor).toHaveBeenCalledWith('c1', '.loaded', { timeoutMs: undefined, state: undefined });
  });

  it('passes timeoutMs and state', async () => {
    const da = { waitFor: vi.fn().mockResolvedValue({ sharedId: 'n1' }) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    await executeTool(wait_for_element, { selector: '#app', timeoutMs: 3000, state: 'visible' }, session);
    expect(da.waitFor).toHaveBeenCalledWith('c1', '#app', { timeoutMs: 3000, state: 'visible' });
  });

  it('target_not_found without active context', async () => {
    const session = { isReady: () => true, caps: { domAccess: { waitFor: vi.fn() } }, activeContextId: null } as any;
    const r = await executeTool(wait_for_element, { selector: 'div' }, session);
    expect(r.ok).toBe(false);
  });
});
