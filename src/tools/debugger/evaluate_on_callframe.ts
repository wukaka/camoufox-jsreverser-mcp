import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PauseController, CallframeResult } from '../../capabilities/types.js';

const schema = z.object({
  expression: z.string(),
}).strict();
type Args = z.infer<typeof schema>;

export const evaluate_on_callframe = defineTool<Args, CallframeResult>({
  name: 'evaluate_on_callframe',
  description: 'Evaluate a JavaScript expression in the context of the current paused callframe. Throws if not paused.',
  schema,
  handler: async ({ expression }, session) => {
    const pc = session.caps.pauseController as PauseController;
    const result = await pc.evaluateOnCallframe(expression);
    return ok(result);
  },
});
