import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { ScriptHost } from '../../capabilities/types.js';

const schema = z.object({
  expression: z.string(),
  awaitPromise: z.boolean().optional(),
  contextId: z.string().optional(),
  realmId: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const evaluate_script = defineTool<Args, { result: unknown; exceptionDetails?: unknown }>({
  name: 'evaluate_script',
  description: 'Evaluate a JS expression in a window realm of the active (or specified) context.',
  schema,
  handler: async ({ expression, awaitPromise, contextId, realmId }, session) => {
    const sh = session.caps.scriptHost as ScriptHost;
    let targetRealmId = realmId;
    if (!targetRealmId) {
      const ctxId = contextId ?? session.activeContextId;
      if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page or explicit realmId.' });
      const realms = await sh.listRealms(ctxId);
      const realm = realms.find(r => r.type === 'window');
      if (!realm) return fail(ErrorReason.TargetNotFound, { hint: 'No window realm.' });
      targetRealmId = realm.realmId;
    }
    const r = await sh.evaluate(targetRealmId, expression, { awaitPromise: awaitPromise ?? false });
    return ok({ result: r.result, exceptionDetails: r.exceptionDetails });
  },
});
