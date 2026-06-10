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

export interface Capabilities {
  scriptHost?: ScriptHost;
  preloadInjector?: PreloadInjector;
  networkObserver?: unknown;
  wsObserver?: unknown;
  logSink?: unknown;
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
