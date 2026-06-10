import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { ScriptHost, StorageAccess } from './types.js';

export function makeStorageAccess(bidi: BidiDriver, scripts: ScriptHost): StorageAccess {
  return {
    async getCookies(params) {
      return await bidi.send('storage.getCookies', params ?? {}) as { cookies: object[]; partitionKey?: object };
    },

    async setCookie(params) {
      return await bidi.send('storage.setCookie', params) as { partitionKey?: object };
    },

    async deleteCookies(params) {
      return await bidi.send('storage.deleteCookies', params ?? {}) as { partitionKey?: object };
    },

    async getLocalStorage(realmId) {
      const r = await scripts.evaluate(
        realmId,
        '(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) o[k] = localStorage.getItem(k); } return o; })()',
        { awaitPromise: false },
      );
      return (r.result as { value: Record<string, string> })?.value ?? {};
    },

    async setLocalStorage(realmId, key, value) {
      await scripts.evaluate(
        realmId,
        `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`,
        { awaitPromise: false },
      );
    },

    async getSessionStorage(realmId) {
      const r = await scripts.evaluate(
        realmId,
        '(() => { const o = {}; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k) o[k] = sessionStorage.getItem(k); } return o; })()',
        { awaitPromise: false },
      );
      return (r.result as { value: Record<string, string> })?.value ?? {};
    },

    async listIndexedDbNames(realmId) {
      const r = await scripts.evaluate(
        realmId,
        '(async () => { const dbs = await indexedDB.databases(); return dbs.map(d => d.name).filter(Boolean); })()',
        { awaitPromise: true },
      );
      return (r.result as { value: string[] })?.value ?? [];
    },
  };
}
