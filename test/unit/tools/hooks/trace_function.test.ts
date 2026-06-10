import { describe, it, expect, vi } from 'vitest';
import { trace_function } from '../../../../src/tools/hooks/trace_function.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('trace_function', () => {
  it('creates with capture preset [args,return,stack] and injects', async () => {
    const reg = {
      create: vi.fn().mockReturnValue({ hookId: 'h1', scriptPreview: 'p' }),
      inject: vi.fn().mockResolvedValue({ hookId: 'h1', warnings: [] }),
    };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(trace_function, { name: 't', targetExpr: 'foo' }, session);
    expect(r.ok).toBe(true);
    expect(reg.create).toHaveBeenCalledWith({
      name: 't', targetExpr: 'foo', capture: ['args', 'return', 'stack'],
    });
    expect(reg.inject).toHaveBeenCalled();
  });
});
