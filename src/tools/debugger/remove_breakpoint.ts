import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController } from '../../capabilities/types.js';

const schema = z.object({
  bpId: z.string(),
}).strict();
type Args = z.infer<typeof schema>;

export const remove_breakpoint = defineTool<Args, { bpId: string }>({
  name: 'remove_breakpoint',
  description: 'Remove an existing breakpoint by its bpId.',
  schema,
  handler: async ({ bpId }, session) => {
    const pc = session.caps.pauseController as PauseController;
    await pc.removeBreakpoint(bpId);
    return ok({ bpId });
  },
});
