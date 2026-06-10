import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry } from '../../capabilities/types.js';

const schema = z.object({ hookId: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const unhook_function = defineTool<Args, { hookId: string }>({
  name: 'unhook_function',
  description: 'Alias for remove_hook (kept for compatibility with the original CDP project naming).',
  schema,
  handler: async ({ hookId }, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    await reg.remove(hookId);
    return ok({ hookId });
  },
});
