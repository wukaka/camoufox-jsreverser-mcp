import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { ScriptHost, PerformanceProbe } from '../../capabilities/types.js';

const METRICS_SCRIPT = `(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = performance.getEntriesByType('paint');
  const fp = paint.find(p => p.name === 'first-paint');
  const fcp = paint.find(p => p.name === 'first-contentful-paint');
  return {
    domContentLoaded: nav.domContentLoadedEventEnd,
    loadEvent: nav.loadEventEnd,
    navStart: nav.startTime,
    responseEnd: nav.responseEnd,
    firstPaint: fp ? fp.startTime : null,
    firstContentfulPaint: fcp ? fcp.startTime : null,
    transferSize: nav.transferSize,
    jsHeapUsed: performance.memory ? performance.memory.usedJSHeapSize : null,
  };
})()`;

export const get_performance_metrics = defineTool({
  name: 'get_performance_metrics',
  description: 'Get W3C performance metrics from the active page (navigation timing + paint). M3 adds engine-level metrics behind the same tool.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const sh = session.caps.scriptHost as ScriptHost;
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const realms = await sh.listRealms(ctxId);
    const realm = realms.find(r => r.type === 'window');
    if (!realm) return fail(ErrorReason.TargetNotFound, { hint: 'No window realm for active context.' });
    const r = await sh.evaluate(realm.realmId, METRICS_SCRIPT, { awaitPromise: false });
    const metrics = (r.result as { value?: Record<string, unknown> })?.value ?? {};

    // Merge engine-level metrics if performanceProbe is wired (M3).
    let engine: Record<string, unknown> | undefined;
    const probe = session.caps.performanceProbe as PerformanceProbe | undefined;
    if (probe) {
      engine = await probe.getEngineMetrics();
    }

    return ok({ metrics, engine, contextId: ctxId });
  },
});
