import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { StorageAccess, ScriptHost } from '../../capabilities/types.js';

const schema = z.object({}).strict();

export const get_storage = defineTool({
  name: 'get_storage',
  description: 'Read cookies, localStorage, sessionStorage, and IndexedDB names for the active page.',
  schema,
  handler: async (_args, session) => {
    const sa = session.caps.storageAccess as StorageAccess;
    const sh = session.caps.scriptHost as ScriptHost;
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const realms = await sh.listRealms(ctxId);
    const realm = realms.find(r => r.type === 'window');
    if (!realm) return fail(ErrorReason.TargetNotFound, { hint: 'No window realm.' });
    const { cookies } = await sa.getCookies();
    const localStorage = await sa.getLocalStorage(realm.realmId);
    const sessionStorage = await sa.getSessionStorage(realm.realmId);
    const indexedDbNames = await sa.listIndexedDbNames(realm.realmId);
    return ok({ cookies, localStorage, sessionStorage, indexedDbNames });
  },
});
