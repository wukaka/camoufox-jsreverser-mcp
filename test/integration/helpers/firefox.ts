import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createConnection } from 'node:net';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { FirefoxLauncher } from '../../../src/drivers/launcher/FirefoxLauncher.js';
import { BidiDriver } from '../../../src/drivers/bidi/BidiDriver.js';
import { RdpDriver } from '../../../src/drivers/rdp/RdpDriver.js';
import { Session } from '../../../src/session/Session.js';

export const DEFAULT_CAMOUFOX_PATHS = [
  '/Applications/Camoufox.app/Contents/MacOS/camoufox',
  '/opt/homebrew/bin/camoufox',
  '/usr/local/bin/camoufox',
];

export async function resolveCamoufoxPath(): Promise<string | null> {
  if (process.env['CAMOUFOX_PATH']) return process.env['CAMOUFOX_PATH'];
  for (const p of DEFAULT_CAMOUFOX_PATHS) {
    try { await fs.access(p); return p; } catch { /* continue */ }
  }
  return null;
}

export const DEFAULT_GECKODRIVER_PATHS = [
  '/usr/local/bin/geckodriver',
  '/opt/homebrew/bin/geckodriver',
  '/usr/bin/geckodriver',
];

export async function resolveGeckodriverPath(): Promise<string | null> {
  if (process.env['GECKODRIVER_PATH']) return process.env['GECKODRIVER_PATH'];
  for (const p of DEFAULT_GECKODRIVER_PATHS) {
    try { await fs.access(p); return p; } catch { /* continue */ }
  }
  return null;
}

/** Allocate a TCP port that is free at the time of the call. */
export function allocateFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('failed to allocate port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

export interface TestFirefoxOptions {
  camoufoxPath?: string;
  geckodriverPath?: string;
  stealth?: 'auto' | 'off';
  /** Override the leaky `Camoufox/<ver>` UA string. Strongly recommended. */
  userAgentOverride?: string;
}

export interface TestFirefox {
  session: Session;
  shutdown(): Promise<void>;
}

/** Bring up a real Camoufox + geckodriver + Session for integration tests.
 *  Returns null when Camoufox or geckodriver are missing so callers can skip. */
export async function launchTestFirefox(opts: TestFirefoxOptions = {}): Promise<TestFirefox | null> {
  const camoufoxPath = opts.camoufoxPath ?? (await resolveCamoufoxPath());
  if (!camoufoxPath) return null;
  const geckodriverPath = opts.geckodriverPath ?? (await resolveGeckodriverPath());
  if (!geckodriverPath) return null;

  const launcher = new FirefoxLauncher({
    spawn: spawn as any,
    mkdtemp: (p: string) => fs.mkdtemp(p),
    writeFile: (p: string, c: string) => fs.writeFile(p, c, 'utf8'),
    rm: (p: string, o) => fs.rm(p, o),
    camoufoxPath,
    geckodriverPath,
    startupTimeoutMs: 30_000,
  });

  const session = new Session({
    launcher,
    makeBidi: async (bidiUrl) => {
      // launcher already POSTed /session and gave us the per-session WS URL.
      const ws = new WebSocket(bidiUrl);
      await new Promise<void>((res, rej) => {
        ws.once('open', () => res());
        ws.once('error', rej);
      });
      return new BidiDriver({ socket: ws as any });
    },
    makeRdp: async (port) => {
      const sock = createConnection({ host: '127.0.0.1', port });
      await new Promise<void>((res, rej) => {
        sock.once('connect', () => res());
        sock.once('error', rej);
      });
      const d = new RdpDriver({ socket: sock as any });
      d.markConnected();
      return d;
    },
  });

  await session.init({
    mode: 'launch',
    stealth: opts.stealth ?? 'off',
    ...(opts.userAgentOverride ? { userAgentOverride: opts.userAgentOverride } : {}),
  });
  return {
    session,
    async shutdown() {
      await session.shutdown();
    },
  };
}
