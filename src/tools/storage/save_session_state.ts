import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { StorageAccess, ScriptHost } from '../../capabilities/types.js';

const schema = z.object({ name: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const save_session_state = defineTool<Args, { name: string; capturedAt: number; cookieCount: number; originCount: number }>({
  name: 'save_session_state',
  description: 'Snapshot cookies + localStorage + sessionStorage of all known window realms into an in-memory snapshot.',
  schema,
  handler: async ({ name }, session) => {
    const sa = session.caps.storageAccess as StorageAccess;
    const sh = session.caps.scriptHost as ScriptHost;
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const { cookies } = await sa.getCookies();
    const realms = (await sh.listRealms(ctxId)).filter(r => r.type === 'window');
    const localByOrigin: Record<string, Record<string, string>> = {};
    const sessionByOrigin: Record<string, Record<string, string>> = {};
    for (const r of realms) {
      localByOrigin[r.origin] = await sa.getLocalStorage(r.realmId);
      sessionByOrigin[r.origin] = await sa.getSessionStorage(r.realmId);
    }
    const capturedAt = Date.now();
    session.sessionSnapshots.set(name, { name, capturedAt, cookies, localByOrigin, sessionByOrigin });
    return ok({ name, capturedAt, cookieCount: cookies.length, originCount: realms.length });
  },
});
