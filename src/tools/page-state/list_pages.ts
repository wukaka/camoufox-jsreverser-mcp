import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PageController } from '../../capabilities/types.js';

export const list_pages = defineTool({
  name: 'list_pages',
  description: 'List browsing contexts (tabs and iframes) currently open in Firefox.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const pc = session.caps.pageController as PageController;
    const contexts = await pc.listContexts();
    return ok({ contexts });
  },
});
