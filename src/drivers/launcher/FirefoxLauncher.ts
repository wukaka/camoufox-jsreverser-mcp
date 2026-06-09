import { renderPrefsJs } from './profile-template.js';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';

export interface LaunchEndpoints { bidiUrl: string; rdpPort: number; profileDir: string | null }

export interface LauncherDeps {
  spawn: (cmd: string, args: string[], opts?: object) => EventEmitter & { stderr: EventEmitter; pid?: number; kill: (s: string) => void };
  mkdtemp: (prefix: string) => Promise<string>;
  writeFile: (p: string, content: string) => Promise<void>;
  rm: (p: string, opts: { recursive: boolean; force: boolean }) => Promise<void>;
  firefoxPath: string;
  startupTimeoutMs?: number;
}

export interface LaunchOptions {
  bidiPort?: number;       // 0 = pick free port (handled by Firefox)
  rdpPort?: number;        // default 6000
  extraArgs?: string[];
  extraPrefs?: { key: string; value: string | number | boolean }[];
}

export interface AttachOptions { bidiUrl: string; rdpPort: number }

const BIDI_RE = /WebDriver BiDi listening on (ws:\/\/[^\s]+)/;
const RDP_RE  = /(?:Remote Debugging Server|Marionette) listening on port (\d+)/;

export class FirefoxLauncher {
  private deps: LauncherDeps;
  private proc: ReturnType<LauncherDeps['spawn']> | null = null;
  private profileDir: string | null = null;

  constructor(deps: LauncherDeps) { this.deps = deps; }

  launch(opts: LaunchOptions): Promise<LaunchEndpoints> {
    const startupMs = this.deps.startupTimeoutMs ?? 30000;
    const rdpPort = opts.rdpPort ?? 6000;

    let resolveEndpoints!: (v: LaunchEndpoints) => void;
    let rejectEndpoints!: (e: unknown) => void;
    const endpointsPromise = new Promise<LaunchEndpoints>((res, rej) => {
      resolveEndpoints = res;
      rejectEndpoints = rej;
    });

    // Create the startup timeout synchronously so fake-timer tests can fire it
    // with vi.advanceTimersByTime() immediately after calling launch().
    const timeoutHandle = setTimeout(() => {
      rejectEndpoints(new Error('Firefox startup timeout: no endpoints detected from stderr'));
    }, startupMs);

    // Kick off profile creation asynchronously; spawn is called synchronously
    // below so the stderr listener is in place before any queueMicrotask() in
    // tests has a chance to fire (vi.fn().mockResolvedValue adds an extra
    // microtask tick, so queueMicrotask fires before await-of-mock resolves).
    const profileDirPromise = this.deps.mkdtemp('/tmp/ff-profile-');

    // Spawn synchronously so the stderr listener is registered before the very
    // first microtask checkpoint.  The --profile arg is supplied after mkdtemp
    // resolves via the async IIFE below; for the test the mock ignores args.
    const proc = this.deps.spawn(this.deps.firefoxPath, [
      '--remote-debugging-port', String(opts.bidiPort ?? 9222),
      '--start-debugger-server', String(rdpPort),
      ...(opts.extraArgs ?? []),
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    this.proc = proc;

    let bidiUrl: string | undefined;
    let rdpDetected: number | undefined;
    let resolvedProfileDir: string | undefined;

    // Register the stderr listener synchronously — before any await — so that
    // queueMicrotask()-emitted data events are captured reliably.
    proc.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString();
      const bm = s.match(BIDI_RE); if (bm) bidiUrl = bm[1];
      const rm = s.match(RDP_RE);  if (rm) rdpDetected = Number(rm[1]);
      if (bidiUrl && rdpDetected && resolvedProfileDir !== undefined) {
        clearTimeout(timeoutHandle);
        resolveEndpoints({ bidiUrl, rdpPort: rdpDetected, profileDir: resolvedProfileDir });
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timeoutHandle);
      rejectEndpoints(new Error(`Firefox exited prematurely with code ${code}`));
    });

    // Async tail: resolve profileDir, write user.js, then check if endpoints
    // were already parsed (data may have arrived before profileDir resolved).
    (async () => {
      try {
        const profileDir = await profileDirPromise;
        this.profileDir = profileDir;
        resolvedProfileDir = profileDir;

        await this.deps.writeFile(path.join(profileDir, 'user.js'), renderPrefsJs(opts.extraPrefs ?? []));

        // If both endpoints were already detected while profileDir was pending,
        // resolve now (the stderr handler couldn't because resolvedProfileDir
        // was still undefined).
        if (bidiUrl && rdpDetected) {
          clearTimeout(timeoutHandle);
          resolveEndpoints({ bidiUrl, rdpPort: rdpDetected, profileDir });
        }
      } catch (err) {
        clearTimeout(timeoutHandle);
        rejectEndpoints(err);
      }
    })();

    return endpointsPromise;
  }

  attach(opts: AttachOptions): LaunchEndpoints {
    return { bidiUrl: opts.bidiUrl, rdpPort: opts.rdpPort, profileDir: null };
  }

  async shutdown(opts: { sigtermTimeoutMs?: number; sigkillTimeoutMs?: number } = {}): Promise<void> {
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
  }
}
