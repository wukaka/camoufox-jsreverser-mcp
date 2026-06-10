import { describe, it, expect } from 'vitest';
import { stop_monitor } from '../../../../src/tools/console/stop_monitor.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('stop_monitor', () => {
  it('removes monitor by id', async () => {
    const m = new Map([['m1', { id: 'm1', events: [], startedAt: 1 }]]);
    const session = { isReady: () => true, activeMonitors: m } as any;
    const r = await executeTool(stop_monitor, { monitorId: 'm1' }, session);
    expect(r.ok).toBe(true);
    expect(m.size).toBe(0);
  });

  it('resource_not_found for unknown id', async () => {
    const session = { isReady: () => true, activeMonitors: new Map() } as any;
    const r = await executeTool(stop_monitor, { monitorId: 'nope' }, session);
    expect(r.ok).toBe(false);
  });
});
