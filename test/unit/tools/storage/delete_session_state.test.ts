import { describe, it, expect } from 'vitest';
import { delete_session_state } from '../../../../src/tools/storage/delete_session_state.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('delete_session_state', () => {
  it('deletes by name', async () => {
    const session = {
      isReady: () => true,
      sessionSnapshots: new Map([['s', { name: 's', capturedAt: 1, cookies: [], localByOrigin: {}, sessionByOrigin: {} }]]),
    } as any;
    const r = await executeTool(delete_session_state, { name: 's' }, session);
    expect(r.ok).toBe(true);
    expect(session.sessionSnapshots.has('s')).toBe(false);
  });

  it('resource_not_found for unknown name', async () => {
    const session = { isReady: () => true, sessionSnapshots: new Map() } as any;
    const r = await executeTool(delete_session_state, { name: 'nope' }, session);
    expect(r.ok).toBe(false);
  });
});
