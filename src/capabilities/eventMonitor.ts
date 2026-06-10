import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { RdpDriver } from '../drivers/rdp/RdpDriver.js';
import { EventMonitor, MonitorRecord } from './types.js';

const CAP_PER_MONITOR = 500;

interface ResourceArrayPayload {
  array?: Array<{ resourceType: string; resource: unknown }>;
}

export function makeEventMonitor(rdp: RdpDriver, watcherActor: string): EventMonitor {
  const monitors = new Map<string, MonitorRecord>();
  const ee = rdp as unknown as EventEmitter;
  const eventName = `${watcherActor}.resources-available-array`;

  ee.on(eventName, (payload: ResourceArrayPayload) => {
    const arr = payload?.array ?? [];
    for (const item of arr) {
      const rt = item.resourceType;
      if (!rt) continue;
      for (const m of monitors.values()) {
        if (m.resourceTypes.includes(rt)) {
          m.collected.push(item.resource);
          if (m.collected.length > CAP_PER_MONITOR) {
            m.collected.splice(0, m.collected.length - CAP_PER_MONITOR);
          }
        }
      }
    }
  });

  return {
    async start(resourceTypes) {
      const monitorId = `mon-${randomBytes(4).toString('hex')}`;
      await rdp.call(watcherActor, { type: 'watchResources', resourceTypes });
      monitors.set(monitorId, {
        monitorId,
        resourceTypes: [...resourceTypes],
        startedAt: Date.now(),
        collected: [],
      });
      return { monitorId };
    },
    async stop(monitorId) {
      const m = monitors.get(monitorId);
      if (!m) return;
      try { await rdp.call(watcherActor, { type: 'unwatchResources', resourceTypes: m.resourceTypes }); } catch { /* best-effort */ }
      monitors.delete(monitorId);
    },
    list() { return Array.from(monitors.values()); },
    get(monitorId) { return monitors.get(monitorId); },
  };
}
