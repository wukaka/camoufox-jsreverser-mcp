import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchTestFirefox, type TestFirefox } from '../helpers/firefox.js';
import { startFixtureServer, type FixtureServer } from '../fixtures/server.js';
import type { BidiDriver } from '../../../src/drivers/bidi/BidiDriver.js';

/** Spec §5.2 Layer 2 — real Firefox BiDi protocol surface.
 *  Skipped automatically when Firefox / geckodriver are missing. */
describe('BiDi driver integration', () => {
  let ff: TestFirefox | null = null;
  let fixture: FixtureServer;
  let bidi: BidiDriver;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    ff = await launchTestFirefox({ stealth: 'off' });
    if (!ff) {
      console.warn('[skip] BiDi integration: install geckodriver and Firefox to run');
      return;
    }
    bidi = ff.session.bidi;
  }, 60_000);

  afterAll(async () => {
    if (ff) await ff.shutdown();
    if (fixture) await fixture.close();
  });

  function liveOnly(name: string, fn: () => Promise<void>, timeout = 30_000): void {
    it(name, async () => {
      if (!ff) return;
      await fn();
    }, timeout);
  }

  liveOnly('session.status returns ready', async () => {
    const res = await bidi.send<{ ready: boolean; message?: string }>('session.status', {});
    expect(typeof res.ready).toBe('boolean');
  });

  liveOnly('browsingContext.create + getTree lists the new context', async () => {
    const created = await bidi.send<{ context: string }>('browsingContext.create', {
      type: 'tab',
    });
    const tree = await bidi.send<{ contexts: Array<{ context: string }> }>(
      'browsingContext.getTree',
      {},
    );
    const ids = tree.contexts.map(c => c.context);
    expect(ids).toContain(created.context);
    await bidi.send('browsingContext.close', { context: created.context });
  });

  liveOnly('script.evaluate("1+1") returns 2', async () => {
    const tree = await bidi.send<{ contexts: Array<{ context: string }> }>(
      'browsingContext.getTree',
      {},
    );
    const ctx = tree.contexts[0]?.context;
    expect(ctx).toBeDefined();
    const result = await bidi.send<{ result: { type: string; value: number } }>(
      'script.evaluate',
      {
        expression: '1 + 1',
        target: { context: ctx },
        awaitPromise: false,
      },
    );
    expect(result.result.type).toBe('number');
    expect(result.result.value).toBe(2);
  });

  liveOnly('script.addPreloadScript runs before page scripts', async () => {
    const preload = await bidi.send<{ script: string }>('script.addPreloadScript', {
      functionDeclaration: '() => { window.__preloadMarker = "ran"; }',
    });
    expect(preload.script).toBeTruthy();

    const created = await bidi.send<{ context: string }>('browsingContext.create', { type: 'tab' });
    await bidi.send('browsingContext.navigate', {
      context: created.context,
      url: `${fixture.url}/fixture-sig.html`,
      wait: 'complete',
    });
    const marker = await bidi.send<{ result: { value?: string } }>('script.evaluate', {
      expression: 'window.__preloadMarker',
      target: { context: created.context },
      awaitPromise: false,
    });
    expect(marker.result.value).toBe('ran');
    await bidi.send('browsingContext.close', { context: created.context });
    await bidi.send('script.removePreloadScript', { script: preload.script });
  });

  liveOnly('network.beforeRequestSent fires for fixture page resources', async () => {
    await bidi.subscribe(['network.beforeRequestSent']);
    const fired: string[] = [];
    const handler = (ev: { params?: { request?: { url?: string } } }): void => {
      const url = ev?.params?.request?.url;
      if (url) fired.push(url);
    };
    bidi.on('network.beforeRequestSent', handler);

    const created = await bidi.send<{ context: string }>('browsingContext.create', { type: 'tab' });
    try {
      await bidi.send('browsingContext.navigate', {
        context: created.context,
        url: `${fixture.url}/fixture-xhr-pause.html`,
        wait: 'complete',
      });
      // Trigger the embedded script load — sign.js is fetched as a sub-resource.
      expect(fired.some(u => u.endsWith('/fixture-xhr-pause.html'))).toBe(true);
      expect(fired.some(u => u.endsWith('/sign.js'))).toBe(true);
    } finally {
      bidi.off('network.beforeRequestSent', handler);
      await bidi.unsubscribe(['network.beforeRequestSent']);
      await bidi.send('browsingContext.close', { context: created.context });
    }
  });
});
