import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeStorageAccess } from '../../../src/capabilities/storageAccess.js';
import type { ScriptHost } from '../../../src/capabilities/types.js';

function fakeBidi() {
  const ee = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn> };
  ee.send = vi.fn().mockResolvedValue({});
  return ee;
}

function fakeScripts(): ScriptHost & { evaluate: ReturnType<typeof vi.fn>; callFunction: ReturnType<typeof vi.fn> } {
  return {
    listRealms: vi.fn().mockResolvedValue([]),
    evaluate: vi.fn().mockResolvedValue({ result: { value: {} } }),
    callFunction: vi.fn().mockResolvedValue({ result: { value: null } }),
  };
}

describe('storageAccess', () => {
  it('getCookies forwards to storage.getCookies and returns result', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    const cookies = [{ name: 'session', value: 'abc' }];
    bidi.send.mockResolvedValueOnce({ cookies });
    const access = makeStorageAccess(bidi as any, scripts);
    const result = await access.getCookies({ filter: { name: 'session' } });
    expect(result.cookies).toEqual(cookies);
    expect(bidi.send).toHaveBeenCalledWith('storage.getCookies', { filter: { name: 'session' } });
  });

  it('setCookie forwards to storage.setCookie', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    bidi.send.mockResolvedValueOnce({ partitionKey: { sourceOrigin: 'https://example.com' } });
    const access = makeStorageAccess(bidi as any, scripts);
    const r = await access.setCookie({ cookie: { name: 'x', value: '1', domain: 'example.com' } });
    expect(bidi.send).toHaveBeenCalledWith('storage.setCookie', {
      cookie: { name: 'x', value: '1', domain: 'example.com' },
    });
    expect((r as any).partitionKey?.sourceOrigin).toBe('https://example.com');
  });

  it('deleteCookies forwards to storage.deleteCookies', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    bidi.send.mockResolvedValueOnce({});
    const access = makeStorageAccess(bidi as any, scripts);
    await access.deleteCookies({ filter: { name: 'session' } });
    expect(bidi.send).toHaveBeenCalledWith('storage.deleteCookies', { filter: { name: 'session' } });
  });

  it('getLocalStorage evaluates a script on the given realm and returns key/value map', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    scripts.evaluate.mockResolvedValueOnce({ result: { value: { theme: 'dark', lang: 'en' } } });
    const access = makeStorageAccess(bidi as any, scripts);
    const data = await access.getLocalStorage('realm-1');
    expect(data).toEqual({ theme: 'dark', lang: 'en' });
    expect(scripts.evaluate).toHaveBeenCalledWith(
      'realm-1',
      expect.stringContaining('localStorage'),
      { awaitPromise: false },
    );
  });

  it('setLocalStorage evaluates JSON.stringify-safe key+value', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    const access = makeStorageAccess(bidi as any, scripts);
    await access.setLocalStorage('realm-2', 'foo', 'bar');
    expect(scripts.evaluate).toHaveBeenCalledWith(
      'realm-2',
      expect.stringContaining('"foo"'),
      { awaitPromise: false },
    );
  });

  it('listIndexedDbNames uses awaitPromise:true and returns array', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    scripts.evaluate.mockResolvedValueOnce({ result: { value: ['db1', 'db2'] } });
    const access = makeStorageAccess(bidi as any, scripts);
    const names = await access.listIndexedDbNames('realm-3');
    expect(names).toEqual(['db1', 'db2']);
    expect(scripts.evaluate).toHaveBeenCalledWith(
      'realm-3',
      expect.stringContaining('indexedDB'),
      { awaitPromise: true },
    );
  });
});
