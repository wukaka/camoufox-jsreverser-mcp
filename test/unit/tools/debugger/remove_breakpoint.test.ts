import { describe, it, expect, vi } from 'vitest';
import { remove_breakpoint } from '../../../../src/tools/debugger/remove_breakpoint.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('remove_breakpoint', () => {
  it('delegates to pauseController.removeBreakpoint and echoes bpId', async () => {
    const pc = { removeBreakpoint: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(remove_breakpoint, { bpId: 'bp-99' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.bpId).toBe('bp-99');
    expect(pc.removeBreakpoint).toHaveBeenCalledWith('bp-99');
  });

  it('rejects missing bpId', async () => {
    const session = { isReady: () => true, caps: { pauseController: {} } } as any;
    const r = await executeTool(remove_breakpoint, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });
});
