import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

const schema = z.object({ events: z.array(z.string()) }).strict();
type Args = z.infer<typeof schema>;

export const monitor_events = defineTool<Args, { monitorId: string; note: string }>({
  name: 'monitor_events',
  description: 'Start a monitor for named events. v1 records the request; M3 RDP subscribes engine-level events behind the same tool.',
  schema,
  handler: async ({ events }, session) => {
    const monitorId = `mon-${randomBytes(4).toString('hex')}`;
    session.activeMonitors.set(monitorId, { id: monitorId, events, startedAt: Date.now() });
    return ok({ monitorId, note: 'v1 records request only; M3 RDP wires engine-level subscriptions.' });
  },
});
