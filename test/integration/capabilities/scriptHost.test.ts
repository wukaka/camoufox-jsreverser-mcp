import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { ScriptHost } from '../../../src/capabilities/types.js';

describe('capability: scriptHost (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] scriptHost: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('listRealms returns at least one window realm after navigation', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/probe-webdriver.html`, wait: 'complete',
    });
    const sh = ff.session.caps.scriptHost as ScriptHost;
    const realms = await sh.listRealms(ctx);
    expect(realms.length).toBeGreaterThan(0);
    expect(realms.some(r => r.type === 'window')).toBe(true);
  }, 30_000);

  it('evaluate / callFunction return the expected JS values', async () => {
    if (!live) return;
    const { ff } = live;
    const sh = ff.session.caps.scriptHost as ScriptHost;
    const ctx = await firstContext(ff);
    const realms = await sh.listRealms(ctx);
    const realmId = realms.find(r => r.type === 'window')!.realmId;

    const evalRes = await sh.evaluate(realmId, '40 + 2');
    expect((evalRes.result as { value?: number }).value).toBe(42);

    const callRes = await sh.callFunction(realmId, '(a, b) => a * b',
      [{ type: 'number', value: 6 }, { type: 'number', value: 7 }]);
    expect((callRes.result as { value?: number }).value).toBe(42);
  }, 30_000);
});
