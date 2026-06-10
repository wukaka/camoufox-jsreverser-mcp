import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController, PauseInfo } from '../../capabilities/types.js';

const schema = z.object({}).strict();
type Args = z.infer<typeof schema>;

export const pause = defineTool<Args, { pausedInfo: PauseInfo | null }>({
  name: 'pause',
  description: 'Pause script execution in the debugger thread.',
  schema,
  handler: async (_args, session) => {
    const pc = session.caps.pauseController as PauseController;
    await pc.pause();
    return ok({ pausedInfo: pc.getPausedInfo() });
  },
});
