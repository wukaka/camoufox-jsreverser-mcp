import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeWorkerTopology, makeRdpWorkerTopology } from '../../../src/capabilities/workerTopology.js';
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

  it('BiDi onWorkerAvailable is a no-op that returns a no-op unsubscribe', () => {
    const scripts = { listRealms: vi.fn().mockResolvedValue([]) } as any;
    const wt = makeWorkerTopology(scripts);
    const unsub = wt.onWorkerAvailable(() => { throw new Error('should not fire'); });
    unsub(); // should not throw
  });
});

describe('makeRdpWorkerTopology', () => {
  it('adds workers as target-available-form arrives, ignores frame targets', () => {
    const rdp = new EventEmitter();
    const wt = makeRdpWorkerTopology(rdp as any, 'watcher-1');
    rdp.emit('watcher-1.target-available-form', {
      target: { actor: 'wkr-1', targetType: 'worker', workerDescriptor: { url: 'https://a/w.js', type: 'dedicated' } },
    });
    rdp.emit('watcher-1.target-available-form', {
      target: { actor: 'frame-1', targetType: 'frame' },
    });
    // listWorkers is async; return inside the test:
    return wt.listWorkers().then(ws => {
      expect(ws).toHaveLength(1);
      expect(ws[0]?.realmId).toBe('wkr-1');
      expect(ws[0]?.type).toBe('worker');
    });
  });

  it('service workers are classified as service-worker', async () => {
    const rdp = new EventEmitter();
    const wt = makeRdpWorkerTopology(rdp as any, 'watcher-1');
    rdp.emit('watcher-1.target-available-form', {
      target: { actor: 'sw-1', targetType: 'worker', workerDescriptor: { url: 'https://a/sw.js', type: 'service' } },
    });
    const ws = await wt.listWorkers();
    expect(ws[0]?.type).toBe('service-worker');
  });

  it('onWorkerAvailable fires for each new worker; unsubscribe stops it', () => {
    const rdp = new EventEmitter();
    const wt = makeRdpWorkerTopology(rdp as any, 'watcher-1');
    const seen: string[] = [];
    const unsub = wt.onWorkerAvailable(w => seen.push(w.realmId));
    rdp.emit('watcher-1.target-available-form', {
      target: { actor: 'w1', targetType: 'worker', workerDescriptor: { url: 'https://a' } },
    });
    rdp.emit('watcher-1.target-available-form', {
      target: { actor: 'w2', targetType: 'worker', workerDescriptor: { url: 'https://b' } },
    });
    unsub();
    rdp.emit('watcher-1.target-available-form', {
      target: { actor: 'w3', targetType: 'worker', workerDescriptor: { url: 'https://c' } },
    });
    expect(seen).toEqual(['w1', 'w2']);
  });

  it('target-destroyed-form removes the worker', async () => {
    const rdp = new EventEmitter();
    const wt = makeRdpWorkerTopology(rdp as any, 'watcher-1');
    rdp.emit('watcher-1.target-available-form', {
      target: { actor: 'w1', targetType: 'worker', workerDescriptor: { url: 'https://a' } },
    });
    expect(await wt.listWorkers()).toHaveLength(1);
    rdp.emit('watcher-1.target-destroyed-form', { target: { actor: 'w1' } });
    expect(await wt.listWorkers()).toHaveLength(0);
  });
});
