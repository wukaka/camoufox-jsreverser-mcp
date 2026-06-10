import { describe, it, expect, vi } from 'vitest';
import { get_storage } from '../../../../src/tools/storage/get_storage.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('get_storage', () => {
  it('returns all storage when no filter', async () => {
    const sa = {
      getCookies: vi.fn().mockResolvedValue({ cookies: [{ name: 'c1', value: 'v1' }] }),
      getLocalStorage: vi.fn().mockResolvedValue({ k1: 'v1' }),
      getSessionStorage: vi.fn().mockResolvedValue({ s1: 'sv1' }),
      listIndexedDbNames: vi.fn().mockResolvedValue(['mydb']),
    };
    const sh = { listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]) };
    const session = { isReady: () => true, caps: { storageAccess: sa, scriptHost: sh }, activeContextId: 'c1' } as any;
    const r = await executeTool(get_storage, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.cookies).toHaveLength(1);
      expect(r.data.localStorage).toEqual({ k1: 'v1' });
      expect(r.data.indexedDbNames).toEqual(['mydb']);
    }
  });
});
