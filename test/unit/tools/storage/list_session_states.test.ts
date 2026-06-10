import { describe, it, expect } from 'vitest';
import { list_session_states } from '../../../../src/tools/storage/list_session_states.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_session_states', () => {
  it('returns names and metadata', async () => {
    const session = {
      isReady: () => true,
      sessionSnapshots: new Map([
        ['a', { name: 'a', capturedAt: 1, cookies: [{}], localByOrigin: {}, sessionByOrigin: {} }],
        ['b', { name: 'b', capturedAt: 2, cookies: [], localByOrigin: {}, sessionByOrigin: {} }],
      ]),
    } as any;
    const r = await executeTool(list_session_states, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.snapshots).toHaveLength(2);
      expect(r.data.snapshots[0]).toMatchObject({ name: 'a' });
    }
  });
});
