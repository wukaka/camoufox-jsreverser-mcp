import { RdpDriver } from '../drivers/rdp/RdpDriver.js';
import { PerformanceProbe } from './types.js';

export function makePerformanceProbe(rdp: RdpDriver, perfActor: string): PerformanceProbe {
  return {
    async getEngineMetrics() {
      const reply = await rdp.call<Record<string, unknown>>(perfActor, { type: 'metrics' });
      // Strip protocol-level fields; return user-facing metrics.
      const { from: _from, ...rest } = reply as Record<string, unknown>;
      void _from;
      return rest;
    },
  };
}
