import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({ name: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const delete_session_state = defineTool<Args, { name: string }>({
  name: 'delete_session_state',
  description: 'Delete a named session snapshot from memory.',
  schema,
  handler: async ({ name }, session) => {
    if (!session.sessionSnapshots.delete(name)) {
      return fail(ErrorReason.ResourceNotFound, { details: { kind: 'snapshot', id: name } });
    }
    return ok({ name });
  },
});
