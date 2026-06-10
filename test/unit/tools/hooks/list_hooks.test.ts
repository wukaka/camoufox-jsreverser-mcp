import { describe, it, expect, vi } from 'vitest';
import { list_hooks } from '../../../../src/tools/hooks/list_hooks.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_hooks', () => {
  it('returns hookRegistry.list output', async () => {
    const reg = { list: vi.fn().mockReturnValue([
      { hookId: 'h1', name: 'fetch', targetExpr: 'window.fetch', sampleCount: 5, injected: true },
    ]) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(list_hooks, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.hooks).toHaveLength(1);
  });
});
