import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

const schema = z.object({ workerRealmId: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const select_worker = defineTool<Args, { workerRealmId: string | null }>({
  name: 'select_worker',
  description: 'Set the active worker realm. Pass empty string to clear. Used as default target by hook tools.',
  schema,
  handler: async ({ workerRealmId }, session) => {
    session.activeWorkerRealmId = workerRealmId === '' ? null : workerRealmId;
    return ok({ workerRealmId: session.activeWorkerRealmId });
  },
});
