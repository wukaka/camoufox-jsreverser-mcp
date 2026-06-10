import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController } from '../../capabilities/types.js';

const schema = z.object({}).strict();
type Args = z.infer<typeof schema>;

export const resume = defineTool<Args, Record<string, never>>({
  name: 'resume',
  description: 'Resume script execution after a pause.',
  schema,
  handler: async (_args, session) => {
    const pc = session.caps.pauseController as PauseController;
    await pc.resume();
    return ok({});
  },
});
