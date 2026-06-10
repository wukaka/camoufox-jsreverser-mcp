import { describe, it, expect, vi } from 'vitest';
import { remove_xhr_breakpoint } from '../../../../src/tools/network/remove_xhr_breakpoint.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('remove_xhr_breakpoint', () => {
  it('removes pattern by id and calls preload.remove', async () => {
    const preload = { remove: vi.fn().mockResolvedValue(undefined) };
    const session = {
      isReady: () => true,
      caps: { preloadInjector: preload },
      xhrBreakpoints: [{ id: 'xhrbp-1', urlPattern: '/x', preloadId: 'p1' }],
    } as any;
    const r = await executeTool(remove_xhr_breakpoint, { id: 'xhrbp-1' }, session);
    expect(r.ok).toBe(true);
    expect(session.xhrBreakpoints).toHaveLength(0);
    expect(preload.remove).toHaveBeenCalledWith('p1');
  });

  it('resource_not_found for unknown id', async () => {
    const session = { isReady: () => true, caps: { preloadInjector: { remove: vi.fn() } }, xhrBreakpoints: [] } as any;
    const r = await executeTool(remove_xhr_breakpoint, { id: 'nope' }, session);
    expect(r.ok).toBe(false);
  });
});
