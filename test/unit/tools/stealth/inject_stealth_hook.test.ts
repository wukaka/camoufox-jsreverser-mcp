import { describe, it, expect, vi } from 'vitest';
import { inject_stealth_hook } from '../../../../src/tools/stealth/inject_stealth_hook.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    isReady: () => true,
    emitName: '__emit_test',
    caps: {
      stealthHook: { renderPreload: vi.fn().mockReturnValue('/* rendered */') },
      stealth: { injectCustomScript: vi.fn().mockResolvedValue({ preloadId: 'p-1' }) },
      ...overrides,
    },
  } as any;
}

describe('inject_stealth_hook', () => {
  it('returns capability_unavailable when stealthHook is missing', async () => {
    const session = makeSession({ stealthHook: undefined });
    const r = await executeTool(inject_stealth_hook, { wraps: [{ targetPath: 'window.fetch' }] }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('capability_unavailable');
  });

  it('returns bad_args when both wraps and neutraliseTiming are empty/false', async () => {
    const session = makeSession();
    const r = await executeTool(inject_stealth_hook, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });

  it('wraps only — renders and injects', async () => {
    const session = makeSession();
    const r = await executeTool(
      inject_stealth_hook,
      { wraps: [{ targetPath: 'window.fetch', capture: ['args', 'return'] }] },
      session,
    );
    expect(r.ok).toBe(true);
    const sh = session.caps.stealthHook;
    expect(sh.renderPreload).toHaveBeenCalledWith({
      emitName: '__emit_test',
      wraps: [{ targetPath: 'window.fetch', capture: ['args', 'return'] }],
      neutraliseTiming: undefined,
      timingMaxGapMs: undefined,
    });
    expect(session.caps.stealth.injectCustomScript).toHaveBeenCalledWith('/* rendered */');
    if (r.ok) {
      expect(r.data).toEqual({ preloadId: 'p-1', wraps: 1, neutraliseTiming: false });
    }
  });

  it('neutraliseTiming only — renders and injects', async () => {
    const session = makeSession();
    const r = await executeTool(
      inject_stealth_hook,
      { neutraliseTiming: true, timingMaxGapMs: 32 },
      session,
    );
    expect(r.ok).toBe(true);
    expect(session.caps.stealthHook.renderPreload).toHaveBeenCalledWith({
      emitName: '__emit_test',
      wraps: undefined,
      neutraliseTiming: true,
      timingMaxGapMs: 32,
    });
    if (r.ok) {
      expect(r.data).toEqual({ preloadId: 'p-1', wraps: 0, neutraliseTiming: true });
    }
  });
});
