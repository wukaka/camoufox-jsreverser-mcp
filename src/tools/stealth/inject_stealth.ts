import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { Stealth } from '../../capabilities/types.js';

const schema = z.object({
  preset: z.string().default('firefox-default'),
}).strict();
type Args = z.infer<typeof schema>;

export const inject_stealth = defineTool<Args, { preset: string; preloadIds: string[] }>({
  name: 'inject_stealth',
  description: 'Apply a stealth preset via BiDi preload. Default: firefox-default.',
  schema,
  handler: async ({ preset }, session) => {
    const s = session.caps.stealth as Stealth | undefined;
    if (!s) return fail(ErrorReason.CapabilityUnavailable, { details: { capability: 'stealth' } });
    const r = await s.applyPreset(preset);
    return ok(r);
  },
});
