import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { Stealth } from '../../capabilities/types.js';

const schema = z.object({ source: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const inject_preload_script = defineTool<Args, { preloadId: string }>({
  name: 'inject_preload_script',
  description: 'Inject arbitrary preload JavaScript via BiDi script.addPreloadScript. Source runs before page scripts.',
  schema,
  handler: async ({ source }, session) => {
    const s = session.caps.stealth as Stealth | undefined;
    if (!s) return fail(ErrorReason.CapabilityUnavailable, { details: { capability: 'stealth' } });
    const r = await s.injectCustomScript(source);
    return ok(r);
  },
});
