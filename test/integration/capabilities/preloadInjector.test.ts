import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { PreloadInjector, ScriptHost } from '../../../src/capabilities/types.js';

describe('capability: preloadInjector (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] preloadInjector: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('preload script runs before page scripts in newly navigated page', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const pi = ff.session.caps.preloadInjector as PreloadInjector;
    const sh = ff.session.caps.scriptHost as ScriptHost;

    const preloadId = await pi.add('() => { window.__preloadInjMarker = "before"; }');
    try {
      const ctx = await firstContext(ff);
      await ff.session.bidi.send('browsingContext.navigate', {
        context: ctx, url: `${fixture.url}/probe-webdriver.html`, wait: 'complete',
      });
      const realms = await sh.listRealms(ctx);
      const realmId = realms.find(r => r.type === 'window')!.realmId;
      const got = await sh.evaluate(realmId, 'window.__preloadInjMarker');
      expect((got.result as { value?: string }).value).toBe('before');
    } finally {
      await pi.remove(preloadId);
    }
  }, 30_000);
});
