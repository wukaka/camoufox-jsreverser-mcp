import { describe, it, expect } from 'vitest';
import { load_session_state } from '../../../../src/tools/storage/load_session_state.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('load_session_state', () => {
  it('stores parsed snapshot under given name', async () => {
    const session = { isReady: () => true, sessionSnapshots: new Map() } as any;
    const json = JSON.stringify({ name: 's', capturedAt: 1, cookies: [], localByOrigin: {}, sessionByOrigin: {} });
    const r = await executeTool(load_session_state, { name: 'loaded', json }, session);
    expect(r.ok).toBe(true);
    expect(session.sessionSnapshots.has('loaded')).toBe(true);
  });

  it('bad_args for invalid JSON', async () => {
    const session = { isReady: () => true, sessionSnapshots: new Map() } as any;
    const r = await executeTool(load_session_state, { name: 'bad', json: 'not json' }, session);
    expect(r.ok).toBe(false);
  });
});
