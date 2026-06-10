import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({ requestId: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const get_request_initiator = defineTool<Args, { initiator: unknown; note: string }>({
  name: 'get_request_initiator',
  description: 'Get the initiator info for a request. v1 returns BiDi-side initiator only; M3 RDP adds full stack with scriptId/line/col.',
  schema,
  handler: async ({ requestId }, session) => {
    const entry = session.requests.get(requestId);
    if (!entry) return fail(ErrorReason.ResourceNotFound, { details: { kind: 'requestId', id: requestId } });
    return ok({
      initiator: entry.initiator ?? null,
      note: 'M3 RDP version adds full stack with scriptId/line/col.',
    });
  },
});
