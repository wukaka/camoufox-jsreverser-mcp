import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { NetworkObserver } from '../../capabilities/types.js';

const schema = z.object({
  requestId: z.string(),
  fetchBody: z.boolean().optional(),
  dataType: z.enum(['response', 'request']).optional(),
}).strict();
type Args = z.infer<typeof schema>;

export interface OutShape { entry: unknown; body?: { type: 'string' | 'base64'; value: string } }

export const get_network_request = defineTool<Args, OutShape>({
  name: 'get_network_request',
  description: 'Get full details of a single network request by ID. Optionally fetch its body via networkObserver.getData.',
  schema,
  handler: async ({ requestId, fetchBody, dataType }, session) => {
    const entry = session.requests.get(requestId);
    if (!entry) return fail(ErrorReason.ResourceNotFound, { details: { kind: 'requestId', id: requestId } });
    if (fetchBody) {
      const observer = session.caps.networkObserver as NetworkObserver;
      const r = await observer.getData({ dataType: dataType ?? 'response', request: requestId });
      return ok({ entry, body: r.bytes });
    }
    return ok({ entry });
  },
});
