import { describe, it, expect, vi } from 'vitest';
import { makeStealth } from '../../../src/capabilities/stealth.js';
import { StealthWorkersUnavailableError } from '../../../src/capabilities/errors.js';
import type { WorkerInfo, WorkerTopology } from '../../../src/capabilities/types.js';

type AvailableCb = (w: WorkerInfo) => void;

function makePreloadMock() {
  return {
    add: vi.fn().mockResolvedValue('preload-1'),
    addToWorker: vi.fn().mockResolvedValue({ injectedAt: 'post-start' as const }),
    remove: vi.fn(),
  };
}

function makeWorkersMock(initial: WorkerInfo[]) {
  let lastCb: AvailableCb | null = null;
  const unsubscribe = vi.fn();
  const topology: WorkerTopology = {
    listWorkers: vi.fn().mockResolvedValue(initial),
    onWorkerAvailable: vi.fn((cb: AvailableCb) => {
      lastCb = cb;
      return unsubscribe;
    }),
  };
  return {
    topology,
    accessor: () => topology,
    pushAvailable(w: WorkerInfo) { lastCb?.(w); },
    unsubscribe,
  };
}

describe('stealth capability', () => {
  it('listFeatures returns the registered list', () => {
    const preload = makePreloadMock();
    const s = makeStealth(preload);
    const feats = s.listFeatures();
    expect(feats.find(f => f.name === 'webdriver_false')).toBeDefined();
  });

  it('applyPreset(firefox-default) calls preload.add with the FIREFOX_DEFAULT_STEALTH payload', async () => {
    const preload = makePreloadMock();
    const s = makeStealth(preload);
    const r = await s.applyPreset('firefox-default');
    expect(preload.add).toHaveBeenCalled();
    expect(preload.add.mock.calls[0][0]).toMatch(/webdriver/);
    expect(r.preset).toBe('firefox-default');
    expect(r.preloadIds).toEqual(['preload-1']);
  });

  it('applyPreset throws for unknown preset', async () => {
    const preload = makePreloadMock();
    const s = makeStealth(preload);
    await expect(s.applyPreset('nope')).rejects.toThrow(/unknown preset/);
  });

  it('injectCustomScript wraps preload.add', async () => {
    const preload = makePreloadMock();
    const s = makeStealth(preload);
    const r = await s.injectCustomScript('window.x = 1');
    expect(r.preloadId).toBe('preload-1');
  });
});

describe('stealth.applyPresetToWorkers', () => {
  it('rejects unknown preset', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([]);
    const s = makeStealth(preload, workers.accessor);
    await expect(s.applyPresetToWorkers('nope')).rejects.toThrow(/unknown preset/);
  });

  it('throws StealthWorkersUnavailableError when workers accessor is missing or returns undefined', async () => {
    const preload = makePreloadMock();
    const s1 = makeStealth(preload);
    await expect(s1.applyPresetToWorkers('firefox-default')).rejects.toThrow(StealthWorkersUnavailableError);
    const s2 = makeStealth(preload, () => undefined);
    await expect(s2.applyPresetToWorkers('firefox-default')).rejects.toThrow(StealthWorkersUnavailableError);
  });

  it('with no workers returns empty injected/failed, watching:true, post-start, valid unwatch', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([]);
    const s = makeStealth(preload, workers.accessor);
    const r = await s.applyPresetToWorkers('firefox-default');
    expect(r.injected).toEqual([]);
    expect(r.failed).toEqual([]);
    expect(r.watching).toBe(true);
    expect(r.injectedAt).toBe('post-start');
    expect(typeof r.unwatch).toBe('function');
    expect(preload.addToWorker).not.toHaveBeenCalled();
  });

  it('injects payload into every dedicated/shared worker', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([
      { realmId: 'r1', type: 'worker', origin: 'a.js' },
      { realmId: 'r2', type: 'worker', origin: 'b.js' },
    ]);
    const s = makeStealth(preload, workers.accessor);
    const r = await s.applyPresetToWorkers('firefox-default');
    expect(r.injected.sort()).toEqual(['r1', 'r2']);
    expect(r.failed).toEqual([]);
    expect(preload.addToWorker).toHaveBeenCalledTimes(2);
    const payloads = preload.addToWorker.mock.calls.map(c => c[0]);
    expect(payloads[0]).toMatch(/webdriver/);
    expect(payloads[1]).toMatch(/webdriver/);
  });

  it('one success + one rejection produces a parallel report', async () => {
    const preload = makePreloadMock();
    preload.addToWorker
      .mockResolvedValueOnce({ injectedAt: 'post-start' as const })
      .mockRejectedValueOnce(new Error('worker injection failed: boom'));
    const workers = makeWorkersMock([
      { realmId: 'r1', type: 'worker', origin: 'a.js' },
      { realmId: 'r2', type: 'worker', origin: 'b.js' },
    ]);
    const s = makeStealth(preload, workers.accessor);
    const r = await s.applyPresetToWorkers('firefox-default');
    expect(r.injected).toEqual(['r1']);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.realmId).toBe('r2');
    expect(r.failed[0]!.reason).toMatch(/boom/);
  });

  it('service-worker entries are filtered out (no injection)', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([
      { realmId: 'sw1', type: 'service-worker', origin: 'sw.js' },
      { realmId: 'w1', type: 'worker', origin: 'a.js' },
    ]);
    const s = makeStealth(preload, workers.accessor);
    const r = await s.applyPresetToWorkers('firefox-default');
    expect(r.injected).toEqual(['w1']);
    expect(preload.addToWorker).toHaveBeenCalledTimes(1);
    expect(preload.addToWorker.mock.calls[0]![1]).toBe('w1');
  });

  it('watch:true subscribes; dedicated worker push triggers injection; service-worker push does not', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([]);
    const s = makeStealth(preload, workers.accessor);
    await s.applyPresetToWorkers('firefox-default');

    workers.pushAvailable({ realmId: 'r3', type: 'worker', origin: 'late.js' });
    await Promise.resolve();
    expect(preload.addToWorker).toHaveBeenCalledTimes(1);
    expect(preload.addToWorker.mock.calls[0]![1]).toBe('r3');

    workers.pushAvailable({ realmId: 'sw4', type: 'service-worker', origin: 'sw.js' });
    await Promise.resolve();
    expect(preload.addToWorker).toHaveBeenCalledTimes(1);
  });

  it('watch:false skips onWorkerAvailable; returns watching:false', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([]);
    const s = makeStealth(preload, workers.accessor);
    const r = await s.applyPresetToWorkers('firefox-default', { watch: false });
    expect(workers.topology.onWorkerAvailable).not.toHaveBeenCalled();
    expect(r.watching).toBe(false);
    expect(typeof r.unwatch).toBe('function');
    r.unwatch();
  });

  it('unwatch() prevents further watch-mode injections', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([]);
    const s = makeStealth(preload, workers.accessor);
    const r = await s.applyPresetToWorkers('firefox-default');
    r.unwatch();
    expect(workers.unsubscribe).toHaveBeenCalled();
  });

  it('does not double-inject when listWorkers and onWorkerAvailable both surface the same realm', async () => {
    const preload = makePreloadMock();
    const workers = makeWorkersMock([{ realmId: 'r1', type: 'worker', origin: 'a.js' }]);
    const s = makeStealth(preload, workers.accessor);
    await s.applyPresetToWorkers('firefox-default');
    workers.pushAvailable({ realmId: 'r1', type: 'worker', origin: 'a.js' });
    await Promise.resolve();
    expect(preload.addToWorker).toHaveBeenCalledTimes(1);
  });
});
