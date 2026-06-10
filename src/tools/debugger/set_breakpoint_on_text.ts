import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController, BreakpointEntry } from '../../capabilities/types.js';

const schema = z.object({
  text: z.string(),
  sourceUrl: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const set_breakpoint_on_text = defineTool<Args, { breakpoint: BreakpointEntry }>({
  name: 'set_breakpoint_on_text',
  description: 'Set a breakpoint by searching for a text string in sources (+ optional sourceUrl filter).',
  schema,
  handler: async ({ text, sourceUrl }, session) => {
    const pc = session.caps.pauseController as PauseController;
    const breakpoint = await pc.setBreakpointByText(text, sourceUrl);
    return ok({ breakpoint });
  },
});
