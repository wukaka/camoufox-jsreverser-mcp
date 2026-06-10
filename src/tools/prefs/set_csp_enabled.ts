import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({
  enabled: z.boolean(),
  contextId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const set_csp_enabled = defineTool<Args, { contextId: string; enabled: boolean }>({
  name: 'set_csp_enabled',
  description: 'Enable or disable CSP enforcement for a browsing context. Per-context scope via BiDi browsingContext.setBypassCSP — when enabled=false, bypass is set so inline injections succeed.',
  schema,
  handler: async ({ enabled, contextId }, session) => {
    const ctxId = contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page; pass contextId or call select_page first.' });
    await session.bidi.send('browsingContext.setBypassCSP', {
      context: ctxId,
      bypass: !enabled,
    });
    return ok({ contextId: ctxId, enabled });
  },
});
