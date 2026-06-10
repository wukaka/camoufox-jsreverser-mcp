import { describe, it, expect, vi } from 'vitest';
import { inject_hook } from '../../../../src/tools/hooks/inject_hook.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('inject_hook', () => {
  it('injects into page by default', async () => {
    const reg = { inject: vi.fn().mockResolvedValue({ hookId: 'h1', warnings: [] }) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(inject_hook, { hookId: 'h1' }, session);
    expect(r.ok).toBe(true);
    expect(reg.inject).toHaveBeenCalledWith('h1', { target: 'page' });
  });

  it('passes through explicit worker target', async () => {
    const reg = { inject: vi.fn().mockResolvedValue({ hookId: 'h1', warnings: ['worker_injection_delayed'] }) };
    const session = { isReady: () => true, caps: { hookRegistry: reg } } as any;
    const r = await executeTool(inject_hook, { hookId: 'h1', target: 'worker:wkr-1' }, session);
    expect(reg.inject).toHaveBeenCalledWith('h1', { target: 'worker:wkr-1' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.warnings).toContain('worker_injection_delayed');
  });
});
