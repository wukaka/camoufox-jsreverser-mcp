import { describe, it, expect } from 'vitest';
import { select_worker } from '../../../../src/tools/workers/select_worker.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('select_worker', () => {
  it('sets activeWorkerRealmId', async () => {
    const session = { isReady: () => true, activeWorkerRealmId: null } as any;
    const r = await executeTool(select_worker, { workerRealmId: 'wkr-1' }, session);
    expect(r.ok).toBe(true);
    expect(session.activeWorkerRealmId).toBe('wkr-1');
  });

  it('clears when passed empty string', async () => {
    const session = { isReady: () => true, activeWorkerRealmId: 'wkr-1' } as any;
    const r = await executeTool(select_worker, { workerRealmId: '' }, session);
    expect(r.ok).toBe(true);
    expect(session.activeWorkerRealmId).toBeNull();
  });
});
