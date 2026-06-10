import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { ObjectInspector, RdpGrip } from '../../capabilities/types.js';

const schema = z.object({
  grip: z.object({}).passthrough().optional(),
  actor: z.string().optional(),
  withInternalSlots: z.boolean().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const inspect_object = defineTool<Args, {
  inspect: { actor: string; class: string; preview: unknown };
  properties?: unknown;
  internalSlots?: Record<string, unknown>;
}>({
  name: 'inspect_object',
  description: 'Inspect an RDP object grip: preview + prototype + own properties (+ optional internal slots).',
  schema,
  handler: async ({ grip, actor, withInternalSlots }, session) => {
    if (!grip && !actor) {
      return fail(ErrorReason.BadArgs, { hint: 'Provide either `grip` (full RDP grip object) or `actor` (just the object actor id).' });
    }
    const oi = session.caps.objectInspector as ObjectInspector;
    const useGrip: RdpGrip = grip
      ? grip as RdpGrip
      : { type: 'object', actor: actor!, class: 'Object' };
    const inspect = oi.inspect(useGrip);
    const proto = await oi.prototypeAndProperties(useGrip);
    const result: {
      inspect: { actor: string; class: string; preview: unknown };
      properties?: unknown;
      internalSlots?: Record<string, unknown>;
    } = { inspect, properties: { prototype: proto.prototype, list: proto.properties } };
    if (withInternalSlots) {
      result.internalSlots = await oi.getInternalSlots(useGrip);
    }
    return ok(result);
  },
});
