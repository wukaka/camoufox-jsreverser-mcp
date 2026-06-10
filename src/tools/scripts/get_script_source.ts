import { z } from 'zod';
import { createHash } from 'node:crypto';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { ScriptHost } from '../../capabilities/types.js';

const schema = z.object({ url: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const get_script_source = defineTool<Args, { source: string; url: string; fromCache: boolean; hash: string }>({
  name: 'get_script_source',
  description: 'Get the source of a script by URL. Fetches via the page (BiDi limitation; CORS may block cross-origin). Cached.',
  schema,
  handler: async ({ url }: Args, session) => {
    // Check cache first
    const cached = session.scripts.list().find(s => s.url === url);
    if (cached) return ok({ source: cached.source, url, fromCache: true, hash: cached.hash });

    const sh = session.caps.scriptHost as ScriptHost;
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const realms = await sh.listRealms(ctxId);
    const realm = realms.find(r => r.type === 'window');
    if (!realm) return fail(ErrorReason.TargetNotFound, { hint: 'No window realm.' });

    const r = await sh.callFunction(
      realm.realmId,
      '(u) => fetch(u, { credentials: "same-origin" }).then(r => r.text())',
      [{ type: 'string', value: url }],
      { awaitPromise: true },
    );
    if (r.exceptionDetails) {
      const text = (r.exceptionDetails as { text?: string }).text ?? 'unknown';
      return fail(ErrorReason.ScriptNotCollectedYet, { hint: `Fetch failed: ${text} (CORS or 404?). Use M3 RDP for cross-origin sources.` });
    }
    const source = (r.result as { value?: string })?.value ?? '';
    const hash = createHash('sha1').update(source).digest('hex').slice(0, 12);
    const id = `script-${hash}`;
    session.scripts.put({ id, url, source, hash });
    return ok({ source, url, fromCache: false, hash });
  },
});
