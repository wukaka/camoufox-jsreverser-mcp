import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { DomAccess } from '../../capabilities/types.js';

const schema = z.object({
  sharedId: z.string(),
  text: z.string(),
  clearFirst: z.boolean().optional(),
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const type_text = defineTool<Args, { sharedId: string; text: string }>({
  name: 'type_text',
  description: 'Type text into a DOM element identified by its sharedId.',
  schema,
  handler: async ({ sharedId, text, clearFirst, contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const da = session.caps.domAccess as DomAccess;
    await da.type(ctxId, sharedId, text, { clearFirst });
    return ok({ sharedId, text });
  },
});
