import { describe, it, expect } from 'vitest';
import { ok, fail, isOk, ErrorReason } from '../../../src/server/result.js';

describe('ToolResult', () => {
  it('ok() wraps data', () => {
    const r = ok({ value: 1 });
    expect(r).toEqual({ ok: true, data: { value: 1 } });
    expect(isOk(r)).toBe(true);
  });

  it('fail() carries reason + hint + retriable', () => {
    const r = fail(ErrorReason.NotPaused, { hint: 'pause first', retriable: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(ErrorReason.NotPaused);
      expect(r.hint).toBe('pause first');
      expect(r.retriable).toBe(false);
    }
  });

  it('ErrorReason includes all spec reasons', () => {
    const required = [
      'bad_args', 'browser_not_ready', 'capability_unavailable', 'target_not_found',
      'not_paused', 'pause_context_lost', 'breakpoint_unresolved', 'resource_not_found',
      'script_not_collected_yet', 'firefox_protocol_error', 'firefox_disconnected',
      'llm_not_configured', 'llm_failed', 'ast_parse_failed',
      'worker_not_attached', 'worker_injection_delayed', 'prefs_actor_unavailable',
    ];
    for (const r of required) {
      expect(Object.values(ErrorReason)).toContain(r);
    }
  });
});
