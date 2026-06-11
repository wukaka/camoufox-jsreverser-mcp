import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchTestFirefox, type TestFirefox } from '../helpers/firefox.js';
import { startFixtureServer, type FixtureServer } from '../fixtures/server.js';
import type { BidiDriver } from '../../../src/drivers/bidi/BidiDriver.js';

/** Spec §5.2 Layer 2 — real Firefox BiDi protocol surface against Camoufox
 *  fronted by geckodriver. Skipped automatically when Camoufox + geckodriver
 *  are not installed. */
describe('BiDi driver integration', () => {
  let ff: TestFirefox | null = null;
  let fixture: FixtureServer;
  let bidi: BidiDriver;
  let rootContext: string;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    ff = await launchTestFirefox({ stealth: 'off' });
    if (!ff) {
      console.warn('[skip] BiDi integration: install Camoufox + geckodriver to run');
      return;
    }
    bidi = ff.session.bidi;
    // Pick the single browsing context geckodriver opens by default. We cannot rely
    // on browsingContext.create — headless Firefox does not service new windows /
    // tabs reliably; reusing the existing context mirrors how the production tools
    // (page-state, scripts, etc.) operate.
    const tree = await bidi.send<{ contexts: Array<{ context: string }> }>('browsingContext.getTree', {});
    rootContext = tree.contexts[0]!.context;
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

  liveOnly('session.status returns a boolean ready flag', async () => {
    const res = await bidi.send<{ ready: boolean; message?: string }>('session.status', {});
    expect(typeof res.ready).toBe('boolean');
  });

  liveOnly('browsingContext.getTree exposes at least one context', async () => {
    const tree = await bidi.send<{ contexts: Array<{ context: string; url?: string }> }>(
      'browsingContext.getTree',
      {},
    );
    expect(tree.contexts.length).toBeGreaterThan(0);
    expect(tree.contexts[0]!.context).toBeTruthy();
  });

  liveOnly('script.evaluate("1+1") returns 2', async () => {
    const result = await bidi.send<{ result: { type: string; value: number } }>('script.evaluate', {
      expression: '1 + 1',
      target: { context: rootContext },
      awaitPromise: false,
    });
    expect(result.result.type).toBe('number');
    expect(result.result.value).toBe(2);
  });

  liveOnly('script.addPreloadScript runs before page scripts', async () => {
    const preload = await bidi.send<{ script: string }>('script.addPreloadScript', {
      functionDeclaration: '() => { window.__preloadMarker = "ran"; }',
    });
    expect(preload.script).toBeTruthy();
    try {
      await bidi.send('browsingContext.navigate', {
        context: rootContext,
        url: `${fixture.url}/fixture-sig.html`,
        wait: 'complete',
      });
      const marker = await bidi.send<{ result: { value?: string } }>('script.evaluate', {
        expression: 'window.__preloadMarker',
        target: { context: rootContext },
        awaitPromise: false,
      });
      expect(marker.result.value).toBe('ran');
    } finally {
      await bidi.send('script.removePreloadScript', { script: preload.script });
    }
  });

  liveOnly('network.beforeRequestSent fires for fixture page resources', async () => {
    await bidi.subscribe(['network.beforeRequestSent']);
    const fired: string[] = [];
    const handler = (params: { request?: { url?: string } }): void => {
      const url = params?.request?.url;
      if (url) fired.push(url);
    };
    bidi.on('network.beforeRequestSent', handler);
    try {
      await bidi.send('browsingContext.navigate', {
        context: rootContext,
        url: `${fixture.url}/fixture-xhr-pause.html`,
        wait: 'complete',
      });
      // Allow a tick for the sub-resource event to drain through the dispatcher.
      await new Promise(r => setTimeout(r, 250));
      expect(fired.some(u => u.endsWith('/fixture-xhr-pause.html'))).toBe(true);
      expect(fired.some(u => u.endsWith('/sign.js'))).toBe(true);
    } finally {
      bidi.off('network.beforeRequestSent', handler);
      await bidi.unsubscribe(['network.beforeRequestSent']);
    }
  });
});
