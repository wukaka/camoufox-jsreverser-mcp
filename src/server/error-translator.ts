import { ToolResult, ErrorReason, fail } from './result.js';
import {
  DriverDisconnectedError, DriverProtocolError, DriverTimeoutError,
} from '../drivers/errors.js';
import {
  CapabilityUnavailableError, NotPausedError, PauseContextLostError,
  BreakpointUnresolvedError, TargetNotFoundError, WorkerNotAttachedError,
  PrefsActorUnavailableError, LlmNotConfiguredError, LlmFailedError, AstParseFailedError,
} from '../capabilities/errors.js';
import {
  ResourceNotFoundError, ScriptNotCollectedYetError, BrowserNotReadyError,
} from '../session/errors.js';

export function translateError(err: Error): ToolResult<never> {
  if (err instanceof DriverDisconnectedError)
    return fail(ErrorReason.FirefoxDisconnected, { retriable: true,
      hint: 'Session has auto-reconnected; retry the call' });
  if (err instanceof DriverTimeoutError)
    return fail(ErrorReason.FirefoxDisconnected, { retriable: true,
      hint: `Timeout on ${err.method}; retry` });
  if (err instanceof DriverProtocolError)
    return fail(ErrorReason.FirefoxProtocolError, { details: { code: err.code, payload: err.payload } });

  if (err instanceof CapabilityUnavailableError)
    return fail(ErrorReason.CapabilityUnavailable, { hint: err.hint, details: { capability: err.capability } });
  if (err instanceof NotPausedError)
    return fail(ErrorReason.NotPaused, { hint: 'Pause the thread first (set a breakpoint or call pause)' });
  if (err instanceof PauseContextLostError)
    return fail(ErrorReason.PauseContextLost, { retriable: false,
      hint: 'Pause actor invalidated; re-pause and retry' });
  if (err instanceof BreakpointUnresolvedError)
    return fail(ErrorReason.BreakpointUnresolved, { hint: 'Source may be minified; prettify and retry',
      details: { reason: err.reason, extra: err.extra } });
  if (err instanceof TargetNotFoundError)
    return fail(ErrorReason.TargetNotFound, { details: { kind: err.kind, id: err.id } });
  if (err instanceof WorkerNotAttachedError)
    return fail(ErrorReason.WorkerNotAttached, { details: { workerId: err.workerId } });
  if (err instanceof PrefsActorUnavailableError)
    return fail(ErrorReason.PrefsActorUnavailable);
  if (err instanceof LlmNotConfiguredError)
    return fail(ErrorReason.LlmNotConfigured, { hint: 'Configure LLM_PROVIDER and credentials in .env' });
  if (err instanceof LlmFailedError)
    return fail(ErrorReason.LlmFailed, { retriable: true, details: { cause: String(err.cause) } });
  if (err instanceof AstParseFailedError)
    return fail(ErrorReason.AstParseFailed, { details: err.details });

  if (err instanceof ResourceNotFoundError)
    return fail(ErrorReason.ResourceNotFound, { details: { kind: err.kind, id: err.id } });
  if (err instanceof ScriptNotCollectedYetError)
    return fail(ErrorReason.ScriptNotCollectedYet, { hint: err.hint });
  if (err instanceof BrowserNotReadyError)
    return fail(ErrorReason.BrowserNotReady, { retriable: true });

  return fail(ErrorReason.FirefoxProtocolError, { details: { message: err.message, stack: err.stack } });
}
