import { describe, it, expect, vi } from 'vitest';
import { inject_stealth_to_workers } from '../../../../src/tools/stealth/inject_stealth_to_workers.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { StealthWorkersUnavailableError } from '../../../../src/capabilities/errors.js';

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    injected: ['r1'],
    failed: [],
    injectedAt: 'post-start' as const,
    watching: true,
    unwatch: vi.fn(),
    ...overrides,
  };
}

function makeSession(stealthOverride?: unknown) {
  const registerWorkerStealthUnsubscribe = vi.fn();
  const stealth = stealthOverride ?? {
    applyPresetToWorkers: vi.fn().mockResolvedValue(makeReport()),
  };
  return {
    session: {
      isReady: () => true,
      registerWorkerStealthUnsubscribe,
      caps: { stealth },
    } as any,
    registerWorkerStealthUnsubscribe,
    stealth,
  };
}

describe('inject_stealth_to_workers', () => {
  it('capability_unavailable when stealth missing', async () => {
    const { session } = makeSession(null);
    (session as any).caps = {};
    const r = await executeTool(inject_stealth_to_workers, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('capability_unavailable');
  });

  it('defaults — preset firefox-default + watch:true; registers unsubscribe', async () => {
    const { session, registerWorkerStealthUnsubscribe, stealth } = makeSession();
    const r = await executeTool(inject_stealth_to_workers, {}, session);
    expect(r.ok).toBe(true);
    expect((stealth as any).applyPresetToWorkers).toHaveBeenCalledWith('firefox-default', { watch: true });
    expect(registerWorkerStealthUnsubscribe).toHaveBeenCalledTimes(1);
    if (r.ok) {
      expect(r.data).toEqual({
        injected: ['r1'],
        failed: [],
        injectedAt: 'post-start',
        watching: true,
      });
    }
  });

  it('watch:false — does NOT register unsubscribe', async () => {
    const stealthOverride = {
      applyPresetToWorkers: vi.fn().mockResolvedValue(makeReport({ watching: false })),
    };
    const { session, registerWorkerStealthUnsubscribe } = makeSession(stealthOverride);
    const r = await executeTool(inject_stealth_to_workers, { preset: 'custom', watch: false }, session);
    expect(r.ok).toBe(true);
    expect(stealthOverride.applyPresetToWorkers).toHaveBeenCalledWith('custom', { watch: false });
    expect(registerWorkerStealthUnsubscribe).not.toHaveBeenCalled();
  });

  it('StealthWorkersUnavailableError → stealth_workers_unavailable', async () => {
    const stealthOverride = {
      applyPresetToWorkers: vi.fn().mockRejectedValue(new StealthWorkersUnavailableError()),
    };
    const { session } = makeSession(stealthOverride);
    const r = await executeTool(inject_stealth_to_workers, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('stealth_workers_unavailable');
  });

  it('unknown preset thrown by capability → bad_args', async () => {
    const stealthOverride = {
      applyPresetToWorkers: vi.fn().mockRejectedValue(new Error('stealth: unknown preset nope')),
    };
    const { session } = makeSession(stealthOverride);
    const r = await executeTool(inject_stealth_to_workers, { preset: 'nope' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });
});
