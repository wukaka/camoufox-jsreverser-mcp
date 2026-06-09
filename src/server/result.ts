export enum ErrorReason {
  BadArgs = 'bad_args',
  BrowserNotReady = 'browser_not_ready',
  CapabilityUnavailable = 'capability_unavailable',
  TargetNotFound = 'target_not_found',
  NotPaused = 'not_paused',
  PauseContextLost = 'pause_context_lost',
  BreakpointUnresolved = 'breakpoint_unresolved',
  ResourceNotFound = 'resource_not_found',
  ScriptNotCollectedYet = 'script_not_collected_yet',
  FirefoxProtocolError = 'firefox_protocol_error',
  FirefoxDisconnected = 'firefox_disconnected',
  LlmNotConfigured = 'llm_not_configured',
  LlmFailed = 'llm_failed',
  AstParseFailed = 'ast_parse_failed',
  WorkerNotAttached = 'worker_not_attached',
  WorkerInjectionDelayed = 'worker_injection_delayed',
  PrefsActorUnavailable = 'prefs_actor_unavailable',
}

export interface ToolWarning { code: string; message: string }

export type ToolResult<T> =
  | { ok: true; data: T; warnings?: ToolWarning[] }
  | { ok: false; reason: ErrorReason; hint?: string; retriable?: boolean; details?: unknown };

export function ok<T>(data: T, warnings?: ToolWarning[]): ToolResult<T> {
  return warnings ? { ok: true, data, warnings } : { ok: true, data };
}

export function fail(
  reason: ErrorReason,
  opts: { hint?: string; retriable?: boolean; details?: unknown } = {},
): ToolResult<never> {
  return { ok: false, reason, ...opts };
}

export function isOk<T>(r: ToolResult<T>): r is { ok: true; data: T; warnings?: ToolWarning[] } {
  return r.ok;
}
