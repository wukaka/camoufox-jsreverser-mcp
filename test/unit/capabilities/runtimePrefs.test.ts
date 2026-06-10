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
