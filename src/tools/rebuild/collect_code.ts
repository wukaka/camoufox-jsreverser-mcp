import { z } from 'zod';
import { createHash } from 'node:crypto';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { ScriptHost } from '../../capabilities/types.js';

const schema = z.object({
  urls: z.array(z.string()).optional(),
  urlSubstring: z.string().optional(),
  maxScripts: z.number().int().positive().optional(),
}).strict();
type Args = z.infer<typeof schema>;

const LIST_SCRIPT = `(() => {
  return performance.getEntriesByType('resource')
    .filter(e => e.initiatorType === 'script' || e.name.endsWith('.js') || e.name.endsWith('.mjs'))
    .map(e => e.name);
})()`;

export interface CollectResult {
  collected: Array<{ url: string; hash: string; bytes: number; fromCache: boolean }>;
  skipped: Array<{ url: string; reason: string }>;
}

export const collect_code = defineTool<Args, CollectResult>({
  name: 'collect_code',
  description: 'Fetch and cache the source of every script URL on the active page. If urls/urlSubstring given, only those are collected.',
  schema,
  handler: async ({ urls, urlSubstring, maxScripts }: Args, session) => {
    const sh = session.caps.scriptHost as ScriptHost | undefined;
    if (!sh) return fail(ErrorReason.CapabilityUnavailable, { hint: 'scriptHost not wired.' });
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const realms = await sh.listRealms(ctxId);
    const realm = realms.find(r => r.type === 'window');
    if (!realm) return fail(ErrorReason.TargetNotFound, { hint: 'No window realm.' });

    let targets: string[];
    if (urls && urls.length > 0) {
      targets = urls;
    } else {
      const listResult = await sh.evaluate(realm.realmId, LIST_SCRIPT, { awaitPromise: false });
      targets = ((listResult.result as { value?: string[] })?.value) ?? [];
    }
    if (urlSubstring) targets = targets.filter(u => u.includes(urlSubstring));
    const cap = maxScripts ?? 200;
    targets = targets.slice(0, cap);

    const collected: CollectResult['collected'] = [];
    const skipped: CollectResult['skipped'] = [];

    for (const url of targets) {
      const cached = session.scripts.list().find(s => s.url === url);
      if (cached) {
        collected.push({ url, hash: cached.hash, bytes: cached.source.length, fromCache: true });
        continue;
      }
      const r = await sh.callFunction(
        realm.realmId,
        '(u) => fetch(u, { credentials: "same-origin" }).then(r => r.text())',
        [{ type: 'string', value: url }],
        { awaitPromise: true },
      );
      if (r.exceptionDetails) {
        const text = (r.exceptionDetails as { text?: string }).text ?? 'unknown';
        skipped.push({ url, reason: text });
        continue;
      }
      const source = (r.result as { value?: string })?.value ?? '';
      const hash = createHash('sha1').update(source).digest('hex').slice(0, 12);
      session.scripts.put({ id: `script-${hash}`, url, source, hash });
      collected.push({ url, hash, bytes: source.length, fromCache: false });
    }

    return ok({ collected, skipped });
  },
});
