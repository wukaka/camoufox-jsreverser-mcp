import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { PreloadInjector } from '../../capabilities/types.js';

const schema = z.object({ id: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const remove_xhr_breakpoint = defineTool<Args, { id: string }>({
  name: 'remove_xhr_breakpoint',
  description: 'Remove an XHR/fetch breakpoint registered by break_on_xhr.',
  schema,
  handler: async ({ id }, session) => {
    const idx = session.xhrBreakpoints.findIndex(b => b.id === id);
    if (idx < 0) return fail(ErrorReason.ResourceNotFound, { details: { kind: 'xhrbp', id } });
    const [removed] = session.xhrBreakpoints.splice(idx, 1);
    if (removed?.preloadId) {
      const preload = session.caps.preloadInjector as PreloadInjector;
      try { await preload.remove(removed.preloadId); } catch { /* best-effort */ }
    }
    return ok({ id });
  },
});
