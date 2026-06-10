import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { DomAccess } from '../../capabilities/types.js';

const schema = z.object({
  sharedId: z.string(),
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const click_element = defineTool<Args, { sharedId: string }>({
  name: 'click_element',
  description: 'Click a DOM element identified by its sharedId.',
  schema,
  handler: async ({ sharedId, contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const da = session.caps.domAccess as DomAccess;
    await da.click(ctxId, sharedId);
    return ok({ sharedId });
  },
});
