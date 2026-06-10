import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { EventMonitor } from '../../capabilities/types.js';

const schema = z.object({
  resourceTypes: z.array(z.string()).optional(),
  // Back-compat: accept the M2 'events' field too; if both given, prefer resourceTypes.
  events: z.array(z.string()).optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const monitor_events = defineTool<Args, { monitorId: string; note?: string }>({
  name: 'monitor_events',
  description: 'Start a monitor for RDP resource types (console-message, error-message, network-event, source, document-event, etc.).',
  schema,
  handler: async ({ resourceTypes, events }, session) => {
    const types = resourceTypes ?? events ?? [];
    if (!session.caps.eventMonitor) {
      // capability not wired yet (rare); fall back to bookkeeping
      const monitorId = `mon-${Math.random().toString(36).slice(2, 10)}`;
      session.activeMonitors.set(monitorId, { id: monitorId, events: types, startedAt: Date.now() });
      return ok({ monitorId, note: 'eventMonitor capability not wired — using in-memory stub.' });
    }
    const em = session.caps.eventMonitor as EventMonitor;
    const r = await em.start(types);
    return ok({ monitorId: r.monitorId });
  },
});
