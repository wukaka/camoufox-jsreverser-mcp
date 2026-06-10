import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { PageController } from '../../capabilities/types.js';

const schema = z.object({
  action: z.enum(['navigate', 'reload', 'back', 'forward']).default('navigate'),
  url: z.string().url().optional(),
  contextId: z.string().optional(),
  wait: z.enum(['none', 'interactive', 'complete']).optional(),
}).strict();

type Args = z.infer<typeof schema>;

type NavResult = { action: string; contextId: string; url?: string };

export const navigate_page = defineTool<Args, NavResult>({
  name: 'navigate_page',
  description: 'Navigate the current context to a URL, or perform reload / back / forward.',
  schema,
  handler: async (args: Args, session) => {
    const pc = session.caps.pageController as PageController;
    const contextId = args.contextId ?? session.activeContextId;
    if (!contextId) {
      return fail(ErrorReason.TargetNotFound, { hint: 'No active page; call new_page or select_page first.' });
    }
    switch (args.action) {
      case 'navigate':
        if (!args.url) return fail(ErrorReason.BadArgs, { hint: 'url required when action=navigate' });
        await pc.navigate(contextId, args.url, args.wait);
        return ok({ action: 'navigate', contextId, url: args.url });
      case 'reload':
        await pc.reload(contextId);
        return ok({ action: 'reload', contextId });
      case 'back':
        await pc.traverseHistory(contextId, -1);
        return ok({ action: 'back', contextId });
      case 'forward':
        await pc.traverseHistory(contextId, +1);
        return ok({ action: 'forward', contextId });
    }
  },
});
