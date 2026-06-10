import { describe, it, expect, vi } from 'vitest';
import { inject_preload_script } from '../../../../src/tools/stealth/inject_preload_script.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('inject_preload_script', () => {
  it('delegates to stealth.injectCustomScript', async () => {
    const s = { injectCustomScript: vi.fn().mockResolvedValue({ preloadId: 'p1' }) };
    const session = { isReady: () => true, caps: { stealth: s } } as any;
    const r = await executeTool(inject_preload_script, { source: 'window.x = 1;' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.preloadId).toBe('p1');
    expect(s.injectCustomScript).toHaveBeenCalledWith('window.x = 1;');
  });

  it('capability_unavailable when stealth not wired', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(inject_preload_script, { source: 'x' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('capability_unavailable');
  });
});
