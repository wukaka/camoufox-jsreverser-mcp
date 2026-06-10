import { describe, it, expect, vi } from 'vitest';
import { set_csp_enabled } from '../../../../src/tools/prefs/set_csp_enabled.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('set_csp_enabled', () => {
  it('inverts enabled to bypass: enabled=false → bypass=true', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const session = { isReady: () => true, bidi, activeContextId: 'ctx-1', caps: {} } as any;
    const r = await executeTool(set_csp_enabled, { enabled: false }, session);
    expect(r.ok).toBe(true);
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.setBypassCSP', {
      context: 'ctx-1',
      bypass: true,
    });
  });

  it('enabled=true → bypass=false', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const session = { isReady: () => true, bidi, activeContextId: 'ctx-1', caps: {} } as any;
    await executeTool(set_csp_enabled, { enabled: true }, session);
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.setBypassCSP', {
      context: 'ctx-1',
      bypass: false,
    });
  });

  it('uses explicit contextId', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const session = { isReady: () => true, bidi, activeContextId: null, caps: {} } as any;
    await executeTool(set_csp_enabled, { enabled: false, contextId: 'other-ctx' }, session);
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.setBypassCSP', {
      context: 'other-ctx',
      bypass: true,
    });
  });

  it('target_not_found without context', async () => {
    const session = { isReady: () => true, bidi: { send: vi.fn() }, activeContextId: null, caps: {} } as any;
    const r = await executeTool(set_csp_enabled, { enabled: true }, session);
    expect(r.ok).toBe(false);
  });
});
