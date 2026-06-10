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

export interface Capabilities {
  scriptHost?: ScriptHost;
  preloadInjector?: PreloadInjector;
  networkObserver?: NetworkObserver;
  wsObserver?: unknown;
  logSink?: LogSink;
  storageAccess?: unknown;
  pageController?: unknown;
  domAccess?: unknown;
  pauseController?: unknown;
  objectInspector?: unknown;
  eventMonitor?: unknown;
  performanceProbe?: unknown;
  initiatorTracer?: unknown;
  stealth?: unknown;
  sessionState?: unknown;
  hookRegistry?: unknown;
  workerTopology?: unknown;
  astAnalyzer?: unknown;
  cryptoSignatures?: unknown;
  llmProvider?: unknown;
  taskArtifacts?: unknown;
  runtimePrefs?: unknown;
}
