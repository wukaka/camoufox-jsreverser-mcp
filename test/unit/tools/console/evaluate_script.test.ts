import { describe, it, expect, vi } from 'vitest';
import { evaluate_script } from '../../../../src/tools/console/evaluate_script.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('evaluate_script', () => {
  it('evaluates in window realm of active context', async () => {
    const sh = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: 42 } }),
      listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]),
    };
    const session = { isReady: () => true, caps: { scriptHost: sh }, activeContextId: 'c1' } as any;
    const r = await executeTool(evaluate_script, { expression: '6*7' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.result as any).value).toBe(42);
    expect(sh.evaluate).toHaveBeenCalledWith('r1', '6*7', { awaitPromise: false });
  });

  it('uses explicit realmId when provided', async () => {
    const sh = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: 1 } }),
      listRealms: vi.fn(),
    };
    const session = { isReady: () => true, caps: { scriptHost: sh }, activeContextId: null } as any;
    const r = await executeTool(evaluate_script, { expression: '1', realmId: 'r-explicit' }, session);
    expect(r.ok).toBe(true);
    expect(sh.evaluate).toHaveBeenCalledWith('r-explicit', '1', { awaitPromise: false });
    expect(sh.listRealms).not.toHaveBeenCalled();
  });

  it('target_not_found without active context or realmId', async () => {
    const session = { isReady: () => true, caps: { scriptHost: {} }, activeContextId: null } as any;
    const r = await executeTool(evaluate_script, { expression: '1' }, session);
    expect(r.ok).toBe(false);
  });
});
