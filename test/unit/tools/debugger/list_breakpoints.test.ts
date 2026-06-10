import { describe, it, expect, vi } from 'vitest';
import { list_breakpoints } from '../../../../src/tools/debugger/list_breakpoints.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_breakpoints', () => {
  it('returns breakpoints from pauseController.listBreakpoints', async () => {
    const bps = [
      { bpId: 'bp-1', bpActor: 'a1', sourceActor: 's1', sourceUrl: 'https://a', line: 10 },
      { bpId: 'bp-2', bpActor: 'a2', sourceActor: 's2', sourceUrl: 'https://b', line: 20 },
    ];
    const pc = { listBreakpoints: vi.fn().mockReturnValue(bps) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(list_breakpoints, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.breakpoints).toHaveLength(2);
      expect(r.data.breakpoints[0].bpId).toBe('bp-1');
    }
  });

  it('returns empty array when no breakpoints', async () => {
    const pc = { listBreakpoints: vi.fn().mockReturnValue([]) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(list_breakpoints, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.breakpoints).toEqual([]);
  });
});
