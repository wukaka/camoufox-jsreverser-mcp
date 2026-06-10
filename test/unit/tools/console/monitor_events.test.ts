import { describe, it, expect, vi } from 'vitest';
import { monitor_events } from '../../../../src/tools/console/monitor_events.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('monitor_events', () => {
  it('delegates to eventMonitor.start when capability is wired', async () => {
    const em = { start: vi.fn().mockResolvedValue({ monitorId: 'mon-x' }) };
    const session = { isReady: () => true, caps: { eventMonitor: em }, activeMonitors: new Map() } as any;
    const r = await executeTool(monitor_events, { resourceTypes: ['console-message'] }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.monitorId).toBe('mon-x');
    expect(em.start).toHaveBeenCalledWith(['console-message']);
  });

  it('falls back to in-memory stub when capability absent', async () => {
    const session = { isReady: () => true, caps: {}, activeMonitors: new Map() } as any;
    const r = await executeTool(monitor_events, { events: ['DOMSubtreeModified'] }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.monitorId).toMatch(/^mon-/);
    expect(session.activeMonitors.size).toBe(1);
  });

  it('accepts back-compat events field', async () => {
    const em = { start: vi.fn().mockResolvedValue({ monitorId: 'mon-y' }) };
    const session = { isReady: () => true, caps: { eventMonitor: em }, activeMonitors: new Map() } as any;
    await executeTool(monitor_events, { events: ['source'] }, session);
    expect(em.start).toHaveBeenCalledWith(['source']);
  });
});
