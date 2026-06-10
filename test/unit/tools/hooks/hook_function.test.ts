import { describe, it, expect, vi } from 'vitest';
import { hook_function } from '../../../../src/tools/hooks/hook_function.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('hook_function', () => {
  it('creates + injects in one call', async () => {
    const reg = {
      create: vi.fn().mockReturnValue({ hookId: 'h1', scriptPreview: 'p' }),
      inject: vi.fn().mockResolvedValue({ hookId: 'h1', warnings: [] }),
    };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(hook_function, {
      name: 'fetch', targetExpr: 'window.fetch', capture: ['args'],
    }, session);
    expect(r.ok).toBe(true);
    expect(reg.create).toHaveBeenCalled();
    expect(reg.inject).toHaveBeenCalledWith('h1', { target: 'page' });
  });
});
