import { describe, it, expect } from 'vitest';
import { monitor_events } from '../../../../src/tools/console/monitor_events.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('monitor_events', () => {
  it('registers monitor and returns id', async () => {
    const session = { isReady: () => true, activeMonitors: new Map() } as any;
    const r = await executeTool(monitor_events, { events: ['DOMSubtreeModified'] }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.monitorId).toMatch(/^mon-/);
    expect(session.activeMonitors.size).toBe(1);
  });
});
