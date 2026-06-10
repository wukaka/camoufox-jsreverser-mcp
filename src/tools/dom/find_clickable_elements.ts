import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { DomAccess, NodeRef } from '../../capabilities/types.js';

const CLICKABLE_SELECTOR = 'a, button, [role="button"], [onclick], input[type="submit"], input[type="button"]';

const schema = z.object({
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const find_clickable_elements = defineTool<Args, { nodes: NodeRef[]; selector: string }>({
  name: 'find_clickable_elements',
  description: 'Find all clickable elements (links, buttons, role=button, onclick, submit inputs) on the active page.',
  schema,
  handler: async ({ contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const da = session.caps.domAccess as DomAccess;
    const nodes = await da.query(ctxId, CLICKABLE_SELECTOR);
    return ok({ nodes, selector: CLICKABLE_SELECTOR });
  },
});
