import { describe, it, expect, vi } from 'vitest';
import { makeWorkerTopology } from '../../../src/capabilities/workerTopology.js';
import type { ScriptHost } from '../../../src/capabilities/types.js';

function fakeScripts(realms: Array<{ realmId: string; origin: string; type: string }>): ScriptHost {
  return {
    listRealms: vi.fn().mockResolvedValue(realms),
    evaluate: vi.fn(),
    callFunction: vi.fn(),
  };
}

describe('workerTopology', () => {
  it('listWorkers returns only worker and service-worker realms', async () => {
    const scripts = fakeScripts([
      { realmId: 'r-window', origin: 'https://example.com', type: 'window' },
      { realmId: 'r-worker', origin: 'https://example.com', type: 'worker' },
      { realmId: 'r-sw', origin: 'https://example.com', type: 'service-worker' },
    ]);
    const topology = makeWorkerTopology(scripts);
    const workers = await topology.listWorkers();
    expect(workers).toHaveLength(2);
    expect(workers.map(w => w.realmId)).toEqual(['r-worker', 'r-sw']);
  });

  it('listWorkers returns empty array when no worker realms exist', async () => {
    const scripts = fakeScripts([
      { realmId: 'r-window', origin: 'https://a.com', type: 'window' },
    ]);
    const topology = makeWorkerTopology(scripts);
    const workers = await topology.listWorkers();
    expect(workers).toHaveLength(0);
  });

  it('maps realm fields to WorkerInfo shape correctly', async () => {
    const scripts = fakeScripts([
      { realmId: 'r-sw-1', origin: 'https://cdn.example.com', type: 'service-worker' },
    ]);
    const topology = makeWorkerTopology(scripts);
    const workers = await topology.listWorkers();
    expect(workers[0]).toEqual({
      realmId: 'r-sw-1',
      type: 'service-worker',
      origin: 'https://cdn.example.com',
    });
  });
});
