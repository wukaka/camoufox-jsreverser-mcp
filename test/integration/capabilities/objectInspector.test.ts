import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import type { PauseController, ObjectInspector, RdpGrip } from '../../../src/capabilities/types.js';

// objectInspector exercises the paused-thread API, so it inherits pauseController's
// threadActor-attach dependency. Re-enable alongside pauseController in M7.04.
describe.skip('capability: objectInspector (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] objectInspector: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('inspect + prototypeAndProperties returns a usable grip for a paused object', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    await ff.session.ensureRdp();
    const pc = ff.session.caps.pauseController as PauseController;
    const oi = ff.session.caps.objectInspector as ObjectInspector;
    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-xhr-pause.html`, wait: 'complete',
    });

    const bp = await pc.setBreakpointByText('return btoa', '/sign.js');
    await ff.session.bidi.send('script.evaluate', {
      expression: 'document.getElementById("go").click()',
      target: { context: ctx },
      awaitPromise: false,
    });
    const start = Date.now();
    while (!pc.getPausedInfo() && Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 100));
    }
    expect(pc.getPausedInfo()).not.toBeNull();

    const callResult = await pc.evaluateOnCallframe('payload');
    // payload is an object — its grip should be inspectable.
    const grip = callResult.value as RdpGrip;
    expect(grip?.type).toBe('object');
    const inspection = await oi.prototypeAndProperties(grip);
    expect(inspection.class).toBeTruthy();
    expect(Array.isArray(inspection.properties)).toBe(true);

    await pc.resume();
    await pc.removeBreakpoint(bp.bpId);
  }, 30_000);
});
