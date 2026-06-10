import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

export interface ListEntry { requestId: string; method: string; url: string; status?: number }

const schema = z.object({
  urlSubstring: z.string().optional(),
  method: z.string().optional(),
  hasResponse: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const list_network_requests = defineTool<Args, { requests: ListEntry[]; totalCount: number }>({
  name: 'list_network_requests',
  description: 'List network requests collected since session start. Filter by URL substring, method, or response presence.',
  schema,
  handler: async (args, session) => {
    const all = session.requests.list();
    const out: ListEntry[] = [];
    for (const e of all) {
      const req = e.req as { method?: string; url?: string } | undefined;
      const res = e.res as { status?: number } | undefined;
      if (args.urlSubstring && !(req?.url ?? '').includes(args.urlSubstring)) continue;
      if (args.method && req?.method !== args.method) continue;
      if (args.hasResponse !== undefined && (!!e.res) !== args.hasResponse) continue;
      out.push({
        requestId: e.requestId,
        method: req?.method ?? '',
        url: req?.url ?? '',
        status: res?.status,
      });
    }
    const limited = args.limit ? out.slice(0, args.limit) : out;
    return ok({ requests: limited, totalCount: out.length });
  },
});
