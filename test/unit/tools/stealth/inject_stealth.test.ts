import { describe, it, expect, vi } from 'vitest';
import { inject_stealth } from '../../../../src/tools/stealth/inject_stealth.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('inject_stealth', () => {
  it('delegates to stealth.applyPreset with default firefox-default', async () => {
    const s = { applyPreset: vi.fn().mockResolvedValue({ preset: 'firefox-default', preloadIds: ['p1'] }) };
    const session = { isReady: () => true, caps: { stealth: s } } as any;
    const r = await executeTool(inject_stealth, {}, session);
    expect(r.ok).toBe(true);
    expect(s.applyPreset).toHaveBeenCalledWith('firefox-default');
  });

  it('capability_unavailable when stealth not wired', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(inject_stealth, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('capability_unavailable');
  });
});
