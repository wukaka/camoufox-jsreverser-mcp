import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry } from '../../capabilities/types.js';

export const list_hooks = defineTool({
  name: 'list_hooks',
  description: 'List all registered hooks with their injection status and sample count.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    return ok({ hooks: reg.list() });
  },
});
