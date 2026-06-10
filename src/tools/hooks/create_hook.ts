import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { HookRegistry } from '../../capabilities/types.js';

const captureSchema = z.array(z.enum(['args', 'return', 'stack', 'this']));
const schema = z.object({
  name: z.string(),
  targetExpr: z.string(),
  capture: captureSchema,
}).strict();
type Args = z.infer<typeof schema>;

export const create_hook = defineTool<Args, { hookId: string; scriptPreview: string }>({
  name: 'create_hook',
  description: 'Create a hook definition. Use inject_hook to attach it to the page or workers.',
  schema,
  handler: async (args, session) => {
    const reg = session.caps.hookRegistry as HookRegistry;
    const r = reg.create(args);
    return ok(r);
  },
});
