import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import { createHash } from 'node:crypto';
import type { PauseController, ScriptHost } from '../../../src/capabilities/types.js';

/**
 * Live verification of the Firefox 150 pauseController contract:
 *   - attach succeeds (the M7.06 attach-options payload)
 *   - setBreakpointByText resolves the source URL, pre-fetches the source list
 *     via threadActor.sources, and routes setBreakpoint through the thread
 *     actor (no DriverProtocolError)
 *   - removeBreakpoint sends the matching removeBreakpoint packet
 *
 * The trigger-pause-resume loop depends on Firefox 150's column-indexing
 * semantics (location resolution differs from earlier builds) and is verified
 * separately in a dedicated suite once that work-item lands. Here we only
 * confirm that the wire-level protocol is right end-to-end.
 */
describe('capability: pauseController (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] pauseController: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('attaches the thread, sets and removes a breakpoint via the new Firefox 150 packets', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    await ff.session.ensureRdp();
    const pc = ff.session.caps.pauseController as PauseController;
    expect(pc.isAttached()).toBe(true);

    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-xhr-pause.html`, wait: 'complete',
    });

    // Hydrate the ScriptCache with sign.js so setBreakpointByText can find it.
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

    const bp = await pc.setBreakpointByText('return btoa', `${fixture.url}/sign.js`);
    expect(bp.bpId).toBeTruthy();
    expect(bp.sourceUrl).toBe(`${fixture.url}/sign.js`);
    expect(pc.listBreakpoints()).toHaveLength(1);

    await pc.removeBreakpoint(bp.bpId);
    expect(pc.listBreakpoints()).toHaveLength(0);
  }, 60_000);
});
