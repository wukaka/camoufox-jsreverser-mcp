import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { InitiatorTracer } from '../../capabilities/types.js';

const schema = z.object({ requestId: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const get_request_initiator = defineTool<Args, { initiator: unknown; normalized?: unknown; note?: string }>({
  name: 'get_request_initiator',
  description: 'Get the initiator info for a request. Returns BiDi initiator + (when M3 initiatorTracer is wired) normalized {type, stack[{scriptUrl,line,column,functionName?}]}.',
  schema,
  handler: async ({ requestId }, session) => {
    const entry = session.requests.get(requestId);
    if (!entry) return fail(ErrorReason.ResourceNotFound, { details: { kind: 'requestId', id: requestId } });
    const tracer = session.caps.initiatorTracer as InitiatorTracer | undefined;
    const initiator = entry.initiator ?? null;
    const normalized = tracer ? tracer.normalize(initiator) : undefined;
    return ok({
      initiator,
      normalized,
      note: normalized ? undefined : 'initiatorTracer capability not wired — only raw BiDi initiator returned.',
    });
  },
});
