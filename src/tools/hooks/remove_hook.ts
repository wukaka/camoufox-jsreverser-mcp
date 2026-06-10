import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry } from '../../capabilities/types.js';

const schema = z.object({ hookId: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const remove_hook = defineTool<Args, { hookId: string }>({
  name: 'remove_hook',
  description: 'Remove a hook and its preload script registration.',
  schema,
  handler: async ({ hookId }, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    await reg.remove(hookId);
    return ok({ hookId });
  },
});
