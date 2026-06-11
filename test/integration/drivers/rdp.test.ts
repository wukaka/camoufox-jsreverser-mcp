import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchTestFirefox, type TestFirefox } from '../helpers/firefox.js';
import { startFixtureServer, type FixtureServer } from '../fixtures/server.js';
import type { RdpDriver } from '../../../src/drivers/rdp/RdpDriver.js';
import { bootstrapRdp, type ActorTree } from '../../../src/drivers/rdp/bootstrap.js';

/** Spec §5.2 Layer 2 — real Firefox RDP protocol surface. */
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

  liveOnly('thread actor accepts the sources request (sources array shape)', async () => {
    // Firefox 150 streams new sources via the watcher's `source` resource rather than
    // returning them from `threadActor.sources` on demand; that work-item belongs to
    // the capability layer. Here we only verify the thread accepts the request and
    // returns the documented `{ sources: [] }` envelope.
    const sources = await rdp.call<{ sources: unknown[] }>(
      tree.threadActor,
      { type: 'sources' },
    );
    expect(Array.isArray(sources.sources)).toBe(true);
  });

  liveOnly('bootstrapRdp surfaces prefActor + perfActor from root.getRoot', async () => {
    expect(tree.prefActor).toBeTruthy();
    expect(tree.perfActor).toBeTruthy();
    expect(tree.threadActor).toBeTruthy();
  });
});
