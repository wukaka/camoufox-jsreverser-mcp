import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { WsObserver, ScriptHost } from '../../../src/capabilities/types.js';

describe('capability: wsObserver (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] wsObserver: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('listConnections reports the fixture page WebSocket', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const ws = ff.session.caps.wsObserver as WsObserver;
    const sh = ff.session.caps.scriptHost as ScriptHost;

    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-ws.html`, wait: 'complete',
    });
    const realm = (await sh.listRealms(ctx)).find(r => r.type === 'window')!;
    // Trigger Connect + Send via DOM clicks (the page wires both to buttons).
    await sh.evaluate(realm.realmId, 'document.getElementById("connect").click()');
    // Give Firefox a moment to open the WS + fire the handshake event.
    await new Promise(r => setTimeout(r, 800));
    await sh.evaluate(realm.realmId, 'document.getElementById("send").click()');
    await new Promise(r => setTimeout(r, 500));

    const conns = ws.listConnections({ urlSubstring: '/ws' });
    expect(conns.length).toBeGreaterThan(0);
  }, 30_000);
});
