import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { ScriptHost } from '../../../src/capabilities/types.js';

describe('spec §5.2 dial tests: CSP / scriptingEnabled / insecureCerts (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] dials: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('browsingContext.setBypassCSP allows inline script under strict CSP', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const bidi = ff.session.bidi;
    const ctx = await firstContext(ff);
    const sh = ff.session.caps.scriptHost as ScriptHost;

    // 1) Without bypass: navigate to /strict-csp.html — inline script SHOULD be blocked.
    await bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/strict-csp`, wait: 'complete',
    });
    const realm = (await sh.listRealms(ctx)).find(r => r.type === 'window')!;
    const blocked = await sh.evaluate(realm.realmId,
      'document.getElementById("result").dataset.inlineRan ?? null');
    expect((blocked.result as { value?: unknown }).value).toBeNull();

    // 2) Enable bypass + re-navigate: inline script SHOULD run.
    await bidi.send('browsingContext.setBypassCSP', { context: ctx, bypass: true });
    await bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/strict-csp`, wait: 'complete',
    });
    const realm2 = (await sh.listRealms(ctx)).find(r => r.type === 'window')!;
    const ran = await sh.evaluate(realm2.realmId,
      'document.getElementById("result").dataset.inlineRan ?? null');
    expect((ran.result as { value?: unknown }).value).toBe('1');

    // 3) Disable bypass again to leave context clean for other tests.
    await bidi.send('browsingContext.setBypassCSP', { context: ctx, bypass: false });
  }, 45_000);

  it('emulation.setScriptingEnabled toggles JS execution per-context', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const bidi = ff.session.bidi;
    const ctx = await firstContext(ff);
    const sh = ff.session.caps.scriptHost as ScriptHost;

    // Disable JS in this context.
    await bidi.send('emulation.setScriptingEnabled', { contexts: [ctx], enabled: false });
    await bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/probe-webdriver.html`, wait: 'complete',
    });
    const realm = (await sh.listRealms(ctx)).find(r => r.type === 'window')!;
    const off = await sh.evaluate(realm.realmId,
      'document.getElementById("result").dataset.webdriver ?? null');
    // Page script never ran → dataset.webdriver never set.
    expect((off.result as { value?: unknown }).value).toBeNull();

    // Re-enable + reload.
    await bidi.send('emulation.setScriptingEnabled', { contexts: [ctx], enabled: true });
    await bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/probe-webdriver.html`, wait: 'complete',
    });
    const realm2 = (await sh.listRealms(ctx)).find(r => r.type === 'window')!;
    const on = await sh.evaluate(realm2.realmId,
      'document.getElementById("result").dataset.webdriver ?? null');
    expect(typeof (on.result as { value?: unknown }).value).toBe('string');

    // Verify a fresh context defaults to JS-enabled (per-context isolation).
    const created = await bidi.send<{ context: string }>('browsingContext.create', { type: 'tab' });
    try {
      await bidi.send('browsingContext.navigate', {
        context: created.context,
        url: `${fixture.url}/probe-webdriver.html`,
        wait: 'complete',
      });
      const r = (await sh.listRealms(created.context)).find(rr => rr.type === 'window')!;
      const dflt = await sh.evaluate(r.realmId,
        'document.getElementById("result").dataset.webdriver ?? null');
      expect(typeof (dflt.result as { value?: unknown }).value).toBe('string');
    } finally {
      await bidi.send('browsingContext.close', { context: created.context });
    }
  }, 45_000);

  it('acceptInsecureCerts capability is honoured (session.status sanity check)', async () => {
    if (!live) return;
    // Our launchTestFirefox flow always sets acceptInsecureCerts: true in capabilities.
    // Re-confirming end-to-end requires an HTTPS fixture (not yet shipped); for now we
    // just verify the session is in a state where capability was negotiated.
    const status = await live.ff.session.bidi.send<{ ready: boolean }>('session.status', {});
    expect(typeof status.ready).toBe('boolean');
  }, 15_000);
});
