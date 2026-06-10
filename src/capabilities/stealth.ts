import { FIREFOX_DEFAULT_STEALTH } from '../stealth-scripts/firefox-default.js';
import type { PreloadInjector, Stealth, StealthFeature, StealthPreset } from './types.js';

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

export function makeStealth(preload: PreloadInjector): Stealth {
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
  };
}
