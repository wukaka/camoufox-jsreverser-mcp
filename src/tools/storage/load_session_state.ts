import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

const schema = z.object({ name: z.string(), json: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const load_session_state = defineTool<Args, { name: string }>({
  name: 'load_session_state',
  description: 'Load a snapshot from a JSON string (previously produced by dump_session_state).',
  schema,
  handler: async ({ name, json }, session) => {
    let parsed: { name?: string; capturedAt?: number; cookies?: object[]; localByOrigin?: Record<string, Record<string, string>>; sessionByOrigin?: Record<string, Record<string, string>> };
    try { parsed = JSON.parse(json); } catch (e) {
      return fail(ErrorReason.BadArgs, { hint: `Invalid JSON: ${(e as Error).message}` });
    }
    session.sessionSnapshots.set(name, {
      name,
      capturedAt: parsed.capturedAt ?? Date.now(),
      cookies: parsed.cookies ?? [],
      localByOrigin: parsed.localByOrigin ?? {},
      sessionByOrigin: parsed.sessionByOrigin ?? {},
    });
    return ok({ name });
  },
});
