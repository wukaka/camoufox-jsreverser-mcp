import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { DomAccess, NodeRef } from '../../capabilities/types.js';

const schema = z.object({
  selector: z.string(),
  timeoutMs: z.number().int().positive().optional(),
  state: z.enum(['present', 'visible']).optional(),
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const wait_for_element = defineTool<Args, { node: NodeRef }>({
  name: 'wait_for_element',
  description: 'Wait for a CSS selector to match an element on the active page.',
  schema,
  handler: async ({ selector, timeoutMs, state, contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const da = session.caps.domAccess as DomAccess;
    const node = await da.waitFor(ctxId, selector, { timeoutMs, state });
    return ok({ node });
  },
});
