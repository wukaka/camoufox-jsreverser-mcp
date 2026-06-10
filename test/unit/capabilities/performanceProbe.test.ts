import { describe, it, expect, vi } from 'vitest';
import { makePerformanceProbe } from '../../../src/capabilities/performanceProbe.js';

describe('performanceProbe', () => {
  it('getEngineMetrics calls perf actor `metrics` and returns its body', async () => {
    const rdp = { call: vi.fn().mockResolvedValue({
      from: 'perf-1',
      memory: { usedJSHeapSize: 12345, totalJSHeapSize: 99999, jsHeapSizeLimit: 5e8 },
      runtime: { cpuUsage: 0.42 },
      gcCount: 7,
    }) } as any;
    const probe = makePerformanceProbe(rdp, 'perf-1');
    const m = await probe.getEngineMetrics();
    expect(rdp.call).toHaveBeenCalledWith('perf-1', { type: 'metrics' });
    expect(m.memory).toBeDefined();
    expect((m.memory as any).usedJSHeapSize).toBe(12345);
    expect(m.gcCount).toBe(7);
  });

  it('returns empty object when actor returns nothing useful', async () => {
    const rdp = { call: vi.fn().mockResolvedValue({ from: 'perf-1' }) } as any;
    const probe = makePerformanceProbe(rdp, 'perf-1');
    const m = await probe.getEngineMetrics();
    expect(m).toEqual({});
  });
});
