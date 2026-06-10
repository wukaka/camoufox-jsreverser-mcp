import { describe, it, expect, vi } from 'vitest';
import { unhook_function } from '../../../../src/tools/hooks/unhook_function.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('unhook_function', () => {
  it('aliases remove_hook', async () => {
    const reg = { remove: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(unhook_function, { hookId: 'h1' }, session);
    expect(r.ok).toBe(true);
    expect(reg.remove).toHaveBeenCalledWith('h1');
  });
});
