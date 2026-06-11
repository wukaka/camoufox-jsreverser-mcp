import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createConnection } from 'node:net';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { FirefoxLauncher } from '../../../src/drivers/launcher/FirefoxLauncher.js';
import { BidiDriver } from '../../../src/drivers/bidi/BidiDriver.js';
import { RdpDriver } from '../../../src/drivers/rdp/RdpDriver.js';
import { Session } from '../../../src/session/Session.js';

export const DEFAULT_FIREFOX_PATHS = [
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
  '/opt/homebrew/bin/firefox',
  '/usr/bin/firefox',
];

export async function resolveFirefoxPath(): Promise<string | null> {
  if (process.env['FIREFOX_PATH']) return process.env['FIREFOX_PATH'];
  for (const p of DEFAULT_FIREFOX_PATHS) {
    try { await fs.access(p); return p; } catch { /* continue */ }
  }
  return null;
}

export const DEFAULT_GECKODRIVER_PATHS = [
  '/opt/homebrew/bin/geckodriver',
  '/usr/local/bin/geckodriver',
  '/usr/bin/geckodriver',
];

/** Firefox's bare `--remote-debugging-port` exposes CDP, not WebDriver BiDi.
 *  To exercise BiDi end-to-end you need geckodriver in front.
 *  M6.02 ships the helper scaffolding; tests skip when geckodriver is missing. */
export async function resolveGeckodriverPath(): Promise<string | null> {
  if (process.env['GECKODRIVER_PATH']) return process.env['GECKODRIVER_PATH'];
  for (const p of DEFAULT_GECKODRIVER_PATHS) {
    try { await fs.access(p); return p; } catch { /* continue */ }
  }
  return null;
}

/** Allocate a TCP port that is free at the time of the call. Not race-free, but good enough for tests. */
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

/** POST /session on the WebDriver BiDi HTTP endpoint to obtain a per-session WS URL. */
export async function createBidiSession(baseWsUrl: string): Promise<string> {
  const httpBase = baseWsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
  const res = await fetch(`${httpBase}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: { browserName: 'firefox', webSocketUrl: true, acceptInsecureCerts: true },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BiDi session POST failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { value?: { capabilities?: { webSocketUrl?: string } } };
  const wsUrl = data.value?.capabilities?.webSocketUrl;
  if (!wsUrl) throw new Error(`BiDi session response missing webSocketUrl: ${JSON.stringify(data)}`);
  return wsUrl;
}

export interface TestFirefoxOptions {
  firefoxPath?: string;
  stealth?: 'auto' | 'off';
}

export interface TestFirefox {
  session: Session;
  shutdown(): Promise<void>;
}

/** Launch a fresh Firefox + Session pair on free ports for use in integration tests.
 *  Returns null when Firefox or geckodriver is missing — callers should treat that as
 *  a skip. */
export async function launchTestFirefox(opts: TestFirefoxOptions = {}): Promise<TestFirefox | null> {
  const firefoxPath = opts.firefoxPath ?? (await resolveFirefoxPath());
  if (!firefoxPath) return null;
  // Bare Firefox exposes CDP, not BiDi; bail out cleanly so the suite still passes.
  const gecko = await resolveGeckodriverPath();
  if (!gecko) return null;

  const [bidiPort, rdpPort] = await Promise.all([allocateFreePort(), allocateFreePort()]);

  const launcher = new FirefoxLauncher({
    spawn: spawn as any,
    mkdtemp: (p: string) => fs.mkdtemp(p),
    writeFile: (p: string, c: string) => fs.writeFile(p, c, 'utf8'),
    rm: (p: string, o) => fs.rm(p, o),
    firefoxPath,
    startupTimeoutMs: 30_000,
  });

  // Launch Firefox ourselves with the pre-allocated ports + headless flag, then hand
  // the resulting endpoints to Session via attach mode.
  const endpoints = await launcher.launch({
    bidiPort,
    rdpPort,
    extraArgs: ['--headless', '--no-remote'],
  });

  // Wrap a fake launcher that returns the same endpoints (Session.init calls launch()
  // again in 'launch' mode; we use 'attach' so it just calls launcher.attach()).
  const session = new Session({
    launcher: {
      ...launcher,
      // shutdown is delegated to the real launcher via prototype binding below.
      attach: (o: { bidiUrl: string; rdpPort: number }) => launcher.attach(o),
      shutdown: (o?: any) => launcher.shutdown(o),
    } as any,
    makeBidi: async (bidiUrl) => {
      // bidiUrl from launcher stderr is the WebDriver BiDi base (ws://host:port).
      // Convert to HTTP and POST /session to obtain a webSocketUrl, then connect.
      const sessionWsUrl = await createBidiSession(bidiUrl);
      const ws = new WebSocket(sessionWsUrl);
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
    mode: 'attach',
    bidiUrl: endpoints.bidiUrl,
    rdpPort: endpoints.rdpPort,
    stealth: opts.stealth ?? 'off',
  });
  return {
    session,
    async shutdown() {
      await session.shutdown();
    },
  };
}
