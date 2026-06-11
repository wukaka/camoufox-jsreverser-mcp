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
  bidiPort?: number;
  rdpPort?: number;
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

  async launch(opts: LaunchOptions): Promise<LaunchEndpoints> {
    const profileDir = await this.deps.mkdtemp('/tmp/ff-profile-');
    this.profileDir = profileDir;
    await this.deps.writeFile(path.join(profileDir, 'user.js'), renderPrefsJs(opts.extraPrefs ?? []));

    const rdpPort = opts.rdpPort ?? 6000;
    const args = [
      '--profile', profileDir,
      '--remote-debugging-port', String(opts.bidiPort ?? 9222),
      '--start-debugger-server', String(rdpPort),
      ...(opts.extraArgs ?? []),
    ];
    const proc = this.deps.spawn(this.deps.firefoxPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    this.proc = proc;

    return new Promise<LaunchEndpoints>((resolve, reject) => {
      let bidiUrl: string | undefined;
      let rdpDetected: number | undefined;
      const timeout = setTimeout(() => {
        reject(new Error('Firefox startup timeout: no endpoints detected from stderr'));
      }, this.deps.startupTimeoutMs ?? 30000);

      const tryResolve = (): void => {
        if (!bidiUrl) return;
        // Recent Firefox builds no longer print the RDP startup banner; trust the port
        // we asked for via --start-debugger-server once BiDi is up. stderr-detected
        // value still wins when present (older builds).
        const port = rdpDetected ?? rdpPort;
        clearTimeout(timeout);
        resolve({ bidiUrl, rdpPort: port, profileDir });
      };

      proc.stderr.on('data', (chunk: Buffer) => {
        const s = chunk.toString();
        const bm = s.match(BIDI_RE); if (bm) bidiUrl = bm[1];
        const rm = s.match(RDP_RE);  if (rm) rdpDetected = Number(rm[1]);
        tryResolve();
      });
      proc.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Firefox exited prematurely with code ${code}`));
      });
    });
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
