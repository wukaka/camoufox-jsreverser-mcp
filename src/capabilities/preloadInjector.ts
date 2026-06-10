import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { PreloadInjector, ScriptHost } from './types.js';

/**
 * Wrap raw source as an IIFE-shaped function declaration acceptable to
 * BiDi `script.addPreloadScript`. The BiDi spec requires
 * `functionDeclaration: string` — an arrow function or "function() {}".
 */
function wrapAsFunctionDeclaration(source: string): string {
  return `() => { ${source} }`;
}

export function makePreloadInjector(bidi: BidiDriver, scripts: ScriptHost): PreloadInjector {
  return {
    async add(script, opts) {
      const params: Record<string, unknown> = {
        functionDeclaration: wrapAsFunctionDeclaration(script),
      };
      if (opts?.contexts) params.contexts = opts.contexts;
      if (opts?.sandbox) params.sandbox = opts.sandbox;
      const r = await bidi.send('script.addPreloadScript', params) as { script: string };
      return r.script;
    },

    async addToWorker(script, workerRealmId) {
      // BiDi addPreloadScript doesn't dispatch to worker realms; eval in-place.
      const r = await scripts.callFunction(
        workerRealmId,
        wrapAsFunctionDeclaration(script),
        [],
        { awaitPromise: false },
      );
      if (r.exceptionDetails) {
        const text = (r.exceptionDetails as { text?: string }).text ?? 'unknown worker injection failure';
        throw new Error(`worker injection failed: ${text}`);
      }
      // Worker has already started by the time we inject — caller should treat
      // sample data from this hook as potentially missing the worker's prologue.
      return { injectedAt: 'post-start' };
    },

    async remove(preloadScriptId) {
      await bidi.send('script.removePreloadScript', { script: preloadScriptId });
    },
  };
}
