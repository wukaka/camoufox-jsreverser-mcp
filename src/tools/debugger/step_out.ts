import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController, PauseInfo } from '../../capabilities/types.js';

const schema = z.object({}).strict();
type Args = z.infer<typeof schema>;

export const step_out = defineTool<Args, { pausedInfo: PauseInfo | null }>({
  name: 'step_out',
  description: 'Step out of the current function, resuming until the caller.',
  schema,
  handler: async (_args, session) => {
    const pc = session.caps.pauseController as PauseController;
    await pc.stepOut();
    return ok({ pausedInfo: pc.getPausedInfo() });
  },
});
