import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { WsObserver, WsFrame } from '../../capabilities/types.js';

const schema = z.object({
  wsid: z.string(),
  limit: z.number().int().positive().optional(),
  since: z.number().optional(),
  dir: z.enum(['in', 'out']).optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const get_websocket_messages = defineTool<Args, { wsid: string; frames: WsFrame[]; totalCount: number }>({
  name: 'get_websocket_messages',
  description: 'Get multiple frames for a wsid with optional filters.',
  schema,
  handler: async ({ wsid, limit, since, dir }, session) => {
    const obs = session.caps.wsObserver as WsObserver;
    const frames = obs.getFrames(wsid, { limit, since, dir });
    return ok({ wsid, frames, totalCount: frames.length });
  },
});
