// Stub capability container — concrete interfaces are filled in by their own tasks (M2/M3).

export interface ScriptHost {
  listRealms(contextId?: string): Promise<Array<{ realmId: string; origin: string; type: 'window' | 'worker' | 'service-worker' }>>;
  evaluate(realmId: string, expression: string, opts?: { awaitPromise?: boolean }): Promise<{ result: unknown; exceptionDetails?: unknown }>;
  callFunction(realmId: string, fn: string, args: unknown[], opts?: { awaitPromise?: boolean }): Promise<{ result: unknown; exceptionDetails?: unknown }>;
}

export interface PreloadInjector {
  add(script: string, opts?: { contexts?: string[]; sandbox?: string }): Promise<string>;
  addToWorker(script: string, workerRealmId: string): Promise<{ injectedAt: 'pre-start' | 'post-start' }>;
  remove(preloadScriptId: string): Promise<void>;
}

export interface NetworkInterceptPhase {
  // BiDi InterceptPhase values
  // 'beforeRequestSent' | 'responseStarted' | 'authRequired'
}

export interface NetworkObserver {
  // commands
  addIntercept(params: { phases: string[]; urlPatterns?: object[]; contexts?: string[] }): Promise<string>;
  removeIntercept(interceptId: string): Promise<void>;
  continueRequest(params: { request: string; body?: object; cookies?: object[]; headers?: object[]; method?: string; url?: string }): Promise<void>;
  continueResponse(params: { request: string; cookies?: object[]; credentials?: object; headers?: object[]; reasonPhrase?: string; statusCode?: number }): Promise<void>;
  continueWithAuth(params: { request: string; action: 'default' | 'cancel' | 'provideCredentials'; credentials?: object }): Promise<void>;
  provideResponse(params: { request: string; body?: object; cookies?: object[]; headers?: object[]; reasonPhrase?: string; statusCode?: number }): Promise<void>;
  failRequest(params: { request: string }): Promise<void>;
  setCacheBehavior(params: { cacheBehavior: 'default' | 'bypass'; contexts?: string[] }): Promise<void>;
  setExtraHeaders(params: { headers: object[]; contexts?: string[] }): Promise<void>;
  addDataCollector(params: { dataTypes: string[]; maxEncodedDataSize: number; contexts?: string[]; userContexts?: string[] }): Promise<string>;
  disownData(params: { dataType: string; collector?: string; request: string }): Promise<void>;
  removeDataCollector(collectorId: string): Promise<void>;
  getData(params: { dataType: string; collector?: string; disown?: boolean; request: string }): Promise<{ bytes: { type: 'string' | 'base64'; value: string } }>;
}

export interface LogEntry {
  type: 'console' | 'javascript';
  level: 'debug' | 'info' | 'warn' | 'error' | string;
  text: string;
  timestamp: number;
  source?: string;
}

export interface LogSink {
  // subscribes BiDi log.entryAdded on construction; pushes into the ConsoleRing
  // no public commands — just acts as a sink
}

export interface StorageAccess {
  getCookies(params?: { filter?: object; partition?: object }): Promise<{ cookies: object[]; partitionKey?: object }>;
  setCookie(params: { cookie: object; partition?: object }): Promise<{ partitionKey?: object }>;
  deleteCookies(params?: { filter?: object; partition?: object }): Promise<{ partitionKey?: object }>;
  // localStorage / sessionStorage go through scriptHost.evaluate (M2.01)
  getLocalStorage(realmId: string): Promise<Record<string, string>>;
  setLocalStorage(realmId: string, key: string, value: string): Promise<void>;
  getSessionStorage(realmId: string): Promise<Record<string, string>>;
  // IndexedDB: queries db names and reads object stores via evaluate
  listIndexedDbNames(realmId: string): Promise<string[]>;
}

export interface BrowsingContextInfo {
  context: string;
  url: string;
  children?: BrowsingContextInfo[];
  parent?: string | null;
  userContext?: string;
  clientWindow?: string;
  originalOpener?: string | null;
}

export interface PageController {
  listContexts(): Promise<BrowsingContextInfo[]>;
  createPage(opts?: { url?: string; background?: boolean }): Promise<string>;
  closePage(contextId: string): Promise<void>;
  activate(contextId: string): Promise<void>;
  navigate(contextId: string, url: string, wait?: 'none' | 'interactive' | 'complete'): Promise<{ navigation: string | null; url: string }>;
  reload(contextId: string): Promise<void>;
  traverseHistory(contextId: string, delta: number): Promise<void>;
  screenshot(contextId: string, opts?: { format?: object; clip?: object }): Promise<{ data: string }>;
  print(contextId: string, opts?: object): Promise<{ data: string }>;
  setViewport(contextId: string, viewport: object | null): Promise<void>;
  handleUserPrompt(contextId: string, action: 'accept' | 'dismiss', userText?: string): Promise<void>;
}

export interface NodeRef {
  sharedId: string;
  backendNodeId?: string;
}

export interface DomAccess {
  query(contextId: string, selector: string): Promise<NodeRef[]>;
  click(contextId: string, sharedId: string): Promise<void>;
  /** v1: synthetic value assignment via scriptHost.evaluate. Real key events land in M3. */
  type(contextId: string, sharedId: string, text: string, opts?: { clearFirst?: boolean }): Promise<void>;
  /** v1: presence-only polling (visible check deferred to M3). */
  waitFor(contextId: string, selector: string, opts?: { timeoutMs?: number; state?: 'present' | 'visible' }): Promise<NodeRef>;
}

export interface WorkerInfo {
  realmId: string;
  type: 'worker' | 'service-worker';
  origin: string;
}

export interface WorkerTopology {
  /** M2: derives from scriptHost.listRealms(). M3 adds RDP target-watcher backing. */
  listWorkers(): Promise<WorkerInfo[]>;
  /** Subscribe to new-worker events. Returns unsubscribe function. */
  onWorkerAvailable(cb: (worker: WorkerInfo) => void): () => void;
}

export interface HookSpec {
  name: string;
  /** A JavaScript expression that evaluates to the function to be wrapped.
   *  Examples: "window.fetch", "XMLHttpRequest.prototype.send", "MyClass.prototype.doIt" */
  targetExpr: string;
  /** What to capture in each sample. */
  capture: Array<'args' | 'return' | 'stack' | 'this'>;
}

export interface HookSample {
  hookId: string;
  ts: number;
  args?: unknown[];
  ret?: unknown;
  threw?: string;
  stack?: string;
  thisArg?: unknown;
}

export interface InjectOpts {
  /** 'page' = main world preload; 'worker:<realmId>' = single worker; 'all-workers' = all known workers */
  target: 'page' | `worker:${string}` | 'all-workers';
}

export interface InjectResult {
  hookId: string;
  warnings: string[];
}

export interface HookRegistry {
  create(spec: HookSpec): { hookId: string; scriptPreview: string };
  inject(hookId: string, opts: InjectOpts): Promise<InjectResult>;
  read(hookId: string, opts?: { limit?: number; since?: number }): HookSample[];
  list(): Array<{ hookId: string; name: string; targetExpr: string; sampleCount: number; injected: boolean }>;
  remove(hookId: string): Promise<void>;
}

export interface RuntimePrefs {
  /** M3 wires real RDP PreferenceActor; M2 stub rejects with PrefsActorUnavailableError. */
  set(key: string, value: string | number | boolean): Promise<void>;
  get(key: string): Promise<string | number | boolean | null>;
  resetAll(): Promise<void>;
}

export interface WsFrame {
  ts: number;
  dir: 'in' | 'out';
  data: unknown;
  source: 'rdp' | 'preload-hook';
}

export interface WsConnectionInfo {
  targetId: string;
  wsid: string;
  url: string;
  frameCount: number;
  openedAt?: number;
  closedAt?: number;
}

export interface WsObserver {
  listConnections(filter?: { targetId?: string; urlSubstring?: string }): WsConnectionInfo[];
  getFrames(wsid: string, opts?: { limit?: number; dir?: 'in' | 'out'; since?: number }): WsFrame[];
  /** Returns the preload script source that hooks WebSocket.prototype to ship frames to dispatcher. Caller injects via preloadInjector. */
  installFrameHook(): string;
}

export interface BreakpointOptions {
  /** Width (in columns) of the acceptable hit window around the requested column.
   *  - undefined or 0 → accept whatever actualColumn we snapped to (CDP default).
   *  - > 0            → in the paused listener, auto-resume when frame.where.column
   *                     falls outside [requestedColumn - tolerance, requestedColumn + tolerance],
   *                     up to MAX_SKIPS internal retries before forcing accept. */
  columnTolerance?: number;
}

export interface BreakpointEntry {
  bpId: string;
  bpActor: string;
  sourceActor: string;
  sourceUrl: string;
  line: number;
  column?: number;
  requestedColumn?: number;
  actualLine?: number;
  actualColumn?: number;
  columnTolerance?: number;
}

export interface PauseInfo {
  threadActor: string;
  pauseActor: string;
  frameActor: string;
  why: { type: string; [k: string]: unknown };
  currentFrame: {
    where?: { source?: { url?: string }; line?: number; column?: number };
    [k: string]: unknown;
  };
}

export interface CallframeResult {
  value: unknown;
  exceptionDetails?: unknown;
}

export interface PauseController {
  attach(threadActor: string): Promise<void>;
  isAttached(): boolean;

  setBreakpointByLocation(
    sourceUrl: string, line: number, column?: number, opts?: BreakpointOptions,
  ): Promise<BreakpointEntry>;
  setBreakpointByText(
    text: string, sourceUrl?: string, opts?: BreakpointOptions,
  ): Promise<BreakpointEntry>;
  removeBreakpoint(bpId: string): Promise<void>;
  listBreakpoints(): BreakpointEntry[];

  pause(): Promise<void>;
  resume(): Promise<void>;
  stepOver(): Promise<void>;
  stepInto(): Promise<void>;
  stepOut(): Promise<void>;

  getPausedInfo(): PauseInfo | null;
  evaluateOnCallframe(expression: string): Promise<CallframeResult>;

  freezeCurrent(): Promise<void>;
  unfreezeCurrent(): Promise<void>;
}

export interface RdpGrip {
  type: 'object' | 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'symbol' | 'BigInt' | 'longString' | 'mapEntry';
  actor?: string;
  class?: string;
  preview?: unknown;
  value?: unknown;
  [k: string]: unknown;
}

export interface InspectedProperty {
  name: string;
  kind: 'data' | 'accessor' | 'safeGetter';
  value?: unknown;
  getter?: RdpGrip;
  setter?: RdpGrip;
  writable?: boolean;
  enumerable?: boolean;
  configurable?: boolean;
}

export interface ObjectInspection {
  actor: string;
  class: string;
  prototype: RdpGrip | null;
  properties: InspectedProperty[];
  internalSlots: Record<string, unknown>;
}

export interface ObjectInspector {
  inspect(grip: RdpGrip): { actor: string; class: string; preview: unknown };
  prototypeAndProperties(grip: RdpGrip): Promise<ObjectInspection>;
  getInternalSlots(grip: RdpGrip): Promise<Record<string, unknown>>;
  releasePauseGrips(pauseActor: string): void;
}

export interface MonitorRecord {
  monitorId: string;
  resourceTypes: string[];
  startedAt: number;
  collected: unknown[];
}

export interface EventMonitor {
  /** Start a monitor for given RDP resource types. Returns monitorId. */
  start(resourceTypes: string[]): Promise<{ monitorId: string }>;
  /** Stop and unwatch. */
  stop(monitorId: string): Promise<void>;
  list(): MonitorRecord[];
  get(monitorId: string): MonitorRecord | undefined;
}

export interface PerformanceProbe {
  getEngineMetrics(): Promise<Record<string, unknown>>;
}

export interface NormalizedStackFrame {
  scriptUrl: string;
  line: number;
  column: number;
  functionName?: string;
}

export interface NormalizedInitiator {
  type: 'script' | 'parser' | 'preflight' | 'preload' | 'other';
  request?: string;
  stack: NormalizedStackFrame[];
}

export interface InitiatorTracer {
  normalize(initiator: unknown): NormalizedInitiator;
}

export interface StealthFeature { name: string; description: string }
export interface StealthPreset { name: string; description: string; features: string[] }

export interface WorkerStealthInjection {
  /** Worker realmIds that successfully received the preset payload. */
  injected: string[];
  /** Workers we attempted but failed; reason is the underlying error message. */
  failed: { realmId: string; reason: string }[];
  /** When the injection ran relative to the worker's lifecycle. Always 'post-start'
   *  in this milestone — BiDi does not propagate addPreloadScript to worker realms,
   *  so the worker's prologue (including any early navigator.webdriver reads or
   *  Function.prototype.toString inspections) has already executed. */
  injectedAt: 'post-start';
  /** True when watching for new workers via workerTopology.onWorkerAvailable.
   *  In BiDi-only mode this stays true but the underlying subscription is a no-op. */
  watching: boolean;
  /** Stops the onWorkerAvailable subscription. No-op when watching is false or
   *  the underlying subscription was already a no-op. Idempotent. */
  unwatch: () => void;
}

export interface ApplyPresetToWorkersOpts {
  /** Default true: subscribe to workerTopology.onWorkerAvailable and inject the
   *  preset into every dedicated/shared worker that appears after the call. */
  watch?: boolean;
}

export interface Stealth {
  listFeatures(): StealthFeature[];
  listPresets(): StealthPreset[];
  applyPreset(presetName: string): Promise<{ preset: string; preloadIds: string[] }>;
  injectCustomScript(source: string): Promise<{ preloadId: string }>;
  applyPresetToWorkers(
    presetName: string,
    opts?: ApplyPresetToWorkersOpts,
  ): Promise<WorkerStealthInjection>;
}

export interface AstParseResult {
  ast: unknown;
  error?: { line: number; column: number; message: string };
}

export interface AstTransformResult {
  code: string;
  changed: boolean;
  analysis?: unknown;
}

export interface AstAnalyzer {
  parse(source: string): AstParseResult;
  runTransform(source: string, transformName: string): AstTransformResult;
  listTransforms(): string[];
}

export interface CryptoRule {
  name: string;
  detect(source: string): boolean;
}

export interface CryptoMatch {
  name: string;
  confidence: 'high';
}

export interface CryptoSignatures {
  detect(source: string): CryptoMatch[];
  listRules(): string[];
}

export interface LlmCallRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface LlmCallResponse {
  text: string;
  model: string;
  cached: boolean;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface LlmProvider {
  isConfigured(): boolean;
  providerName(): string | null;
  call(req: LlmCallRequest): Promise<LlmCallResponse>;
}

export interface TaskMeta {
  taskId: string;
  taskRoot: string;
  createdAt: number;
}

export interface TaskArtifacts {
  /** Filesystem root that contains tasks/<taskId>/. */
  artifactsRoot(): string;
  /** Create the directory layout for a new task; idempotent. */
  createTask(taskId: string): Promise<TaskMeta>;
  /** Append a chunk (auto newline for .jsonl). */
  write(taskId: string, relPath: string, content: string | Uint8Array): Promise<void>;
  /** Read file content; throws if absent. */
  read(taskId: string, relPath: string): Promise<string>;
  /** Existing task IDs in artifactsRoot/tasks. */
  listTasks(): Promise<string[]>;
  /** Returns the in-repo template directory (for documentation / scaffolding). */
  templateDir(): string;
  /** Resolves the absolute task directory; useful for tools that need to return paths. */
  taskRoot(taskId: string): string;
}

export interface StealthHookWrapSpec {
  /** Dotted global path to wrap, e.g. "window.fetch" or "XMLHttpRequest.prototype.open". */
  targetPath: string;
  /** Channel suffix appended to dispatcher messages so the consumer can multiplex. */
  channelName?: string;
  /** Sample fields to capture: 'args' | 'return' | 'this' | 'stack'. */
  capture?: Array<'args' | 'return' | 'this' | 'stack'>;
}

export interface StealthHookPreloadSpec {
  emitName: string;
  /** Wraps to install. Each renders an IIFE inside the same preload payload. */
  wraps?: StealthHookWrapSpec[];
  /** Whether to install the performance.now / Date.now smoother. */
  neutraliseTiming?: boolean;
  /** Soft cap on per-call hook latency credit when neutralising timing. */
  timingMaxGapMs?: number;
}

export interface StealthHook {
  /** Pure renderer: returns JS source ready for preloadInjector.add(). */
  renderPreload(spec: StealthHookPreloadSpec): string;
  /** Convenience renderer for a single wrap. */
  wrapNative(spec: StealthHookWrapSpec & { emitName: string }): string;
  /** Convenience renderer for the timing-smoother fragment. */
  neutraliseTiming(opts?: { maxGapMs?: number }): string;
}

export interface Capabilities {
  scriptHost?: ScriptHost;
  preloadInjector?: PreloadInjector;
  networkObserver?: NetworkObserver;
  wsObserver?: WsObserver;
  logSink?: LogSink;
  storageAccess?: StorageAccess;
  pageController?: PageController;
  domAccess?: DomAccess;
  pauseController?: PauseController;
  objectInspector?: ObjectInspector;
  eventMonitor?: EventMonitor;
  performanceProbe?: PerformanceProbe;
  initiatorTracer?: InitiatorTracer;
  stealth?: Stealth;
  sessionState?: unknown;
  hookRegistry?: HookRegistry;
  workerTopology?: WorkerTopology;
  astAnalyzer?: AstAnalyzer;
  cryptoSignatures?: CryptoSignatures;
  llmProvider?: LlmProvider;
  taskArtifacts?: TaskArtifacts;
  runtimePrefs?: RuntimePrefs;
  stealthHook?: StealthHook;
}
