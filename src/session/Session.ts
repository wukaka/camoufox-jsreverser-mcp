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
  /** Spoofed UA, forwarded to launcher.launch when mode='launch'. */
  userAgentOverride?: string;
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
  xhrBreakpoints: Array<{ id: string; urlPattern: string; preloadId?: string }> = [];
  sessionSnapshots: Map<string, {
    name: string;
    capturedAt: number;
    cookies: object[];
    localByOrigin: Record<string, Record<string, string>>;
    sessionByOrigin: Record<string, Record<string, string>>;
  }> = new Map();
  activeMonitors: Map<string, { id: string; events: string[]; startedAt: number }> = new Map();
  activeWorkerRealmId: string | null = null;

  bidi!: BidiDriver;
  stealthApplyError: Error | null = null;
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
      this.endpoints = await this.deps.launcher.launch({
        ...(opts.userAgentOverride ? { userAgentOverride: opts.userAgentOverride } : {}),
      });
    } else {
      if (!opts.bidiUrl || !opts.rdpPort) throw new Error('attach mode requires bidiUrl + rdpPort');
      this.endpoints = this.deps.launcher.attach({ bidiUrl: opts.bidiUrl, rdpPort: opts.rdpPort });
    }
    this.bidi = await this.deps.makeBidi(this.endpoints.bidiUrl);
    this.rdpPort = this.endpoints.rdpPort;

    // Wire BiDi-side capabilities.
    const { makeScriptHost } = await import('../capabilities/scriptHost.js');
    const { makePreloadInjector } = await import('../capabilities/preloadInjector.js');
    const { makeStealth } = await import('../capabilities/stealth.js');
    const { makeAstAnalyzer } = await import('../capabilities/astAnalyzer.js');
    const { makeCryptoSignatures } = await import('../capabilities/cryptoSignatures.js');
    const { makeLlmProvider } = await import('../capabilities/llmProvider.js');
    const { makeTaskArtifacts } = await import('../capabilities/taskArtifacts.js');
    const { makeNetworkObserver } = await import('../capabilities/networkObserver.js');
    const { makeLogSink } = await import('../capabilities/logSink.js');
    const { makeStorageAccess } = await import('../capabilities/storageAccess.js');
    const { makePageController } = await import('../capabilities/pageController.js');
    const { makeDomAccess } = await import('../capabilities/domAccess.js');
    const { makeWsObserver } = await import('../capabilities/wsObserver.js');
    const { makeHookRegistry } = await import('../capabilities/hookRegistry.js');
    const { makeWorkerTopology } = await import('../capabilities/workerTopology.js');
    const { makeInitiatorTracer } = await import('../capabilities/initiatorTracer.js');
    const { makeRuntimePrefsStub } = await import('../capabilities/runtimePrefs.js');

    const scriptHost = makeScriptHost(this.bidi);
    this.caps.scriptHost = scriptHost;
    const preloadInjector = makePreloadInjector(this.bidi, scriptHost);
    this.caps.preloadInjector = preloadInjector;
    const stealth = makeStealth(preloadInjector);
    this.caps.stealth = stealth;
    this.caps.astAnalyzer = makeAstAnalyzer();
    this.caps.cryptoSignatures = makeCryptoSignatures();
    this.caps.llmProvider = makeLlmProvider();
    this.caps.taskArtifacts = makeTaskArtifacts();
    this.caps.networkObserver = makeNetworkObserver(this.bidi, this.requests);
    this.caps.logSink = makeLogSink(this.bidi, this.consoleRing);
    this.caps.storageAccess = makeStorageAccess(this.bidi, scriptHost);
    this.caps.pageController = makePageController(this.bidi);
    this.caps.domAccess = makeDomAccess(this.bidi, scriptHost);
    this.caps.wsObserver = makeWsObserver({
      bidi: this.bidi,
      dispatcher: this.dispatcher,
      table: this.wsTable,
      emitName: this.emitName,
    });
    const workerTopology = makeWorkerTopology(scriptHost);
    this.caps.workerTopology = workerTopology;
    this.caps.hookRegistry = makeHookRegistry({
      dispatcher: this.dispatcher,
      preload: preloadInjector,
      table: this.hooks,
      workers: workerTopology,
      emitName: this.emitName,
    });
    this.caps.initiatorTracer = makeInitiatorTracer();
    this.caps.runtimePrefs = makeRuntimePrefsStub();

    // Activate the BiDi event streams the capability handlers listen on. Capabilities
    // attach their own .on() listeners during construction; subscribe() here tells the
    // BiDi server which events to actually emit. log.entryAdded fuels logSink,
    // network.* fuels networkObserver, and network.beforeRequestSent is also how
    // wsObserver detects the WebSocket upgrade handshake.
    try {
      await this.bidi.subscribe([
        'log.entryAdded',
        'network.beforeRequestSent',
        'network.responseStarted',
        'network.responseCompleted',
        'network.fetchError',
        'browsingContext.contextCreated',
        'browsingContext.contextDestroyed',
        'browsingContext.navigationStarted',
        'browsingContext.load',
      ]);
    } catch {
      // Subscription failure should not block session init — caps just stay dormant.
    }

    if (opts.stealth === 'auto') {
      try {
        await stealth.applyPreset('firefox-default');
      } catch (err) {
        // Surface as warning but don't fail session.init — stealth is best-effort.
        // Caller can inspect this.stealthApplyError later.
        this.stealthApplyError = err as Error;
      }
    }

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
