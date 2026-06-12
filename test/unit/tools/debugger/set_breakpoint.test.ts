import { describe, it, expect, vi } from 'vitest';
import { set_breakpoint } from '../../../../src/tools/debugger/set_breakpoint.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('set_breakpoint', () => {
  it('delegates to pauseController.setBreakpointByLocation', async () => {
    const pc = { setBreakpointByLocation: vi.fn().mockResolvedValue({
      bpId: 'bp-1', bpActor: 'a1', sourceActor: 's1', sourceUrl: 'https://a', line: 10,
    }) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(set_breakpoint, { sourceUrl: 'https://a', line: 10 }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.breakpoint.bpId).toBe('bp-1');
    expect(pc.setBreakpointByLocation).toHaveBeenCalledWith('https://a', 10, undefined, { columnTolerance: undefined });
  });

  it('passes column when provided', async () => {
    const pc = { setBreakpointByLocation: vi.fn().mockResolvedValue({
      bpId: 'bp-2', bpActor: 'a2', sourceActor: 's2', sourceUrl: 'https://b', line: 5, column: 3,
    }) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(set_breakpoint, { sourceUrl: 'https://b', line: 5, column: 3 }, session);
    expect(r.ok).toBe(true);
    expect(pc.setBreakpointByLocation).toHaveBeenCalledWith('https://b', 5, 3, { columnTolerance: undefined });
  });

  it('rejects bad args (line = 0)', async () => {
    const session = { isReady: () => true, caps: { pauseController: {} } } as any;
    const r = await executeTool(set_breakpoint, { sourceUrl: 'https://a', line: 0 }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });
});
