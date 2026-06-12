import { describe, it, expect, vi } from 'vitest';
import { set_breakpoint_on_text } from '../../../../src/tools/debugger/set_breakpoint_on_text.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('set_breakpoint_on_text', () => {
  it('delegates to pauseController.setBreakpointByText', async () => {
    const bp = { bpId: 'bp-t1', bpActor: 'a1', sourceActor: 's1', sourceUrl: 'https://a', line: 42 };
    const pc = { setBreakpointByText: vi.fn().mockResolvedValue(bp) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(set_breakpoint_on_text, { text: 'secretToken' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.breakpoint.bpId).toBe('bp-t1');
    expect(pc.setBreakpointByText).toHaveBeenCalledWith('secretToken', undefined, { columnTolerance: undefined });
  });

  it('passes optional sourceUrl', async () => {
    const bp = { bpId: 'bp-t2', bpActor: 'a2', sourceActor: 's2', sourceUrl: 'https://b', line: 7 };
    const pc = { setBreakpointByText: vi.fn().mockResolvedValue(bp) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    await executeTool(set_breakpoint_on_text, { text: 'foo', sourceUrl: 'https://b' }, session);
    expect(pc.setBreakpointByText).toHaveBeenCalledWith('foo', 'https://b', { columnTolerance: undefined });
  });

  it('rejects extra fields (strict schema)', async () => {
    const session = { isReady: () => true, caps: { pauseController: {} } } as any;
    const r = await executeTool(set_breakpoint_on_text, { text: 'x', unknown: true }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });
});
