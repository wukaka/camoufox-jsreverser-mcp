import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { RdpDriver } from '../drivers/rdp/RdpDriver.js';
import { FirefoxLauncher, LaunchEndpoints } from '../drivers/launcher/FirefoxLauncher.js';
import { ChannelDispatcher } from './dispatcher.js';
import { generateEmitName } from './emit-name.js';
import { ScriptCache, RequestPool, HookTable, WsTable, ConsoleRing } from './caches.js';
import { Capabilities } from '../capabilities/types.js';
import { BrowserNotReadyError } from './errors.js';

export interface SessionDeps {
  launcher: FirefoxLauncher;
  makeBidi: (bidiUrl: string) => Promise<BidiDriver>;
  makeRdp: (rdpPort: number) => Promise<RdpDriver>;
}

export interface SessionInitOpts {
  mode: 'launch' | 'attach';
  bidiUrl?: string;
  rdpPort?: number;
  stealth?: 'auto' | 'off';
}

export class Session {
  readonly emitName: string;
  readonly dispatcher = new ChannelDispatcher();
  readonly scripts = new ScriptCache();
  readonly requests = new RequestPool();
  readonly hooks = new HookTable();
  readonly wsTable = new WsTable();
  readonly consoleRing = new ConsoleRing();
  readonly caps: Capabilities = {};
  activeContextId: string | null = null;
  activeFrameContextId: string | null = null;

  bidi!: BidiDriver;
  private rdpFactory: ((port: number) => Promise<RdpDriver>) | null = null;
  private rdp: RdpDriver | null = null;
  private rdpPort: number | null = null;
  private endpoints!: LaunchEndpoints;
  private deps: SessionDeps;
  private ready = false;

  constructor(deps: SessionDeps) {
    this.deps = deps;
    this.emitName = generateEmitName();
    this.rdpFactory = deps.makeRdp;
  }

  async init(opts: SessionInitOpts): Promise<void> {
    if (opts.mode === 'launch') {
      this.endpoints = await this.deps.launcher.launch({});
    } else {
      if (!opts.bidiUrl || !opts.rdpPort) throw new Error('attach mode requires bidiUrl + rdpPort');
      this.endpoints = this.deps.launcher.attach({ bidiUrl: opts.bidiUrl, rdpPort: opts.rdpPort });
    }
    this.bidi = await this.deps.makeBidi(this.endpoints.bidiUrl);
    this.rdpPort = this.endpoints.rdpPort;
    this.ready = true;
  }

  async ensureRdp(): Promise<RdpDriver> {
    if (this.rdp) return this.rdp;
    if (!this.rdpPort || !this.rdpFactory) throw new BrowserNotReadyError('RDP factory unavailable');
    this.rdp = await this.rdpFactory(this.rdpPort);
    return this.rdp;
  }

  isReady(): boolean { return this.ready; }

  async shutdown(): Promise<void> {
    try { this.bidi?.close(); } catch {}
    try { this.rdp?.close(); } catch {}
    await this.deps.launcher.shutdown();
    this.ready = false;
  }
}
