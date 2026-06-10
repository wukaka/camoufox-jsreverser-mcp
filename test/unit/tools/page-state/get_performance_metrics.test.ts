import { describe, it, expect, vi } from 'vitest';
import { get_performance_metrics } from '../../../../src/tools/page-state/get_performance_metrics.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('get_performance_metrics', () => {
  it('reads W3C performance.* via scriptHost.evaluate', async () => {
    const scriptHost = {
      evaluate: vi.fn().mockResolvedValue({
        result: { value: { domContentLoaded: 123.4, loadEvent: 456.7, navStart: 0 } },
      }),
      listRealms: vi.fn().mockResolvedValue([
        { realmId: 'r1', origin: 'https://a', type: 'window' },
      ]),
    };
    const session = { isReady: () => true, caps: { scriptHost }, activeContextId: 'c1' } as any;
    const r = await executeTool(get_performance_metrics, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.metrics.domContentLoaded).toBe(123.4);
  });

  it('returns target_not_found with no active context', async () => {
    const session = { isReady: () => true, caps: { scriptHost: {} }, activeContextId: null } as any;
    const r = await executeTool(get_performance_metrics, {}, session);
    expect(r.ok).toBe(false);
  });

  it('merges engine metrics when performanceProbe is wired', async () => {
    const scriptHost = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: { domContentLoaded: 1.2 } } }),
      listRealms: vi.fn().mockResolvedValue([{ realmId: 'r1', origin: 'https://a', type: 'window' }]),
    };
    const probe = {
      getEngineMetrics: vi.fn().mockResolvedValue({ memory: { usedJSHeapSize: 999 }, gcCount: 3 }),
    };
    const session = {
      isReady: () => true,
      caps: { scriptHost, performanceProbe: probe },
      activeContextId: 'c1',
    } as any;
    const r = await executeTool(get_performance_metrics, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.metrics.domContentLoaded).toBe(1.2);
      expect(r.data.engine).toBeDefined();
      expect((r.data.engine as any).memory.usedJSHeapSize).toBe(999);
    }
  });
});
