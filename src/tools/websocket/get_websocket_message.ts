import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { WsObserver, WsFrame } from '../../capabilities/types.js';

const schema = z.object({ wsid: z.string(), frameIndex: z.number().int().nonnegative() }).strict();
type Args = z.infer<typeof schema>;

export const get_websocket_message = defineTool<Args, { wsid: string; frameIndex: number; frame: WsFrame }>({
  name: 'get_websocket_message',
  description: 'Get a single frame by wsid + frameIndex.',
  schema,
  handler: async ({ wsid, frameIndex }, session) => {
    const obs = session.caps.wsObserver as WsObserver;
    const frames = obs.getFrames(wsid);
    const frame = frames[frameIndex];
    if (!frame) return fail(ErrorReason.ResourceNotFound, { details: { kind: 'wsFrame', id: `${wsid}:${frameIndex}` } });
    return ok({ wsid, frameIndex, frame });
  },
});
