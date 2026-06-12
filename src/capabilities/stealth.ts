import { FIREFOX_DEFAULT_STEALTH } from '../stealth-scripts/firefox-default.js';
import { StealthWorkersUnavailableError } from './errors.js';
import type {
  ApplyPresetToWorkersOpts,
  PreloadInjector,
  Stealth,
  StealthFeature,
  StealthPreset,
  WorkerInfo,
  WorkerStealthInjection,
  WorkerTopology,
} from './types.js';

const FEATURES: StealthFeature[] = [
  { name: 'webdriver_false', description: 'Override navigator.webdriver to false' },
  { name: 'cleanup_marker_globals', description: 'Delete __webdriver_* / cdc_* globals' },
  { name: 'languages_override', description: 'Set navigator.languages to ["en-US","en"]' },
  { name: 'permissions_notifications_denied', description: 'Force notifications permission to denied' },
  { name: 'chrome_stub', description: 'Define window.chrome = { runtime: {} } when missing' },
];

const PRESETS: StealthPreset[] = [
  {
    name: 'firefox-default',
    description: 'Baseline stealth preset for Firefox: hides webdriver, cleans driver markers, normalizes navigator surface.',
    features: ['webdriver_false', 'cleanup_marker_globals', 'languages_override', 'permissions_notifications_denied', 'chrome_stub'],
  },
];

const PRESET_PAYLOADS: Record<string, string> = {
  'firefox-default': FIREFOX_DEFAULT_STEALTH,
};

/**
 * `workers` is an accessor, not a fixed reference, because Session swaps the
 * topology implementation between BiDi-only and RDP-aware at ensureRdp time.
 * Reading it lazily lets a single `stealth` instance pick up the live handle.
 */
export function makeStealth(
  preload: PreloadInjector,
  workers?: () => WorkerTopology | undefined,
): Stealth {
  return {
    listFeatures() { return FEATURES.slice(); },
    listPresets() { return PRESETS.slice(); },
    async applyPreset(presetName) {
      const payload = PRESET_PAYLOADS[presetName];
      if (!payload) throw new Error(`stealth: unknown preset ${presetName}`);
      const preloadId = await preload.add(payload);
      return { preset: presetName, preloadIds: [preloadId] };
    },
    async injectCustomScript(source) {
      const preloadId = await preload.add(source);
      return { preloadId };
    },
    async applyPresetToWorkers(presetName, opts) {
      const payload = PRESET_PAYLOADS[presetName];
      if (!payload) throw new Error(`stealth: unknown preset ${presetName}`);

      const topology = workers?.();
      if (!topology) throw new StealthWorkersUnavailableError();

      const watch = opts?.watch ?? true;
      const alreadyInjected = new Set<string>();
      const injected: string[] = [];
      const failed: { realmId: string; reason: string }[] = [];

      const current = await topology.listWorkers();
      const candidates = current.filter((w: WorkerInfo) => w.type === 'worker');

      await Promise.allSettled(candidates.map(async (w: WorkerInfo) => {
        try {
          await preload.addToWorker(payload, w.realmId);
          injected.push(w.realmId);
          alreadyInjected.add(w.realmId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failed.push({ realmId: w.realmId, reason: msg });
        }
      }));

      let unwatch = (): void => { /* no-op */ };
      if (watch) {
        unwatch = topology.onWorkerAvailable((w: WorkerInfo) => {
          if (w.type !== 'worker') return;
          if (alreadyInjected.has(w.realmId)) return;
          alreadyInjected.add(w.realmId);
          void preload.addToWorker(payload, w.realmId).catch(() => { /* best-effort */ });
        });
      }

      const result: WorkerStealthInjection = {
        injected,
        failed,
        injectedAt: 'post-start',
        watching: watch,
        unwatch,
      };
      return result;
    },
  };
}
