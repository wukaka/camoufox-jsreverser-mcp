import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

const schema = z.object({
  limit: z.number().int().positive().optional(),
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const list_console_messages = defineTool<Args, { messages: unknown[]; totalCount: number }>({
  name: 'list_console_messages',
  description: 'Return console log entries from the active session. Optionally limit and filter by level.',
  schema,
  handler: async ({ limit, level }, session) => {
    let all = session.consoleRing.list();
    if (level) all = all.filter((m: any) => m?.level === level);
    const limited = limit ? all.slice(-limit) : all;
    return ok({ messages: limited, totalCount: all.length });
  },
});
