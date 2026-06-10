import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { ScriptHost } from '../../capabilities/types.js';

const LIST_SCRIPT = `(() => {
  return performance.getEntriesByType('resource')
    .filter(e => e.initiatorType === 'script' || e.name.endsWith('.js') || e.name.endsWith('.mjs'))
    .map(e => ({ url: e.name, transferSize: e.transferSize ?? 0, duration: e.duration ?? 0 }));
})()`;

type ScriptInfo = { url: string; transferSize: number; duration: number };

export const list_scripts = defineTool<Record<string, never>, { scripts: ScriptInfo[] }>({
  name: 'list_scripts',
  description: 'List script resources loaded on the active page (URL + size). Does not include inline <script> blocks; M3 RDP version will.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const sh = session.caps.scriptHost as ScriptHost;
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const realms = await sh.listRealms(ctxId);
    const realm = realms.find(r => r.type === 'window');
    if (!realm) return fail(ErrorReason.TargetNotFound, { hint: 'No window realm.' });
    const r = await sh.evaluate(realm.realmId, LIST_SCRIPT, { awaitPromise: false });
    type ScriptInfoRaw = { url?: string; transferSize?: number; duration?: number };
    const raw = ((r.result as { value?: ScriptInfoRaw[] })?.value) ?? [];
    const scripts = raw.map(e => ({
      url: e.url ?? '',
      transferSize: e.transferSize ?? 0,
      duration: e.duration ?? 0,
    }));
    return ok({ scripts });
  },
});
