import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { WsObserver } from '../../capabilities/types.js';

const schema = z.object({
  urlSubstring: z.string().optional(),
  targetId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const list_websocket_connections = defineTool<Args, { connections: ReturnType<WsObserver['listConnections']> }>({
  name: 'list_websocket_connections',
  description: 'List active WebSocket connections detected on the page.',
  schema,
  handler: async (args, session) => {
    const obs = session.caps.wsObserver as WsObserver;
    return ok({ connections: obs.listConnections(args) });
  },
});
