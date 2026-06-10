import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { DomAccess, NodeRef } from '../../capabilities/types.js';

const schema = z.object({
  selector: z.string(),
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const query_dom = defineTool<Args, { nodes: NodeRef[]; selector: string }>({
  name: 'query_dom',
  description: 'CSS selector query against the active page. Returns shared node references.',
  schema,
  handler: async ({ selector, contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const da = session.caps.domAccess as DomAccess;
    const nodes = await da.query(ctxId, selector);
    return ok({ nodes, selector });
  },
});
