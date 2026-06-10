import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { EventMonitor } from '../../capabilities/types.js';

const schema = z.object({ monitorId: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const stop_monitor = defineTool<Args, { monitorId: string }>({
  name: 'stop_monitor',
  description: 'Stop a monitor previously started by monitor_events.',
  schema,
  handler: async ({ monitorId }, session) => {
    if (session.caps.eventMonitor) {
      const em = session.caps.eventMonitor as EventMonitor;
      if (!em.get(monitorId)) {
        return fail(ErrorReason.ResourceNotFound, { details: { kind: 'monitor', id: monitorId } });
      }
      await em.stop(monitorId);
      return ok({ monitorId });
    }
    if (!session.activeMonitors.delete(monitorId)) {
      return fail(ErrorReason.ResourceNotFound, { details: { kind: 'monitor', id: monitorId } });
    }
    return ok({ monitorId });
  },
});
