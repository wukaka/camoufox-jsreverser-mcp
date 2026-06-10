import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

const schema = z.object({ contextId: z.string() }).strict();

type Args = z.infer<typeof schema>;

export const select_page = defineTool({
  name: 'select_page',
  description: 'Set the active browsing context for subsequent tool calls.',
  schema,
  handler: async (args: Args, session) => {
    session.activeContextId = args.contextId;
    return ok({ contextId: args.contextId });
  },
});
