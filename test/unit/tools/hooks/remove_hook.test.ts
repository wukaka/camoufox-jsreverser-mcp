import { describe, it, expect, vi } from 'vitest';
import { remove_hook } from '../../../../src/tools/hooks/remove_hook.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('remove_hook', () => {
  it('calls hookRegistry.remove', async () => {
    const reg = { remove: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(remove_hook, { hookId: 'h1' }, session);
    expect(r.ok).toBe(true);
    expect(reg.remove).toHaveBeenCalledWith('h1');
  });
});
