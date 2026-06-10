import { describe, it, expect, vi } from 'vitest';
import { stop_monitor } from '../../../../src/tools/console/stop_monitor.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('stop_monitor', () => {
  it('delegates to eventMonitor.stop when capability is wired', async () => {
    const em = {
      get: vi.fn().mockReturnValue({ monitorId: 'm1', resourceTypes: ['a'], startedAt: 0, collected: [] }),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const session = { isReady: () => true, caps: { eventMonitor: em }, activeMonitors: new Map() } as any;
    const r = await executeTool(stop_monitor, { monitorId: 'm1' }, session);
    expect(r.ok).toBe(true);
    expect(em.stop).toHaveBeenCalledWith('m1');
  });

  it('returns resource_not_found when monitor unknown', async () => {
    const em = { get: vi.fn().mockReturnValue(undefined), stop: vi.fn() };
    const session = { isReady: () => true, caps: { eventMonitor: em }, activeMonitors: new Map() } as any;
    const r = await executeTool(stop_monitor, { monitorId: 'nope' }, session);
    expect(r.ok).toBe(false);
  });

  it('falls back to in-memory stub', async () => {
    const m = new Map([['m1', { id: 'm1', events: [], startedAt: 1 }]]);
    const session = { isReady: () => true, caps: {}, activeMonitors: m } as any;
    const r = await executeTool(stop_monitor, { monitorId: 'm1' }, session);
    expect(r.ok).toBe(true);
    expect(m.size).toBe(0);
  });
});
