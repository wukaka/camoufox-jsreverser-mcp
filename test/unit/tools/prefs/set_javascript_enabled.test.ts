import { describe, it, expect, vi } from 'vitest';
import { set_javascript_enabled } from '../../../../src/tools/prefs/set_javascript_enabled.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('set_javascript_enabled', () => {
  it('calls emulation.setScriptingEnabled with active contextId by default', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const session = { isReady: () => true, bidi, activeContextId: 'ctx-1', caps: {} } as any;
    const r = await executeTool(set_javascript_enabled, { enabled: false }, session);
    expect(r.ok).toBe(true);
    expect(bidi.send).toHaveBeenCalledWith('emulation.setScriptingEnabled', {
      contexts: ['ctx-1'],
      enabled: false,
    });
  });

  it('uses explicit contextId', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const session = { isReady: () => true, bidi, activeContextId: null, caps: {} } as any;
    await executeTool(set_javascript_enabled, { enabled: true, contextId: 'ctx-other' }, session);
    expect(bidi.send).toHaveBeenCalledWith('emulation.setScriptingEnabled', {
      contexts: ['ctx-other'],
      enabled: true,
    });
  });

  it('target_not_found without active context and no contextId arg', async () => {
    const bidi = { send: vi.fn() };
    const session = { isReady: () => true, bidi, activeContextId: null, caps: {} } as any;
    const r = await executeTool(set_javascript_enabled, { enabled: true }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target_not_found');
  });
});
