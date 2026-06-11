import { renderPrefsJs } from './profile-template.js';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';

/**
 * Launches Camoufox via geckodriver and obtains the BiDi session WebSocket URL.
 *
 * Camoufox + geckodriver is the only supported stack:
 *   - Camoufox provides C++-level stealth (navigator.webdriver=false, fingerprint patches).
 *   - geckodriver provides the W3C WebDriver classic POST /session handshake required
 *     to upgrade to BiDi over WebSocket.
 *
 * Raw `firefox --remote-debugging-port` exposes CDP, not BiDi, and is not supported.
 */

export interface LaunchEndpoints {
  /** Per-session WebSocket URL returned by `POST /session`. Ready for WS upgrade. */
  bidiUrl: string;
  /** RDP port from `--start-debugger-server` (we pin it via geckodriver arg/pref). */
  rdpPort: number;
  /** Generated user profile root; cleaned up on shutdown. */
  profileDir: string | null;
  /** WebDriver session id returned by geckodriver; needed for DELETE /session at shutdown. */
  sessionId: string;
  /** Local geckodriver port; useful for tests + shutdown. */
  geckodriverPort: number;
}

type ProcLike = EventEmitter & {
  stderr: EventEmitter;
  stdout?: EventEmitter;
  pid?: number;
  kill: (s: string) => void;
};

export interface LauncherDeps {
  spawn: (cmd: string, args: string[], opts?: object) => ProcLike;
  mkdtemp: (prefix: string) => Promise<string>;
  writeFile: (p: string, content: string) => Promise<void>;
  rm: (p: string, opts: { recursive: boolean; force: boolean }) => Promise<void>;
  /** Path to the Camoufox binary (the patched Firefox). */
  camoufoxPath: string;
  /** Path to the geckodriver binary. */
  geckodriverPath: string;
  /** Max time to wait for geckodriver to print "Listening on ..." before giving up. */
  startupTimeoutMs?: number;
  /** Injectable HTTP client for the POST /session handshake; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Free TCP port allocator for geckodriver + RDP; defaults to ephemeral OS bind. */
  freePort?: () => Promise<number>;
}

export interface LaunchOptions {
  /** Pin the RDP debugger-server port. When omitted a free port is allocated. */
  rdpPort?: number;
  /** Extra Firefox CLI args (passed through moz:firefoxOptions.args). */
  extraArgs?: string[];
  /** Extra prefs appended to the generated user.js. */
  extraPrefs?: { key: string; value: string | number | boolean }[];
  /** Strongly recommended: override the leaky `Camoufox/<ver>` UA brand. */
  userAgentOverride?: string;
}

export interface AttachOptions { bidiUrl: string; rdpPort: number; sessionId?: string; geckodriverPort?: number }

const GECKODRIVER_LISTENING_RE = /(?:[Ll]istening on)\s+(?:127\.0\.0\.1|0\.0\.0\.0|localhost):(\d+)/;

async function defaultFreePort(): Promise<number> {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
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

interface SessionCapabilitiesResponse {
  value?: {
    sessionId?: string;
    capabilities?: { webSocketUrl?: string; [k: string]: unknown };
  };
}

export class FirefoxLauncher {
  private deps: LauncherDeps;
  private proc: ProcLike | null = null;
  private profileDir: string | null = null;
  private sessionId: string | null = null;
  private geckodriverPort: number | null = null;

  constructor(deps: LauncherDeps) { this.deps = deps; }

  async launch(opts: LaunchOptions = {}): Promise<LaunchEndpoints> {
    const freePort = this.deps.freePort ?? defaultFreePort;
    const fetchImpl = this.deps.fetch ?? globalThis.fetch;

    const profileDir = await this.deps.mkdtemp('/tmp/cam-profile-');
    this.profileDir = profileDir;
    const rdpPort = opts.rdpPort ?? await freePort();
    const geckodriverPort = await freePort();
    this.geckodriverPort = geckodriverPort;

    const extraPrefs = [...(opts.extraPrefs ?? [])];
    if (opts.userAgentOverride) {
      extraPrefs.push({ key: 'general.useragent.override', value: opts.userAgentOverride });
    }
    // Pin the RDP debugger server port via pref so geckodriver doesn't need to know about it.
    extraPrefs.push({ key: 'devtools.debugger.remote-port', value: rdpPort });
    await this.deps.writeFile(path.join(profileDir, 'user.js'), renderPrefsJs(extraPrefs));

    const proc = this.deps.spawn(
      this.deps.geckodriverPath,
      [
        '--port', String(geckodriverPort),
        '--binary', this.deps.camoufoxPath,
        '--log', 'info',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.proc = proc;

    // geckodriver writes "Listening on 127.0.0.1:<port>" to stdout (not stderr).
    // We accept either to stay robust against future log routing changes.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('geckodriver startup timeout: no listening banner detected'));
      }, this.deps.startupTimeoutMs ?? 30000);
      const onData = (chunk: Buffer): void => {
        const s = chunk.toString();
        if (GECKODRIVER_LISTENING_RE.test(s)) {
          clearTimeout(timeout);
          proc.stdout?.off('data', onData);
          proc.stderr.off('data', onData);
          resolve();
        }
      };
      proc.stdout?.on('data', onData);
      proc.stderr.on('data', onData);
      proc.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`geckodriver exited prematurely with code ${code}`));
      });
    });

    // Drain remaining output so the OS pipe buffers don't fill up mid-run.
    proc.stdout?.on('data', () => { /* swallow */ });
    proc.stderr.on('data', () => { /* swallow */ });

    // POST /session — geckodriver launches Camoufox, returns webSocketUrl for BiDi.
    const sessionRes = await fetchImpl(`http://127.0.0.1:${geckodriverPort}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            browserName: 'firefox',
            webSocketUrl: true,
            acceptInsecureCerts: true,
            'moz:firefoxOptions': {
              args: ['-profile', profileDir, ...(opts.extraArgs ?? [])],
              prefs: {
                'devtools.debugger.remote-enabled': true,
                'devtools.debugger.prompt-connection': false,
                'devtools.chrome.enabled': true,
              },
            },
          },
        },
      }),
    });
    if (!sessionRes.ok) {
      const body = await sessionRes.text().catch(() => '');
      throw new Error(`geckodriver POST /session failed: HTTP ${sessionRes.status} ${body.slice(0, 200)}`);
    }
    const data = (await sessionRes.json()) as SessionCapabilitiesResponse;
    const sessionId = data?.value?.sessionId;
    const bidiUrl = data?.value?.capabilities?.webSocketUrl;
    if (!sessionId || !bidiUrl) {
      throw new Error(`geckodriver POST /session missing sessionId or webSocketUrl: ${JSON.stringify(data).slice(0, 200)}`);
    }
    this.sessionId = sessionId;

    return { bidiUrl, rdpPort, profileDir, sessionId, geckodriverPort };
  }

  attach(opts: AttachOptions): LaunchEndpoints {
    return {
      bidiUrl: opts.bidiUrl,
      rdpPort: opts.rdpPort,
      profileDir: null,
      sessionId: opts.sessionId ?? '',
      geckodriverPort: opts.geckodriverPort ?? 0,
    };
  }

  async shutdown(opts: { sigtermTimeoutMs?: number; sigkillTimeoutMs?: number } = {}): Promise<void> {
    const fetchImpl = this.deps.fetch ?? globalThis.fetch;

    // Best-effort DELETE /session — lets geckodriver close Camoufox gracefully.
    if (this.sessionId && this.geckodriverPort) {
      try {
        await fetchImpl(`http://127.0.0.1:${this.geckodriverPort}/session/${this.sessionId}`, {
          method: 'DELETE',
        });
      } catch { /* fall through to SIGTERM */ }
      this.sessionId = null;
    }

    if (this.proc) {
      this.proc.kill('SIGTERM');
      await new Promise(r => setTimeout(r, opts.sigtermTimeoutMs ?? 5000));
      this.proc.kill('SIGKILL');
      this.proc = null;
    }
    if (this.profileDir) {
      await this.deps.rm(this.profileDir, { recursive: true, force: true });
      this.profileDir = null;
    }
    this.geckodriverPort = null;
  }
}
