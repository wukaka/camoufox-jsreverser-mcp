import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchTestFirefox, type TestFirefox } from '../helpers/firefox.js';
import { startFixtureServer, type FixtureServer } from '../fixtures/server.js';
import type { RdpDriver } from '../../../src/drivers/rdp/RdpDriver.js';
import { bootstrapRdp, type ActorTree } from '../../../src/drivers/rdp/bootstrap.js';

/** Spec §5.2 Layer 2 — real Firefox RDP protocol surface.
 *  Skipped automatically when Firefox / geckodriver are missing. */
describe('RDP driver integration', () => {
  let ff: TestFirefox | null = null;
  let fixture: FixtureServer;
  let rdp: RdpDriver;
  let tree: ActorTree;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    ff = await launchTestFirefox({ stealth: 'off' });
    if (!ff) {
      console.warn('[skip] RDP integration: install geckodriver and Firefox to run');
      return;
    }
    rdp = await ff.session.ensureRdp();
    tree = await bootstrapRdp(rdp);
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

  liveOnly('root → descriptor → watcher → target chain returns', async () => {
    expect(tree.root).toBe('root');
    expect(tree.descriptor).toBeTruthy();
    expect(tree.watcher).toBeTruthy();
    expect(tree.currentTarget).toBeTruthy();
  });

  liveOnly('thread actor lists sources after navigating fixture page', async () => {
    // Navigate via BiDi (simpler than RDP navigation) then ask the thread for sources.
    const bidi = ff!.session.bidi;
    const ctxTree = await bidi.send<{ contexts: Array<{ context: string }> }>(
      'browsingContext.getTree',
      {},
    );
    const ctx = ctxTree.contexts[0]!.context;
    await bidi.send('browsingContext.navigate', {
      context: ctx,
      url: `${fixture.url}/fixture-xhr-pause.html`,
      wait: 'complete',
    });

    // The current target actor exposes a threadActor field on attach.
    const attach = await rdp.call<{ threadActor?: string }>(tree.currentTarget, { type: 'attach' });
    const threadActor = attach.threadActor;
    expect(threadActor).toBeTruthy();
    await rdp.call(threadActor!, { type: 'attach' });
    const sources = await rdp.call<{ sources: Array<{ url?: string }> }>(threadActor!, {
      type: 'sources',
    });
    expect(Array.isArray(sources.sources)).toBe(true);
    expect(sources.sources.some(s => (s.url ?? '').endsWith('/sign.js'))).toBe(true);
    await rdp.call(threadActor!, { type: 'resume' });
  });

  liveOnly('setBreakpoint + trigger code emits paused event', async () => {
    const bidi = ff!.session.bidi;
    const ctxTree = await bidi.send<{ contexts: Array<{ context: string }> }>(
      'browsingContext.getTree',
      {},
    );
    const ctx = ctxTree.contexts[0]!.context;
    await bidi.send('browsingContext.navigate', {
      context: ctx,
      url: `${fixture.url}/fixture-xhr-pause.html`,
      wait: 'complete',
    });
    const attach = await rdp.call<{ threadActor?: string }>(tree.currentTarget, { type: 'attach' });
    const threadActor = attach.threadActor!;
    await rdp.call(threadActor, { type: 'attach' });

    // sign.js: window.computeSig = function ... { return btoa(...); }
    // Place a breakpoint on the function body's first statement.
    const sources = await rdp.call<{ sources: Array<{ url?: string }> }>(threadActor, {
      type: 'sources',
    });
    const signSource = sources.sources.find(s => (s.url ?? '').endsWith('/sign.js'));
    expect(signSource).toBeDefined();

    const pausedPromise = new Promise<unknown>((resolve) => {
      const handler = (ev: { type?: string }): void => {
        if (ev?.type === 'paused') {
          rdp.off('paused', handler);
          resolve(ev);
        }
      };
      rdp.on('paused', handler);
    });

    await rdp.call(threadActor, {
      type: 'setBreakpoint',
      location: { sourceUrl: signSource!.url, line: 3, column: 0 },
    });

    // Trigger the breakpoint by clicking the button — issues the fetch through computeSig.
    await bidi.send('script.evaluate', {
      expression: 'document.getElementById("go").click()',
      target: { context: ctx },
      awaitPromise: false,
    });

    const ev = await Promise.race([
      pausedPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('paused timeout')), 10_000)),
    ]);
    expect(ev).toBeTruthy();

    // clientEvaluate while paused.
    const ce = await rdp.call<{ result?: { value?: unknown } }>(threadActor, {
      type: 'clientEvaluate',
      expression: 'typeof payload',
    });
    expect(ce.result?.value).toBeDefined();

    // Resume releases the pause.
    await rdp.call(threadActor, { type: 'resume' });
  });
});
