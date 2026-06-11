import { launchTestFirefox, type TestFirefox } from '../helpers/firefox.js';
import { startFixtureServer, type FixtureServer } from '../fixtures/server.js';

export interface LiveSession {
  ff: TestFirefox;
  fixture: FixtureServer;
}

/** Returns a live session + fixture server, or null when geckodriver / Firefox are
 *  unavailable (so callers can skip cleanly). The caller is responsible for shutdown. */
export async function setupLive(opts: { stealth?: 'auto' | 'off' } = {}): Promise<{
  live: LiveSession | null;
  shutdown: () => Promise<void>;
}> {
  const fixture = await startFixtureServer();
  const ff = await launchTestFirefox({ stealth: opts.stealth ?? 'off' });
  if (!ff) {
    return {
      live: null,
      shutdown: async () => { await fixture.close(); },
    };
  }
  return {
    live: { ff, fixture },
    async shutdown() {
      try { await ff.shutdown(); } finally { await fixture.close(); }
    },
  };
}

/** Get the first browsing-context id via BiDi getTree (handy for tests that need a
 *  navigation target). */
export async function firstContext(ff: import('../helpers/firefox.js').TestFirefox): Promise<string> {
  const tree = await ff.session.bidi.send<{ contexts: Array<{ context: string }> }>(
    'browsingContext.getTree',
    {},
  );
  const ctx = tree.contexts[0]?.context;
  if (!ctx) throw new Error('no browsing context');
  return ctx;
}
