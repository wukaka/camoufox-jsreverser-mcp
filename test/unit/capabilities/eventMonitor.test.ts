import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeEventMonitor } from '../../../src/capabilities/eventMonitor.js';

function fakeRdp() {
  const ee = new EventEmitter();
  return Object.assign(ee, { call: vi.fn().mockResolvedValue({}) });
}

describe('eventMonitor', () => {
  it('start() issues watchResources and returns monitorId', async () => {
    const rdp = fakeRdp();
    const em = makeEventMonitor(rdp as any, 'watcher-1');
    const r = await em.start(['console-message', 'error-message']);
    expect(r.monitorId).toMatch(/^mon-/);
    expect(rdp.call).toHaveBeenCalledWith('watcher-1', {
      type: 'watchResources', resourceTypes: ['console-message', 'error-message'],
    });
    expect(em.list()).toHaveLength(1);
  });

  it('collects resources-available-array events for the started types', async () => {
    const rdp = fakeRdp();
    const em = makeEventMonitor(rdp as any, 'watcher-1');
    const { monitorId } = await em.start(['console-message']);
    rdp.emit('watcher-1.resources-available-array', {
      array: [
        { resourceType: 'console-message', resource: { level: 'info', text: 'hi' } },
        { resourceType: 'console-message', resource: { level: 'warn', text: 'oh' } },
        { resourceType: 'error-message', resource: { text: 'crash' } }, // wrong type — should be ignored
      ],
    });
    const record = em.get(monitorId)!;
    expect(record.collected).toHaveLength(2);
    expect((record.collected[0] as any).text).toBe('hi');
  });

  it('stop() issues unwatchResources and removes the monitor', async () => {
    const rdp = fakeRdp();
    const em = makeEventMonitor(rdp as any, 'watcher-1');
    const { monitorId } = await em.start(['console-message']);
    await em.stop(monitorId);
    expect(rdp.call).toHaveBeenLastCalledWith('watcher-1', {
      type: 'unwatchResources', resourceTypes: ['console-message'],
    });
    expect(em.get(monitorId)).toBeUndefined();
  });

  it('multiple monitors collect concurrently without crosstalk', async () => {
    const rdp = fakeRdp();
    const em = makeEventMonitor(rdp as any, 'watcher-1');
    const a = await em.start(['console-message']);
    const b = await em.start(['error-message']);
    rdp.emit('watcher-1.resources-available-array', {
      array: [
        { resourceType: 'console-message', resource: { text: 'C' } },
        { resourceType: 'error-message', resource: { text: 'E' } },
      ],
    });
    expect(em.get(a.monitorId)!.collected).toHaveLength(1);
    expect(em.get(b.monitorId)!.collected).toHaveLength(1);
  });

  it('respects the 500-event cap per monitor', async () => {
    const rdp = fakeRdp();
    const em = makeEventMonitor(rdp as any, 'watcher-1');
    const { monitorId } = await em.start(['console-message']);
    const arr = [];
    for (let i = 0; i < 600; i++) {
      arr.push({ resourceType: 'console-message', resource: { i } });
    }
    rdp.emit('watcher-1.resources-available-array', { array: arr });
    const record = em.get(monitorId)!;
    expect(record.collected.length).toBe(500);
    // Should keep the most recent (FIFO drop)
    expect((record.collected[record.collected.length - 1] as any).i).toBe(599);
  });
});
