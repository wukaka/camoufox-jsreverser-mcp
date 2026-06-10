import { describe, it, expect, vi } from 'vitest';
import { create_hook } from '../../../../src/tools/hooks/create_hook.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('create_hook', () => {
  it('calls hookRegistry.create and returns hookId + preview', async () => {
    const reg = { create: vi.fn().mockReturnValue({ hookId: 'hook-x', scriptPreview: 'window.x' }) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(create_hook, {
      name: 'fetch-hook', targetExpr: 'window.fetch', capture: ['args', 'return'],
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.hookId).toBe('hook-x');
      expect(r.data.scriptPreview).toBe('window.x');
    }
    expect(reg.create).toHaveBeenCalledWith({
      name: 'fetch-hook', targetExpr: 'window.fetch', capture: ['args', 'return'],
    });
  });
});
