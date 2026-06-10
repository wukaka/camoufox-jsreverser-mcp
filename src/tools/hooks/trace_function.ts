import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry, InjectOpts } from '../../capabilities/types.js';

const schema = z.object({
  name: z.string(),
  targetExpr: z.string(),
  target: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const trace_function = defineTool<Args, { hookId: string; warnings: string[] }>({
  name: 'trace_function',
  description: 'Trace a function: hook with capture preset [args, return, stack]. Convenience wrapper for call-chain debugging.',
  schema,
  handler: async ({ name, targetExpr, target }, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    const created = reg.create({
      name,
      targetExpr,
      capture: ['args', 'return', 'stack'],
    });
    const opts: InjectOpts = { target: (target ?? 'page') as InjectOpts['target'] };
    const injected = await reg.inject(created.hookId, opts);
    return ok({ hookId: created.hookId, warnings: injected.warnings });
  },
});
