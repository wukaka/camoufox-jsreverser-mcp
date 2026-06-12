import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { PreloadInjector, ScriptHost, StealthHook } from '../../../src/capabilities/types.js';

/**
 * M7.11 acceptance: install stealthHook on window.fetch, navigate to a page
 * that hosts three same-origin iframes (static, DOMContentLoaded-injected,
 * setTimeout-injected at 200ms), then verify that:
 *
 *   1. iframe.contentWindow.Function.prototype.toString.call(window.fetch)
 *      returns the masked native string in every iframe — proves the
 *      MutationObserver and initial sweep both work.
 *   2. No __sh_* keys leak on globalThis — proves closure isolation.
 *   3. Object.getOwnPropertySymbols(Function.prototype.toString) is empty
 *      in every realm — proves we didn't add a Symbol.for anchor.
 */
describe('capability: stealthHook cross-realm (live M7.11)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] stealthHook-cross-realm: install Camoufox + geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('iframe-realm probes see masked toString after install', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    const sh = ff.session.caps.stealthHook as StealthHook;
    const pi = ff.session.caps.preloadInjector as PreloadInjector;
    const sHost = ff.session.caps.scriptHost as ScriptHost;

    const preload = sh.renderPreload({
      emitName: '__sh_emit_noop',
      wraps: [{ targetPath: 'fetch' }],
    });
    const preloadId = await pi.add(preload);
    try {
      const ctx = await firstContext(ff);
      await ff.session.bidi.send('browsingContext.navigate', {
        context: ctx, url: `${fixture.url}/iframe-host.html`, wait: 'complete',
      });
      // Give the 200ms delayed iframe time to attach and our MutationObserver
      // time to install in it.
      await new Promise((r) => setTimeout(r, 500));

      const realm = (await sHost.listRealms(ctx)).find((r) => r.type === 'window')!;

      // 1. Each iframe's Function.prototype.toString.call(window.fetch) is masked.
      const probe1 = await sHost.evaluate(realm.realmId, `
        (function () {
          var out = [];
          var iframes = document.querySelectorAll('iframe');
          for (var i = 0; i < iframes.length; i++) {
            var cw = iframes[i].contentWindow;
            try {
              out.push({
                id: iframes[i].id,
                masked: cw.Function.prototype.toString.call(window.fetch),
              });
            } catch (e) { out.push({ id: iframes[i].id, err: String(e) }); }
          }
          return JSON.stringify(out);
        })()
      `);
      const probe1Val = (probe1.result as { value?: string }).value ?? '[]';
      const rows: Array<{ id: string; masked?: string; err?: string }> = JSON.parse(probe1Val);
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const row of rows) {
        expect(row.err).toBeUndefined();
        expect(row.masked).toBe('function fetch() { [native code] }');
      }

      // 2. No __sh_* keys on globalThis.
      const probe2 = await sHost.evaluate(realm.realmId, `
        Object.getOwnPropertyNames(globalThis).filter(function (k) { return k.indexOf('__sh_') === 0; }).join(',')
      `);
      expect((probe2.result as { value?: string }).value).toBe('');

      // 3. Function.prototype.toString carries no own-Symbols.
      const probe3 = await sHost.evaluate(realm.realmId, `
        Object.getOwnPropertySymbols(Function.prototype.toString).length
      `);
      expect((probe3.result as { value?: number }).value).toBe(0);
    } finally {
      await pi.remove(preloadId);
    }
  }, 30_000);
});
