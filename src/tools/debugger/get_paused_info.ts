import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { PauseController, PauseInfo } from '../../capabilities/types.js';

const schema = z.object({}).strict();
type Args = z.infer<typeof schema>;

export const get_paused_info = defineTool<Args, { pausedInfo: PauseInfo }>({
  name: 'get_paused_info',
  description: 'Get information about the current paused state (callframe, location, why). Fails if not paused.',
  schema,
  handler: async (_args, session) => {
    const pc = session.caps.pauseController as PauseController;
    const info = pc.getPausedInfo();
    if (info === null) {
      return fail(ErrorReason.NotPaused, { hint: 'Thread is not paused. Use the pause tool or set a breakpoint first.' });
    }
    return ok({ pausedInfo: info });
  },
});
