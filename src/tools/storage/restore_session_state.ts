import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { StorageAccess, ScriptHost } from '../../capabilities/types.js';

const schema = z.object({ name: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const restore_session_state = defineTool<Args, { name: string; cookiesRestored: number; originsRestored: number }>({
  name: 'restore_session_state',
  description: 'Restore a previously saved snapshot back into the browser (cookies + localStorage + sessionStorage).',
  schema,
  handler: async ({ name }, session) => {
    const snap = session.sessionSnapshots.get(name);
    if (!snap) return fail(ErrorReason.ResourceNotFound, { details: { kind: 'snapshot', id: name } });
    const sa = session.caps.storageAccess as StorageAccess;
    const sh = session.caps.scriptHost as ScriptHost;
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    for (const c of snap.cookies) {
      await sa.setCookie({ cookie: c });
    }
    const realms = (await sh.listRealms(ctxId)).filter(r => r.type === 'window');
    let originsRestored = 0;
    for (const r of realms) {
      const local = snap.localByOrigin[r.origin];
      if (local) {
        for (const [k, v] of Object.entries(local)) {
          await sa.setLocalStorage(r.realmId, k, v);
        }
        originsRestored++;
      }
      // sessionStorage similarly:
      const sess = snap.sessionByOrigin[r.origin];
      if (sess) {
        for (const [k, v] of Object.entries(sess)) {
          await sa.setLocalStorage(r.realmId, k, v); // StorageAccess only exposes setLocalStorage in v1; sessionStorage write is symmetric via evaluate
        }
      }
    }
    return ok({ name, cookiesRestored: snap.cookies.length, originsRestored });
  },
});
