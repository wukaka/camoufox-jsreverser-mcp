import { randomBytes } from 'node:crypto';
import { HookTable, HookEntry } from '../session/caches.js';
import { ChannelDispatcher } from '../session/dispatcher.js';
import { HookRegistry, HookSpec, HookSample, InjectOpts, InjectResult, PreloadInjector, WorkerTopology } from './types.js';

export interface HookRegistryDeps {
  table: HookTable;
  dispatcher: ChannelDispatcher;
  preload: PreloadInjector;
  workers: WorkerTopology;
  emitName: string;
}

/**
 * Render a JS template that wraps `targetExpr` with a Proxy capturing the
 * configured fields. Samples are shipped via `window[emitName]({ channel: 'hook', ... })`.
 *
 * Caveat: rebinding `targetExpr` to the wrapped value relies on JS property
 * descriptor semantics. For `window.x = wrapped` this works; for read-only
 * properties or accessors with no setter it silently leaves the original in
 * place. The hook still intercepts callers holding the wrapped Proxy reference,
 * but other call sites still hit the original. v1 documents this limitation;
 * M3 lands deeper patching strategies (e.g. Object.defineProperty overrides).
 */
function renderHookScript(emitName: string, hookId: string, spec: HookSpec): string {
  const captured = JSON.stringify(spec.capture);
  const emitNameJson = JSON.stringify(emitName);
  const hookIdJson = JSON.stringify(hookId);
  const targetExprJson = JSON.stringify(spec.targetExpr);
  return `(function(){
  var __emit = window[${emitNameJson}];
  if (typeof __emit !== 'function') return;
  var __orig;
  try { __orig = (function(){ return ${spec.targetExpr}; })(); } catch (e) { return; }
  if (typeof __orig !== 'function') return;
  var __captured = ${captured};
  var __replacement = new Proxy(__orig, {
    apply: function(t, thisArg, args) {
      var sample = { channel: 'hook', hookId: ${hookIdJson}, ts: Date.now() };
      if (__captured.indexOf('args') >= 0) sample.args = Array.prototype.slice.call(args);
      if (__captured.indexOf('stack') >= 0) sample.stack = (new Error()).stack;
      if (__captured.indexOf('this') >= 0) sample.thisArg = thisArg;
      var ret;
      try { ret = Reflect.apply(t, thisArg, args); }
      catch (e) { sample.threw = String(e); __emit(sample); throw e; }
      if (__captured.indexOf('return') >= 0) sample.ret = ret;
      __emit(sample);
      return ret;
    }
  });
  try {
    var __parts = ${targetExprJson}.split('.');
    var __obj = window;
    for (var i = 0; i < __parts.length - 1; i++) { __obj = __obj[__parts[i]]; }
    __obj[__parts[__parts.length - 1]] = __replacement;
  } catch (e) { /* read-only or non-configurable — best effort */ }
})();`;
}

export function makeHookRegistry(deps: HookRegistryDeps): HookRegistry {
  const { table, dispatcher, preload, workers, emitName } = deps;

  // Subscribe to hook samples ONCE on construction — never re-subscribe per create().
  dispatcher.on('hook', (payload) => {
    const hookId = payload['hookId'];
    if (typeof hookId !== 'string') return;
    const entry = table.get(hookId);
    if (!entry) return;
    entry.samples.push(payload as unknown as HookSample);
  });

  return {
    create(spec: HookSpec) {
      const hookId = `hook-${randomBytes(6).toString('hex')}`;
      const scriptPreview = renderHookScript(emitName, hookId, spec);
      const entry: HookEntry = {
        hookId,
        def: spec,
        workerInjections: [],
        samples: [],
      };
      table.put(entry);
      return { hookId, scriptPreview };
    },

    async inject(hookId: string, opts: InjectOpts): Promise<InjectResult> {
      const entry = table.get(hookId);
      if (!entry) throw new Error(`hookRegistry.inject: unknown hookId ${hookId}`);
      const script = renderHookScript(emitName, hookId, entry.def as HookSpec);
      const warnings: string[] = [];

      if (opts.target === 'page') {
        const preloadId = await preload.add(script);
        entry.preloadId = preloadId;
      } else if (opts.target === 'all-workers') {
        // List workers at injection time — NOT captured once at construction.
        const list = await workers.listWorkers();
        for (const w of list) {
          const r = await preload.addToWorker(script, w.realmId);
          entry.workerInjections.push(w.realmId);
          if (r.injectedAt === 'post-start') warnings.push('worker_injection_delayed');
        }
      } else {
        // 'worker:<realmId>'
        const realmId = opts.target.slice('worker:'.length);
        const r = await preload.addToWorker(script, realmId);
        entry.workerInjections.push(realmId);
        if (r.injectedAt === 'post-start') warnings.push('worker_injection_delayed');
      }
      table.put(entry);
      return { hookId, warnings: Array.from(new Set(warnings)) };
    },

    read(hookId: string, opts?: { limit?: number; since?: number }): HookSample[] {
      const entry = table.get(hookId);
      if (!entry) return [];
      let samples = entry.samples as HookSample[];
      if (opts?.since !== undefined) {
        const since = opts.since;
        samples = samples.filter(s => (s.ts ?? 0) >= since);
      }
      if (opts?.limit !== undefined) samples = samples.slice(0, opts.limit);
      return samples;
    },

    list() {
      return table.list().map(e => {
        const spec = e.def as HookSpec;
        return {
          hookId: e.hookId,
          name: spec.name,
          targetExpr: spec.targetExpr,
          sampleCount: e.samples.length,
          injected: e.preloadId !== undefined || e.workerInjections.length > 0,
        };
      });
    },

    async remove(hookId: string): Promise<void> {
      const entry = table.get(hookId);
      if (!entry) return;
      if (entry.preloadId) {
        try { await preload.remove(entry.preloadId); } catch { /* best effort */ }
      }
      // Worker injections: no remove API in v1; documented limitation.
      table.delete(hookId);
    },
  };
}
