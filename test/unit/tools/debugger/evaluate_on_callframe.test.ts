import { describe, it, expect, vi } from 'vitest';
import { evaluate_on_callframe } from '../../../../src/tools/debugger/evaluate_on_callframe.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('evaluate_on_callframe', () => {
  it('delegates to pauseController.evaluateOnCallframe and returns result', async () => {
    const cfResult = { value: 42, exceptionDetails: undefined };
    const pc = { evaluateOnCallframe: vi.fn().mockResolvedValue(cfResult) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(evaluate_on_callframe, { expression: '1 + 41' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.value).toBe(42);
    expect(pc.evaluateOnCallframe).toHaveBeenCalledWith('1 + 41');
  });

  it('propagates NotPausedError through translateError when not paused', async () => {
    const err = new Error('NotPausedError: thread is not paused');
    err.name = 'NotPausedError';
    const pc = { evaluateOnCallframe: vi.fn().mockRejectedValue(err) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(evaluate_on_callframe, { expression: 'x' }, session);
    // translateError handles this — result is not ok
    expect(r.ok).toBe(false);
  });

  it('rejects missing expression', async () => {
    const session = { isReady: () => true, caps: { pauseController: {} } } as any;
    const r = await executeTool(evaluate_on_callframe, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });
});
