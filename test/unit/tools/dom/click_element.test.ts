import { describe, it, expect, vi } from 'vitest';
import { click_element } from '../../../../src/tools/dom/click_element.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('click_element', () => {
  it('calls domAccess.click and returns sharedId', async () => {
    const da = { click: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    const r = await executeTool(click_element, { sharedId: 'node-1' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.sharedId).toBe('node-1');
    expect(da.click).toHaveBeenCalledWith('c1', 'node-1');
  });

  it('target_not_found without active context', async () => {
    const session = { isReady: () => true, caps: { domAccess: { click: vi.fn() } }, activeContextId: null } as any;
    const r = await executeTool(click_element, { sharedId: 'node-1' }, session);
    expect(r.ok).toBe(false);
  });
});
