import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, type LiveSession } from './_setup.js';
import type { RuntimePrefs } from '../../../src/capabilities/types.js';

// runtimePrefs needs a real RDP PreferenceActor; Session.init currently only wires
// the stub. Re-enable when bootstrapRdp + makeRuntimePrefs(rdp, prefActor) is wired.
describe.skip('capability: runtimePrefs (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] runtimePrefs: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('set + get round-trip a session-scoped boolean pref', async () => {
    if (!live) return;
    const { ff } = live;
    await ff.session.ensureRdp();
    const rp = ff.session.caps.runtimePrefs as RuntimePrefs;

    await rp.set('dom.webdriver.enabled', false);
    expect(await rp.get('dom.webdriver.enabled')).toBe(false);

    await rp.set('dom.webdriver.enabled', true);
    expect(await rp.get('dom.webdriver.enabled')).toBe(true);

    // resetAll should restore session-touched prefs (no assertion beyond not throwing —
    // spec says cross-session restoration is verified in shutdown).
    await rp.resetAll();
  }, 30_000);
});
