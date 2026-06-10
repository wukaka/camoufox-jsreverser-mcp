import { describe, it, expect, vi } from 'vitest';
import { set_user_agent } from '../../../../src/tools/stealth/set_user_agent.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('set_user_agent', () => {
  it('calls BiDi emulation.setUserAgentOverride with active context', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const session = { isReady: () => true, bidi, activeContextId: 'c1', caps: {} } as any;
    const r = await executeTool(set_user_agent, { userAgent: 'TestAgent/1.0' }, session);
    expect(r.ok).toBe(true);
    expect(bidi.send).toHaveBeenCalledWith('emulation.setUserAgentOverride', {
      contexts: ['c1'],
      userAgent: 'TestAgent/1.0',
    });
  });

  it('uses explicit contextId when provided', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const session = { isReady: () => true, bidi, activeContextId: null, caps: {} } as any;
    const r = await executeTool(set_user_agent, { userAgent: 'Bot/2.0', contextId: 'ctx-x' }, session);
    expect(r.ok).toBe(true);
    expect(bidi.send).toHaveBeenCalledWith('emulation.setUserAgentOverride', {
      contexts: ['ctx-x'],
      userAgent: 'Bot/2.0',
    });
  });

  it('target_not_found without context', async () => {
    const session = { isReady: () => true, bidi: { send: vi.fn() }, activeContextId: null, caps: {} } as any;
    const r = await executeTool(set_user_agent, { userAgent: 'X' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target_not_found');
  });
});
