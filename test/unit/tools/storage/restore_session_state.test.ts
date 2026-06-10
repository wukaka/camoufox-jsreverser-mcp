import { describe, it, expect, vi } from 'vitest';
import { restore_session_state } from '../../../../src/tools/storage/restore_session_state.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('restore_session_state', () => {
  it('writes cookies and localStorage back', async () => {
    const sa = {
      setCookie: vi.fn().mockResolvedValue({}),
      setLocalStorage: vi.fn().mockResolvedValue(undefined),
    };
    const sh = { listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]) };
    const snap = {
      name: 's', capturedAt: 1,
      cookies: [{ name: 'c', value: 'v' }],
      localByOrigin: { 'https://a': { k: 'lv' } },
      sessionByOrigin: {},
    };
    const session = {
      isReady: () => true,
      caps: { storageAccess: sa, scriptHost: sh },
      activeContextId: 'c1',
      sessionSnapshots: new Map([['s', snap]]),
    } as any;
    const r = await executeTool(restore_session_state, { name: 's' }, session);
    expect(r.ok).toBe(true);
    expect(sa.setCookie).toHaveBeenCalled();
    expect(sa.setLocalStorage).toHaveBeenCalledWith('r1', 'k', 'lv');
  });

  it('resource_not_found for missing snapshot', async () => {
    const session = { isReady: () => true, caps: {}, sessionSnapshots: new Map() } as any;
    const r = await executeTool(restore_session_state, { name: 'nope' }, session);
    expect(r.ok).toBe(false);
  });
});
