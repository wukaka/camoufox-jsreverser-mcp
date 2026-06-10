import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({ name: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const dump_session_state = defineTool<Args, { name: string; json: string }>({
  name: 'dump_session_state',
  description: 'Export a named snapshot as a JSON string (for writing to disk).',
  schema,
  handler: async ({ name }, session) => {
    const snap = session.sessionSnapshots.get(name);
    if (!snap) return fail(ErrorReason.ResourceNotFound, { details: { kind: 'snapshot', id: name } });
    return ok({ name, json: JSON.stringify(snap) });
  },
});
