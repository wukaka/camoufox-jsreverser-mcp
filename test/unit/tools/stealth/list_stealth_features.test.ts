import { describe, it, expect, vi } from 'vitest';
import { list_stealth_features } from '../../../../src/tools/stealth/list_stealth_features.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_stealth_features', () => {
  it('returns capability feature list', async () => {
    const s = { listFeatures: vi.fn().mockReturnValue([{ name: 'a', description: 'A' }]) };
    const session = { isReady: () => true, caps: { stealth: s } } as any;
    const r = await executeTool(list_stealth_features, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.features).toHaveLength(1);
  });

  it('capability_unavailable when stealth not wired', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(list_stealth_features, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('capability_unavailable');
  });
});
