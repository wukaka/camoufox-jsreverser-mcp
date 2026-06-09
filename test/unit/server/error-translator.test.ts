import { describe, it, expect } from 'vitest';
import { translateError } from '../../../src/server/error-translator.js';
import { ErrorReason } from '../../../src/server/result.js';
import { DriverDisconnectedError, DriverProtocolError } from '../../../src/drivers/errors.js';
import {
  CapabilityUnavailableError, NotPausedError, PauseContextLostError,
  BreakpointUnresolvedError, PrefsActorUnavailableError, LlmNotConfiguredError,
  LlmFailedError, AstParseFailedError,
} from '../../../src/capabilities/errors.js';
import { ResourceNotFoundError, ScriptNotCollectedYetError, BrowserNotReadyError } from '../../../src/session/errors.js';

describe('translateError', () => {
  it.each([
    [new DriverDisconnectedError(), ErrorReason.FirefoxDisconnected, true],
    [new DriverProtocolError('weird', {}), ErrorReason.FirefoxProtocolError, false],
    [new CapabilityUnavailableError('pauseController'), ErrorReason.CapabilityUnavailable, false],
    [new NotPausedError(), ErrorReason.NotPaused, false],
    [new PauseContextLostError(), ErrorReason.PauseContextLost, false],
    [new BreakpointUnresolvedError('noScript'), ErrorReason.BreakpointUnresolved, false],
    [new PrefsActorUnavailableError(), ErrorReason.PrefsActorUnavailable, false],
    [new LlmNotConfiguredError(), ErrorReason.LlmNotConfigured, false],
    [new LlmFailedError(new Error('x')), ErrorReason.LlmFailed, true],
    [new AstParseFailedError({ line: 1 }), ErrorReason.AstParseFailed, false],
    [new ResourceNotFoundError('hookId', '1'), ErrorReason.ResourceNotFound, false],
    [new ScriptNotCollectedYetError('hint'), ErrorReason.ScriptNotCollectedYet, false],
    [new BrowserNotReadyError(), ErrorReason.BrowserNotReady, true],
  ])('translates %s', (err, expectedReason, expectedRetriable) => {
    const r = translateError(err as Error);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(expectedReason);
      expect(r.retriable ?? false).toBe(expectedRetriable);
    }
  });

  it('falls back to firefox_protocol_error for unknown error', () => {
    const r = translateError(new Error('mystery'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.FirefoxProtocolError);
  });
});
