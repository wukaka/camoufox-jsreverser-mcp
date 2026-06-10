import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry, InjectOpts } from '../../capabilities/types.js';

const schema = z.object({
  hookId: z.string(),
  target: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const inject_hook = defineTool<Args, { hookId: string; warnings: string[] }>({
  name: 'inject_hook',
  description: 'Inject a created hook into the page or worker(s). target: "page" | "worker:<realmId>" | "all-workers" (default "page").',
  schema,
  handler: async ({ hookId, target }, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    const opts: InjectOpts = { target: (target ?? 'page') as InjectOpts['target'] };
    const r = await reg.inject(hookId, opts);
    return ok(r);
  },
});
