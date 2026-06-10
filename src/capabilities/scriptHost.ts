import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { ScriptHost } from './types.js';

export function makeScriptHost(bidi: BidiDriver): ScriptHost {
  return {
    async listRealms(contextId) {
      const params = contextId ? { context: contextId } : {};
      const r = await bidi.send('script.getRealms', params) as {
        realms: Array<{ realm: string; origin: string; type: 'window' | 'worker' | 'service-worker' }>;
      };
      return r.realms.map(x => ({ realmId: x.realm, origin: x.origin, type: x.type }));
    },

    async evaluate(realmId, expression, opts = {}) {
      const r = await bidi.send('script.evaluate', {
        expression,
        target: { realm: realmId },
        awaitPromise: opts.awaitPromise ?? false,
      }) as { type: 'success' | 'exception'; result?: unknown; exceptionDetails?: unknown };
      return r.type === 'success'
        ? { result: r.result }
        : { result: undefined, exceptionDetails: r.exceptionDetails };
    },

    async callFunction(realmId, fn, args, opts = {}) {
      const r = await bidi.send('script.callFunction', {
        functionDeclaration: fn,
        target: { realm: realmId },
        arguments: args,
        awaitPromise: opts.awaitPromise ?? false,
      }) as { type: 'success' | 'exception'; result?: unknown; exceptionDetails?: unknown };
      return r.type === 'success'
        ? { result: r.result }
        : { result: undefined, exceptionDetails: r.exceptionDetails };
    },
  };
}
