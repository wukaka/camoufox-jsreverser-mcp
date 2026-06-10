import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry, HookSample } from '../../capabilities/types.js';

const schema = z.object({
  hookId: z.string(),
  limit: z.number().int().positive().optional(),
  since: z.number().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const get_hook_data = defineTool<Args, { samples: HookSample[] }>({
  name: 'get_hook_data',
  description: 'Read collected samples for a hook. Optionally limit count and filter by timestamp.',
  schema,
  handler: async ({ hookId, limit, since }, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    const samples = reg.read(hookId, { limit, since });
    return ok({ samples });
  },
});
