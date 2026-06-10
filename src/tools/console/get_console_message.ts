import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({ index: z.number().int().nonnegative() }).strict();
type Args = z.infer<typeof schema>;

export const get_console_message = defineTool<Args, { index: number; message: unknown }>({
  name: 'get_console_message',
  description: 'Get a single console entry by index.',
  schema,
  handler: async ({ index }, session) => {
    const all = session.consoleRing.list();
    const message = all[index];
    if (message === undefined) {
      return fail(ErrorReason.ResourceNotFound, { details: { kind: 'consoleIndex', id: String(index) } });
    }
    return ok({ index, message });
  },
});
