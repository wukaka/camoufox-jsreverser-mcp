import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

const schema = z.object({ frameContextId: z.string() }).strict();

type Args = z.infer<typeof schema>;

export const select_frame = defineTool({
  name: 'select_frame',
  description: 'Set the active frame (iframe) context for subsequent tool calls. Pass empty string to clear.',
  schema,
  handler: async (args: Args, session) => {
    session.activeFrameContextId = args.frameContextId === '' ? null : args.frameContextId;
    return ok({ frameContextId: session.activeFrameContextId });
  },
});
