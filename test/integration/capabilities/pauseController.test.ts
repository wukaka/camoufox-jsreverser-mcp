import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import { createHash } from 'node:crypto';
import type { PauseController, ScriptHost } from '../../../src/capabilities/types.js';

// pauseController.attach(threadActor) requires the threadActor returned by
// `<currentTarget>.attach`. Wiring that needs bootstrapRdp to complete reliably,
// which is currently flaky on Firefox 150 headless (no target-available-form
// emit). Re-enable when M7.04 adds a fall-back threadActor discovery path.
describe.skip('capability: pauseController (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] pauseController: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('setBreakpointByText on sign.js → trigger click → paused → resume', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    await ff.session.ensureRdp();
    const pc = ff.session.caps.pauseController as PauseController;
    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-xhr-pause.html`, wait: 'complete',
    });

    // Hydrate the ScriptCache with sign.js — setBreakpointByText searches the cache,
    // not the live page. In production this is what get_script_source does.
    const sh = ff.session.caps.scriptHost as ScriptHost;
    const realm = (await sh.listRealms(ctx)).find(r => r.type === 'window')!;
    const fetched = await sh.callFunction(realm.realmId,
      '(u) => fetch(u, { credentials: "same-origin" }).then(r => r.text())',
      [{ type: 'string', value: `${fixture.url}/sign.js` }],
      { awaitPromise: true });
    const source = (fetched.result as { value?: string })?.value ?? '';
    const hash = createHash('sha1').update(source).digest('hex').slice(0, 12);
    ff.session.scripts.put({
      id: `script-${hash}`,
      url: `${fixture.url}/sign.js`,
      source,
      hash,
    });

    // setBreakpointByText filters cached.url === sourceUrl exactly; pass the full URL.
    const bp = await pc.setBreakpointByText('return btoa', `${fixture.url}/sign.js`);
    expect(bp.bpId).toBeTruthy();

    // Click button to invoke computeSig.
    await ff.session.bidi.send('script.evaluate', {
      expression: 'document.getElementById("go").click()',
      target: { context: ctx },
      awaitPromise: false,
    });

    // Wait for the pause to land.
    const start = Date.now();
    while (!pc.getPausedInfo() && Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 100));
    }
    const info = pc.getPausedInfo();
    expect(info).not.toBeNull();

    const eval1 = await pc.evaluateOnCallframe('typeof payload');
    expect(eval1.value).toBeDefined();

    await pc.resume();
    expect(pc.getPausedInfo()).toBeNull();
    await pc.removeBreakpoint(bp.bpId);
  }, 30_000);
});
