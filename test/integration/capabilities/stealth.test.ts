import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { ScriptHost, Stealth, WorkerTopology } from '../../../src/capabilities/types.js';

describe('capability: stealth (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] stealth: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('applyPresetToWorkers covers dedicated worker payload', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    await ff.session.ensureRdp();
    const stealth = ff.session.caps.stealth as Stealth;
    const workers = ff.session.caps.workerTopology as WorkerTopology;
    const sh = ff.session.caps.scriptHost as ScriptHost;

    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx,
      url: `${fixture.url}/fixture-worker-stealth.html`,
      wait: 'complete',
    });

    const start = Date.now();
    let visible: string | null = null;
    while (Date.now() - start < 8000) {
      const list = await workers.listWorkers();
      const w = list.find(x => x.type === 'worker');
      if (w) { visible = w.realmId; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(visible).not.toBeNull();

    const report = await stealth.applyPresetToWorkers('firefox-default', { watch: true });
    expect(report.injected.length).toBeGreaterThanOrEqual(1);
    expect(report.failed).toEqual([]);
    expect(report.injectedAt).toBe('post-start');
    expect(report.watching).toBe(true);

    const realm = (await sh.listRealms(ctx)).find(r => r.type === 'window')!;
    await sh.callFunction(realm.realmId, '() => window.__askWorker()', [], { awaitPromise: false });

    const replyStart = Date.now();
    let reply: { webdriver: unknown; toStringNative: unknown } | null = null;
    while (Date.now() - replyStart < 6000) {
      const r = await sh.callFunction(realm.realmId, '() => window.__workerReply', [], { awaitPromise: false });
      const value = (r.result as { value?: unknown })?.value as { webdriver: unknown; toStringNative: unknown } | null;
      if (value) { reply = value; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(reply).not.toBeNull();
    expect(reply!.webdriver).toBe(false);
    expect(reply!.toStringNative).toBe(true);

    report.unwatch();
  }, 60_000);
});
