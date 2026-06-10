import { describe, it, expect, vi } from 'vitest';
import { break_on_xhr } from '../../../../src/tools/network/break_on_xhr.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('break_on_xhr', () => {
  it('registers pattern and injects preload', async () => {
    const preload = { add: vi.fn().mockResolvedValue('preload-bx1') };
    const session = {
      isReady: () => true,
      caps: { preloadInjector: preload },
      xhrBreakpoints: [],
      emitName: '__mcp_emit_xyz',
    } as any;
    const r = await executeTool(break_on_xhr, { urlPattern: '/api/secret' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toMatch(/^xhrbp-/);
    expect(session.xhrBreakpoints).toHaveLength(1);
    expect(session.xhrBreakpoints[0]?.preloadId).toBe('preload-bx1');
    expect(preload.add).toHaveBeenCalled();
    const injectedScript = preload.add.mock.calls[0][0] as string;
    expect(injectedScript).toContain('/api/secret');
    expect(injectedScript).toContain('debugger');
  });
});
