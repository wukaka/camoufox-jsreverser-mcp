import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController, BreakpointEntry } from '../../capabilities/types.js';

const schema = z.object({
  sourceUrl: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const set_breakpoint = defineTool<Args, { breakpoint: BreakpointEntry }>({
  name: 'set_breakpoint',
  description: 'Set a breakpoint by source URL + line (+ optional column). Uses RDP thread actor.',
  schema,
  handler: async ({ sourceUrl, line, column }, session) => {
    const pc = session.caps.pauseController as PauseController;
    const breakpoint = await pc.setBreakpointByLocation(sourceUrl, line, column);
    return ok({ breakpoint });
  },
});
