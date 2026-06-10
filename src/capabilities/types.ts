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
}

export interface RuntimePrefs {
  /** M3 wires real RDP PreferenceActor; M2 stub rejects with PrefsActorUnavailableError. */
  set(key: string, value: string | number | boolean): Promise<void>;
  get(key: string): Promise<string | number | boolean | null>;
  resetAll(): Promise<void>;
}

export interface Capabilities {
  scriptHost?: ScriptHost;
  preloadInjector?: PreloadInjector;
  networkObserver?: NetworkObserver;
  wsObserver?: unknown;
  logSink?: LogSink;
  storageAccess?: StorageAccess;
  pageController?: PageController;
  domAccess?: DomAccess;
  pauseController?: unknown;
  objectInspector?: unknown;
  eventMonitor?: unknown;
  performanceProbe?: unknown;
  initiatorTracer?: unknown;
  stealth?: unknown;
  sessionState?: unknown;
  hookRegistry?: unknown;
  workerTopology?: WorkerTopology;
  astAnalyzer?: unknown;
  cryptoSignatures?: unknown;
  llmProvider?: unknown;
  taskArtifacts?: unknown;
  runtimePrefs?: RuntimePrefs;
}
