import { describe, it, expect, vi } from 'vitest';
import { get_hook_data } from '../../../../src/tools/hooks/get_hook_data.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('get_hook_data', () => {
  it('returns samples from hookRegistry.read', async () => {
    const reg = { read: vi.fn().mockReturnValue([{ hookId: 'h1', ts: 1, args: ['a'] }, { hookId: 'h1', ts: 2, args: ['b'] }]) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(get_hook_data, { hookId: 'h1' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.samples).toHaveLength(2);
    expect(reg.read).toHaveBeenCalledWith('h1', { limit: undefined, since: undefined });
  });

  it('forwards limit + since', async () => {
    const reg = { read: vi.fn().mockReturnValue([]) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    await executeTool(get_hook_data, { hookId: 'h1', limit: 10, since: 100 }, session);
    expect(reg.read).toHaveBeenCalledWith('h1', { limit: 10, since: 100 });
  });
});
