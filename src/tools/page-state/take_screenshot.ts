import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { PageController } from '../../capabilities/types.js';

const schema = z.object({
  contextId: z.string().optional(),
}).strict();

type Args = z.infer<typeof schema>;

export const take_screenshot = defineTool({
  name: 'take_screenshot',
  description: 'Take a screenshot of the active page as base64 PNG.',
  schema,
  handler: async (args: Args, session) => {
    const pc = session.caps.pageController as PageController;
    const ctxId = args.contextId ?? session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const r = await pc.screenshot(ctxId);
    return ok({ data: r.data, contextId: ctxId });
  },
});
