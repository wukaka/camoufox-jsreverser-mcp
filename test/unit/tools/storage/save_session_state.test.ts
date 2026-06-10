import { describe, it, expect, vi } from 'vitest';
import { save_session_state } from '../../../../src/tools/storage/save_session_state.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('save_session_state', () => {
  it('snapshots cookies + storage by origin', async () => {
    const sa = {
      getCookies: vi.fn().mockResolvedValue({ cookies: [{ name: 'c', value: 'v' }] }),
      getLocalStorage: vi.fn().mockResolvedValue({ k: 'lv' }),
      getSessionStorage: vi.fn().mockResolvedValue({ k2: 'sv' }),
    };
    const sh = { listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]) };
    const session = {
      isReady: () => true,
      caps: { storageAccess: sa, scriptHost: sh },
      activeContextId: 'c1',
      sessionSnapshots: new Map(),
    } as any;
    const r = await executeTool(save_session_state, { name: 'snap1' }, session);
    expect(r.ok).toBe(true);
    expect(session.sessionSnapshots.has('snap1')).toBe(true);
    const snap = session.sessionSnapshots.get('snap1');
    expect(snap.cookies).toHaveLength(1);
    expect(snap.localByOrigin['https://a']).toEqual({ k: 'lv' });
  });
});
