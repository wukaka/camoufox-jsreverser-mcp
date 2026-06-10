import { describe, it, expect, vi } from 'vitest';
import { list_stealth_presets } from '../../../../src/tools/stealth/list_stealth_presets.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_stealth_presets', () => {
  it('returns capability preset list', async () => {
    const s = { listPresets: vi.fn().mockReturnValue([{ name: 'firefox-default', description: 'D', features: [] }]) };
    const session = { isReady: () => true, caps: { stealth: s } } as any;
    const r = await executeTool(list_stealth_presets, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.presets[0]?.name).toBe('firefox-default');
  });

  it('capability_unavailable when stealth not wired', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(list_stealth_presets, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('capability_unavailable');
  });
});
