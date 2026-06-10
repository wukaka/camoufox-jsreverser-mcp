import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController, PauseInfo } from '../../capabilities/types.js';

const schema = z.object({}).strict();
type Args = z.infer<typeof schema>;

export const step_into = defineTool<Args, { pausedInfo: PauseInfo | null }>({
  name: 'step_into',
  description: 'Step into the current function call.',
  schema,
  handler: async (_args, session) => {
    const pc = session.caps.pauseController as PauseController;
    await pc.stepInto();
    return ok({ pausedInfo: pc.getPausedInfo() });
  },
});
