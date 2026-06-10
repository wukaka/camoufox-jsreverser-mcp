import { RdpDriver } from '../drivers/rdp/RdpDriver.js';
import { RuntimePrefs } from './types.js';
import { PrefsActorUnavailableError } from './errors.js';

/**
 * M2 stub — all methods reject with PrefsActorUnavailableError.
 * Kept as fallback when RDP PreferenceActor is unavailable (used by M3.10 tools).
 */
export function makeRuntimePrefsStub(): RuntimePrefs {
  const reject = (): Promise<never> => Promise.reject(new PrefsActorUnavailableError());
  return {
    set: reject,
    get: reject,
    resetAll: reject,
  };
}

interface PrefReply { from: string; value?: boolean | string | number; error?: string }

async function getValueByType(
  rdp: RdpDriver,
  actor: string,
  key: string,
): Promise<boolean | string | number | null> {
  // Try in order: bool, char, int. First successful response wins.
  const types = ['getBoolPref', 'getCharPref', 'getIntPref'] as const;
  for (const t of types) {
    const reply = await rdp
      .call<PrefReply>(actor, { type: t, value: key })
      .catch((e: unknown) => ({ error: String(e) } as PrefReply));
    if (!reply.error && reply.value !== undefined) return reply.value;
  }
  return null;
}

/**
 * Real RDP-backed RuntimePrefs using the Firefox PreferenceActor.
 *
 * Baseline tracking: the first `set` for a key snapshots the current value.
 * Subsequent `set` calls for the same key do NOT overwrite the baseline.
 * `resetAll` restores every snapshotted key to its baseline then clears the map.
 */
export function makeRuntimePrefs(rdp: RdpDriver, prefActor: string): RuntimePrefs {
  // Baseline cache: first-set snapshot per key. null means "not present (use clearUserPref)".
  const baselines = new Map<string, boolean | string | number | null>();

  return {
    async set(key: string, value: string | number | boolean): Promise<void> {
      if (!baselines.has(key)) {
        const current = await getValueByType(rdp, prefActor, key);
        baselines.set(key, current);
      }
      const t = typeof value;
      const cmd =
        t === 'boolean' ? 'setBoolPref' :
        t === 'string'  ? 'setCharPref' :
        t === 'number'  ? 'setIntPref'  : null;
      if (!cmd) throw new Error(`runtimePrefs.set: unsupported value type ${t}`);
      await rdp.call(prefActor, { type: cmd, name: key, value });
    },

    async get(key: string): Promise<string | number | boolean | null> {
      return getValueByType(rdp, prefActor, key);
    },

    async resetAll(): Promise<void> {
      for (const [key, baseline] of baselines.entries()) {
        if (baseline === null) {
          await rdp.call(prefActor, { type: 'clearUserPref', name: key });
        } else {
          const t = typeof baseline;
          const cmd =
            t === 'boolean' ? 'setBoolPref' :
            t === 'string'  ? 'setCharPref' :
            t === 'number'  ? 'setIntPref'  : null;
          if (!cmd) continue;
          await rdp.call(prefActor, { type: cmd, name: key, value: baseline });
        }
      }
      baselines.clear();
    },
  };
}
