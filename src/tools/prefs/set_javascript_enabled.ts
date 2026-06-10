import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({
  enabled: z.boolean(),
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const set_javascript_enabled = defineTool<Args, { contextId: string; enabled: boolean }>({
  name: 'set_javascript_enabled',
  description: 'Enable or disable JavaScript execution for a browsing context. Per-context scope via BiDi emulation.setScriptingEnabled — does not affect other tabs.',
  schema,
  handler: async ({ enabled, contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page; pass contextId or call select_page first.' });
    await session.bidi.send('emulation.setScriptingEnabled', {
      contexts: [ctxId],
      enabled,
    });
    return ok({ contextId: ctxId, enabled });
  },
});
