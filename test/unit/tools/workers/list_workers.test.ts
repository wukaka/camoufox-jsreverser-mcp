import { describe, it, expect, vi } from 'vitest';
import { list_workers } from '../../../../src/tools/workers/list_workers.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_workers', () => {
  it('returns workers from workerTopology', async () => {
    const wt = { listWorkers: vi.fn().mockResolvedValue([
      { realmId: 'wkr-1', type: 'worker', origin: 'https://a' },
      { realmId: 'wkr-2', type: 'service-worker', origin: 'https://a' },
    ]) };
    const session = { isReady: () => true, caps: { workerTopology: wt } } as any;
    const r = await executeTool(list_workers, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.workers).toHaveLength(2);
  });
});
