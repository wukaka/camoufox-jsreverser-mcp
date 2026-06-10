import { RuntimePrefs } from './types.js';
import { PrefsActorUnavailableError } from './errors.js';

/**
 * M2 stub — all methods reject with PrefsActorUnavailableError.
 * M3 wires the real RDP PreferenceActor backing.
 */
export function makeRuntimePrefsStub(): RuntimePrefs {
  const reject = (): Promise<never> => Promise.reject(new PrefsActorUnavailableError());
  return {
    set: reject,
    get: reject,
    resetAll: reject,
  };
}
