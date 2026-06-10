import { describe, it, expect, vi } from 'vitest';
import { list_scripts } from '../../../../src/tools/scripts/list_scripts.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_scripts', () => {
  it('returns scripts from performance.getEntriesByType("resource") filtered by initiatorType', async () => {
    const sh = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: [
        { name: 'https://a/a.js', initiatorType: 'script', transferSize: 1024 },
        { name: 'https://a/b.js', initiatorType: 'script', transferSize: 2048 },
      ] } }),
      listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]),
    };
    const session = { isReady: () => true, caps: { scriptHost: sh }, activeContextId: 'c1' } as any;
    const r = await executeTool(list_scripts, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.scripts).toHaveLength(2);
      expect(r.data.scripts[0].url).toBe('https://a/a.js');
    }
  });

  it('target_not_found without active context', async () => {
    const session = { isReady: () => true, caps: { scriptHost: {} }, activeContextId: null } as any;
    const r = await executeTool(list_scripts, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target_not_found');
  });
});
