import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';

describe('capability: networkObserver (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] networkObserver: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('Session.requests pool captures fixture page requests', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-xhr-pause.html`, wait: 'complete',
    });

    // Allow the dispatcher a tick to flush any queued network events.
    await new Promise(r => setTimeout(r, 200));
    const urls = ff.session.requests.list().map(e => {
      const r = e.req as { url?: string };
      return r?.url ?? '';
    });
    expect(urls.some(u => u.endsWith('/fixture-xhr-pause.html'))).toBe(true);
    expect(urls.some(u => u.endsWith('/sign.js'))).toBe(true);
  }, 30_000);
});
