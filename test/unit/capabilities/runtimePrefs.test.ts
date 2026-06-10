import { describe, it, expect } from 'vitest';
import { makeRuntimePrefsStub } from '../../../src/capabilities/runtimePrefs.js';
import { PrefsActorUnavailableError } from '../../../src/capabilities/errors.js';

describe('runtimePrefs stub', () => {
  it('set() rejects with PrefsActorUnavailableError', async () => {
    const prefs = makeRuntimePrefsStub();
    await expect(prefs.set('network.dns.disabled', true)).rejects.toBeInstanceOf(PrefsActorUnavailableError);
  });

  it('get() rejects with PrefsActorUnavailableError', async () => {
    const prefs = makeRuntimePrefsStub();
    await expect(prefs.get('browser.sessionstore.enabled')).rejects.toBeInstanceOf(PrefsActorUnavailableError);
  });

  it('resetAll() rejects with PrefsActorUnavailableError', async () => {
    const prefs = makeRuntimePrefsStub();
    await expect(prefs.resetAll()).rejects.toBeInstanceOf(PrefsActorUnavailableError);
  });
});

describe('runtimePrefs (real RDP)', () => {
  // helpers
  function makeRdp() {
    const calls: Array<{ actor: string; req: any }> = [];
    const replies: any[] = [];
    return {
      calls,
      queue(reply: any) { replies.push(reply); },
      call: async (actor: string, req: any) => {
        calls.push({ actor, req });
        const r = replies.shift();
        if (r === undefined) return { from: actor };
        if (r instanceof Error) throw r;
        return r;
      },
    };
  }

  it('set snapshots baseline (existing string) then writes new value', async () => {
    const rdp = makeRdp();
    // Baseline lookup: getBoolPref errors, getCharPref returns 'old', getIntPref skipped
    rdp.queue({ from: 'p', error: 'TypeError' });
    rdp.queue({ from: 'p', value: 'old' });
    // Then setCharPref reply (just from: 'p')
    rdp.queue({ from: 'p' });
    const { makeRuntimePrefs } = await import('../../../src/capabilities/runtimePrefs.js');
    const prefs = makeRuntimePrefs(rdp as any, 'pref-actor');
    await prefs.set('my.pref', 'new');
    // 1st call: getBoolPref ; 2nd: getCharPref ; 3rd: setCharPref
    expect(rdp.calls[0]?.req.type).toBe('getBoolPref');
    expect(rdp.calls[1]?.req.type).toBe('getCharPref');
    expect(rdp.calls[2]?.req).toEqual({ type: 'setCharPref', name: 'my.pref', value: 'new' });
  });

  it('set does NOT re-snapshot on subsequent set', async () => {
    const rdp = makeRdp();
    // First call: getBoolPref returns true (baseline = true)
    rdp.queue({ from: 'p', value: true });
    rdp.queue({ from: 'p' }); // setBoolPref
    rdp.queue({ from: 'p' }); // second setBoolPref (no new baseline lookup)
    const { makeRuntimePrefs } = await import('../../../src/capabilities/runtimePrefs.js');
    const prefs = makeRuntimePrefs(rdp as any, 'p');
    await prefs.set('foo.bar', false);
    await prefs.set('foo.bar', true);
    const lookupCalls = rdp.calls.filter(c => c.req.type.startsWith('get'));
    expect(lookupCalls).toHaveLength(1);
  });

  it('resetAll writes baseline back; clears when baseline was null', async () => {
    const rdp = makeRdp();
    // baseline lookup for key1: bool=true
    rdp.queue({ from: 'p', value: true });
    rdp.queue({ from: 'p' }); // setBoolPref(key1, false)
    // baseline lookup for key2: all three fail → baseline = null
    rdp.queue({ from: 'p', error: 'x' });
    rdp.queue({ from: 'p', error: 'x' });
    rdp.queue({ from: 'p', error: 'x' });
    rdp.queue({ from: 'p' }); // setCharPref(key2, 'X')
    // resetAll
    rdp.queue({ from: 'p' }); // setBoolPref(key1, true)
    rdp.queue({ from: 'p' }); // clearUserPref(key2)
    const { makeRuntimePrefs } = await import('../../../src/capabilities/runtimePrefs.js');
    const prefs = makeRuntimePrefs(rdp as any, 'p');
    await prefs.set('key1', false);
    await prefs.set('key2', 'X');
    await prefs.resetAll();
    const last2 = rdp.calls.slice(-2);
    expect(last2[0]?.req).toEqual({ type: 'setBoolPref', name: 'key1', value: true });
    expect(last2[1]?.req).toEqual({ type: 'clearUserPref', name: 'key2' });
  });

  it('get tries bool → char → int and returns first success', async () => {
    const rdp = makeRdp();
    rdp.queue({ from: 'p', error: 'wrongType' });
    rdp.queue({ from: 'p', value: 'string-pref' });
    const { makeRuntimePrefs } = await import('../../../src/capabilities/runtimePrefs.js');
    const prefs = makeRuntimePrefs(rdp as any, 'p');
    const v = await prefs.get('x');
    expect(v).toBe('string-pref');
  });

  it('get returns null when all types fail', async () => {
    const rdp = makeRdp();
    rdp.queue({ from: 'p', error: 'e' });
    rdp.queue({ from: 'p', error: 'e' });
    rdp.queue({ from: 'p', error: 'e' });
    const { makeRuntimePrefs } = await import('../../../src/capabilities/runtimePrefs.js');
    const prefs = makeRuntimePrefs(rdp as any, 'p');
    expect(await prefs.get('does.not.exist')).toBeNull();
  });
});
