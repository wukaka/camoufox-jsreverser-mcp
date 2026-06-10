import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({
  userAgent: z.string(),
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const set_user_agent = defineTool<Args, { contextId: string; userAgent: string }>({
  name: 'set_user_agent',
  description: 'Override the User-Agent string for a browsing context via BiDi emulation.setUserAgentOverride.',
  schema,
  handler: async ({ userAgent, contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page; pass contextId or call select_page first.' });
    await session.bidi.send('emulation.setUserAgentOverride', {
      contexts: [ctxId],
      userAgent,
    });
    return ok({ contextId: ctxId, userAgent });
  },
});
