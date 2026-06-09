// Stub capability container — concrete interfaces are filled in by their own tasks (M2/M3).
export interface Capabilities {
  scriptHost?: unknown;
  preloadInjector?: unknown;
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
