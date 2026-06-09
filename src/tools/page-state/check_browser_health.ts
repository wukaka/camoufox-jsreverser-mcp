import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

export const check_browser_health = defineTool({
  name: 'check_browser_health',
  description: 'Verify Firefox is connected and BiDi reports ready.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    if (!session.isReady()) return fail(ErrorReason.BrowserNotReady, { retriable: true });
    const status = await session.bidi.send('session.status', {}) as { ready: boolean; message?: string };
    return ok({ ready: status.ready, message: status.message ?? '', emitName: session.emitName });
  },
});
