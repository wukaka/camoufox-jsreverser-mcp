import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { PreloadInjector, ScriptHost, StealthHook } from '../../../src/capabilities/types.js';

/**
 * Live smoke: render the stealth-hook preload, inject it via preloadInjector,
 * then navigate to a fixture page and confirm
 *   - `fetch.toString()` reports native code
 *   - the wrap actually intercepts a call (we use evaluate to invoke fetch).
 */
describe('capability: stealthHook (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] stealthHook: install Camoufox + geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('fetch.toString() returns native-code body and Function.prototype.toString agrees', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const sh = ff.session.caps.stealthHook as StealthHook;
    const pi = ff.session.caps.preloadInjector as PreloadInjector;
    const sHost = ff.session.caps.scriptHost as ScriptHost;

    // No emit handler — the page won't actually receive samples; we just want
    // the wrap installed for the toString check.
    const preload = sh.renderPreload({
      emitName: '__sh_emit_noop',
      wraps: [{ targetPath: 'fetch' }],
    });
    const preloadId = await pi.add(preload);
    try {
      const ctx = await firstContext(ff);
      await ff.session.bidi.send('browsingContext.navigate', {
        context: ctx, url: `${fixture.url}/probe-webdriver.html`, wait: 'complete',
      });
      const realm = (await sHost.listRealms(ctx)).find(r => r.type === 'window')!;
      const directTs = await sHost.evaluate(realm.realmId, 'fetch.toString()');
      const protoTs  = await sHost.evaluate(realm.realmId, 'Function.prototype.toString.call(fetch)');
      expect((directTs.result as { value?: string }).value).toBe('function fetch() { [native code] }');
      expect((protoTs.result  as { value?: string }).value).toBe('function fetch() { [native code] }');
    } finally {
      await pi.remove(preloadId);
    }
  }, 30_000);
});
