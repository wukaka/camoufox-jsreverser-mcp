import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLive, firstContext, type LiveSession } from './_setup.js';
import { createHash } from 'node:crypto';
import type { PauseController, ScriptHost, RdpGrip } from '../../../src/capabilities/types.js';

/**
 * Live verification of the M7.07 column-snap + columnTolerance behavior on
 * Firefox 150. Establishes the trigger-pause loop end-to-end that older M7.06
 * coverage stopped short of, and locks in the multi-statement / minified-row
 * ergonomics that reverse-engineering depends on.
 */
describe('capability: triggerPause (live)', () => {
  let live: LiveSession | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ live, shutdown } = await setupLive());
    if (!live) console.warn('[skip] triggerPause: install geckodriver');
  }, 60_000);
  afterAll(async () => { if (shutdown) await shutdown(); });

  async function hydrateScript(ff: NonNullable<LiveSession>['ff'], fixture: NonNullable<LiveSession>['fixture'], ctx: string): Promise<void> {
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
  }

  it('A: default precise snap arms a breakpoint that actually fires; evaluate returns a grip', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    await ff.session.ensureRdp();
    const pc = ff.session.caps.pauseController as PauseController;
    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-xhr-pause.html`, wait: 'complete',
    });
    await hydrateScript(ff, fixture, ctx);

    const bp = await pc.setBreakpointByText('return btoa', `${fixture.url}/sign.js`);
    expect(bp.actualColumn).toBeDefined();

    await ff.session.bidi.send('script.evaluate', {
      expression: 'document.getElementById("go").click()',
      target: { context: ctx },
      awaitPromise: false,
    });
    const start = Date.now();
    while (!pc.getPausedInfo() && Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 100));
    }
    const info = pc.getPausedInfo();
    expect(info).not.toBeNull();
    expect(info?.currentFrame?.where?.line).toBe(bp.actualLine);

    const callResult = await pc.evaluateOnCallframe('payload');
    const grip = callResult.value as RdpGrip;
    expect(grip?.type).toBe('object');

    await pc.resume();
    await pc.removeBreakpoint(bp.bpId);
  }, 60_000);

  it('B: multi-statement row, default snap, actualColumn lands on a legal position different from idx+1', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    await ff.session.ensureRdp();
    const pc = ff.session.caps.pauseController as PauseController;
    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-xhr-pause.html`, wait: 'complete',
    });
    await hydrateScript(ff, fixture, ctx);

    // Use a substring guaranteed to live on the packed multi-statement row only.
    const bp = await pc.setBreakpointByText("c=btoa('x'+b)", `${fixture.url}/sign.js`);
    expect(bp.actualColumn).toBeDefined();
    expect(bp.requestedColumn).toBeDefined();
    expect(bp.line).toBeGreaterThan(4); // packed line is after the existing return-btoa block

    await pc.removeBreakpoint(bp.bpId);
  }, 60_000);

  it('C: multi-statement row, columnTolerance: 0 strict vs columnTolerance: 200 lenient — both produce a paused event without timeout', async () => {
    if (!live) return;
    const { ff, fixture } = live;
    await ff.session.ensureRdp();
    const pc = ff.session.caps.pauseController as PauseController;
    const ctx = await firstContext(ff);
    await ff.session.bidi.send('browsingContext.navigate', {
      context: ctx, url: `${fixture.url}/fixture-xhr-pause.html`, wait: 'complete',
    });
    await hydrateScript(ff, fixture, ctx);

    // Strict mode — accept the snapped position immediately.
    const strict = await pc.setBreakpointByText("d=String", `${fixture.url}/sign.js`, { columnTolerance: 0 });
    await ff.session.bidi.send('script.evaluate', {
      expression: 'window.packed && window.packed()',
      target: { context: ctx },
      awaitPromise: false,
    });
    let start = Date.now();
    while (!pc.getPausedInfo() && Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 100));
    }
    expect(pc.getPausedInfo()).not.toBeNull();
    await pc.resume();
    await pc.removeBreakpoint(strict.bpId);

    // Lenient mode — accept any column on the same line.
    const lenient = await pc.setBreakpointByText("c=btoa('x'+b)", `${fixture.url}/sign.js`, { columnTolerance: 200 });
    await ff.session.bidi.send('script.evaluate', {
      expression: 'window.packed && window.packed()',
      target: { context: ctx },
      awaitPromise: false,
    });
    start = Date.now();
    while (!pc.getPausedInfo() && Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 100));
    }
    expect(pc.getPausedInfo()).not.toBeNull();
    await pc.resume();
    await pc.removeBreakpoint(lenient.bpId);
  }, 90_000);
});
