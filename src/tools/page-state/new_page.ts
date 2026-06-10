import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PageController } from '../../capabilities/types.js';

const schema = z.object({
  url: z.string().url().optional(),
  background: z.boolean().optional(),
}).strict();

type Args = z.infer<typeof schema>;

export const new_page = defineTool({
  name: 'new_page',
  description: 'Open a new browsing context (tab).',
  schema,
  handler: async (args: Args, session) => {
    const pc = session.caps.pageController as PageController;
    const contextId = await pc.createPage({ url: args.url, background: args.background });
    return ok({ contextId });
  },
});
