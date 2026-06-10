import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { PreloadInjector } from '../../capabilities/types.js';

function renderXhrBreakScript(id: string, pattern: string): string {
  return `(function(){
    var __pattern = ${JSON.stringify(pattern)};
    var __id = ${JSON.stringify(id)};
    var _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string' && url.indexOf(__pattern) >= 0) { debugger; }
      return _open.apply(this, arguments);
    };
    var _fetch = window.fetch;
    if (typeof _fetch === 'function') {
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf(__pattern) >= 0) { debugger; }
        return _fetch.apply(this, arguments);
      };
    }
  })();`;
}

const schema = z.object({ urlPattern: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const break_on_xhr = defineTool<Args, { id: string; urlPattern: string }>({
  name: 'break_on_xhr',
  description: 'Install a hook that issues `debugger;` when XHR/fetch URL matches the pattern. v1 fires only if DevTools is open; M3 RDP wires the actual debugger pause.',
  schema,
  handler: async ({ urlPattern }, session) => {
    const id = `xhrbp-${randomBytes(4).toString('hex')}`;
    const preload = session.caps.preloadInjector as PreloadInjector;
    const script = renderXhrBreakScript(id, urlPattern);
    const preloadId = await preload.add(script);
    session.xhrBreakpoints.push({ id, urlPattern, preloadId });
    return ok({ id, urlPattern });
  },
});
