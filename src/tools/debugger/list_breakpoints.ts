import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController, BreakpointEntry } from '../../capabilities/types.js';

const schema = z.object({}).strict();
type Args = z.infer<typeof schema>;

export const list_breakpoints = defineTool<Args, { breakpoints: BreakpointEntry[] }>({
  name: 'list_breakpoints',
  description: 'List all currently registered breakpoints.',
  schema,
  handler: async (_args, session) => {
    const pc = session.caps.pauseController as PauseController;
    return ok({ breakpoints: pc.listBreakpoints() });
  },
});
