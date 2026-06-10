import { describe, it, expect } from 'vitest';
import { dump_session_state } from '../../../../src/tools/storage/dump_session_state.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('dump_session_state', () => {
  it('returns JSON string of the snapshot', async () => {
    const snap = { name: 's', capturedAt: 1, cookies: [], localByOrigin: {}, sessionByOrigin: {} };
    const session = { isReady: () => true, sessionSnapshots: new Map([['s', snap]]) } as any;
    const r = await executeTool(dump_session_state, { name: 's' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const parsed = JSON.parse(r.data.json);
      expect(parsed.name).toBe('s');
    }
  });
});
