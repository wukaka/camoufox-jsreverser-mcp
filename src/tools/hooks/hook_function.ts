import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry, InjectOpts } from '../../capabilities/types.js';

const schema = z.object({
  name: z.string(),
  targetExpr: z.string(),
  capture: z.array(z.enum(['args', 'return', 'stack', 'this'])),
  target: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const hook_function = defineTool<Args, { hookId: string; warnings: string[]; scriptPreview: string }>({
  name: 'hook_function',
  description: 'Create and inject a hook in one call. Convenience wrapper around create_hook + inject_hook.',
  schema,
  handler: async ({ name, targetExpr, capture, target }, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    const created = reg.create({ name, targetExpr, capture });
    const opts: InjectOpts = { target: (target ?? 'page') as InjectOpts['target'] };
    const injected = await reg.inject(created.hookId, opts);
    return ok({
      hookId: created.hookId,
      warnings: injected.warnings,
      scriptPreview: created.scriptPreview,
    });
  },
});
