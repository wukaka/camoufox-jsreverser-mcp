import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { PauseController } from '../../../src/capabilities/types.js';

// pauseController needs bootstrapRdp() + makePauseController(rdp, scripts) wired in
// Session.ensureRdp. Re-enable when RDP-side caps land.
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

    const bp = await pc.setBreakpointByText('return btoa', '/sign.js');
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
